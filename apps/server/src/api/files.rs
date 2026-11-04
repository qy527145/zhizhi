use argon2::password_hash::rand_core::{OsRng, RngCore};
use axum::{
    Json, Router,
    extract::{DefaultBodyLimit, Multipart, Path, State},
    http::{StatusCode, header},
    response::IntoResponse,
    routing::{get, post},
};
use chrono::{Datelike, Utc};

use super::access;
use crate::{
    error::{AppError, AppResult, internal},
    models::Attachment,
    session::AuthUser,
    state::AppState,
};

pub const MAX_BYTES: usize = 20 * 1024 * 1024;

/// 白名单里没有 HTML / SVG，配合 nosniff，图片 inline 展示不会执行脚本。
const ALLOWED: &[&str] = &[
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "text/plain",
    "application/json",
    "application/zip",
];

/// 上传单独放宽 body 上限，其余接口保持 axum 默认的 2MB。
pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/workspaces/{slug}/files",
            post(upload).layer(DefaultBodyLimit::max(MAX_BYTES + 64 * 1024)),
        )
        .route("/files/{id}", get(download))
}

pub fn random_hex(len: usize) -> String {
    let mut bytes = vec![0u8; len];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

/// 按文件内容而不是客户端声明的类型判断 MIME。
fn sniff(data: &[u8]) -> Option<&'static str> {
    if let Some(kind) = infer::get(data) {
        return ALLOWED.iter().copied().find(|m| *m == kind.mime_type());
    }
    // infer 不识别纯文本：按 UTF-8 判断，并区分 JSON。
    let text = std::str::from_utf8(data).ok()?;
    if serde_json::from_str::<serde_json::Value>(text).is_ok() {
        Some("application/json")
    } else {
        Some("text/plain")
    }
}

async fn upload(
    State(s): State<AppState>,
    user: AuthUser,
    Path(slug): Path<String>,
    mut multipart: Multipart,
) -> AppResult<(StatusCode, Json<Attachment>)> {
    let ws = access::workspace_by_slug(&s.db, &slug, &user.id).await?;
    let field = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("上传数据无效：{e}")))?
        .ok_or_else(|| AppError::BadRequest("缺少 file 字段".into()))?;
    let filename = field
        .file_name()
        .map(|f| f.rsplit(['/', '\u{5c}']).next().unwrap_or(f).to_owned())
        .filter(|f| !f.is_empty())
        .unwrap_or_else(|| "file".into());
    let data = field
        .bytes()
        .await
        .map_err(|e| AppError::BadRequest(format!("上传失败：{e}")))?;
    if data.is_empty() || data.len() > MAX_BYTES {
        return Err(AppError::BadRequest(
            "文件大小需在 1 字节到 20MB 之间".into(),
        ));
    }
    let mime = sniff(&data).ok_or_else(|| AppError::BadRequest("不支持的文件类型".into()))?;

    let id = format!("ATT-{}", random_hex(12));
    let now = Utc::now();
    let key = format!(
        "{ws}/{:04}/{:02}/{}",
        now.year(),
        now.month(),
        random_hex(16)
    );
    let path = s.config.attachment_dir.join(&key);
    if let Some(dir) = path.parent() {
        tokio::fs::create_dir_all(dir).await.map_err(internal)?;
    }
    tokio::fs::write(&path, &data).await.map_err(internal)?;

    let size = i64::try_from(data.len()).unwrap_or(i64::MAX);
    sqlx::query(
        "INSERT INTO attachments (id, workspace_id, filename, mime, size_bytes, storage_key, uploaded_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&ws)
    .bind(&filename)
    .bind(mime)
    .bind(size)
    .bind(&key)
    .bind(&user.id)
    .bind(now)
    .execute(&s.db)
    .await?;

    Ok((
        StatusCode::CREATED,
        Json(Attachment {
            id,
            filename,
            mime: mime.into(),
            size_bytes: size,
            issue_id: None,
        }),
    ))
}

async fn download(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<impl IntoResponse> {
    let row: Option<(String, String, String, Option<String>)> = sqlx::query_as(
        "SELECT a.filename, a.mime, a.storage_key, m.user_id FROM attachments a
         LEFT JOIN workspace_members m ON m.workspace_id = a.workspace_id AND m.user_id = ?
         WHERE a.id = ?",
    )
    .bind(&user.id)
    .bind(&id)
    .fetch_optional(&s.db)
    .await?;
    let (filename, mime, key, member) = row.ok_or(AppError::NotFound("附件"))?;
    if member.is_none() {
        return Err(AppError::Forbidden);
    }
    let data = tokio::fs::read(s.config.attachment_dir.join(key))
        .await
        .map_err(|_| AppError::NotFound("附件"))?;
    let safe: String = filename
        .chars()
        .filter(|c| (c.is_ascii_graphic() && *c != '"' && *c != '\u{5c}') || *c == ' ')
        .collect();
    // 图片 inline，Web 端正文可直接显示；其余一律当附件下载。
    let disposition = if mime.starts_with("image/") {
        "inline"
    } else {
        "attachment"
    };
    Ok((
        [
            (header::CONTENT_TYPE, mime),
            (
                header::CONTENT_DISPOSITION,
                format!("{disposition}; filename=\"{safe}\""),
            ),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff".to_owned()),
            (header::CACHE_CONTROL, "private, max-age=3600".to_owned()),
        ],
        data,
    ))
}

/// 按出现顺序返回正文里 `](ATT-xxx)` 引用的附件 ID（已去重）。
pub fn attachment_refs(text: &str) -> Vec<String> {
    let mut out: Vec<String> = Vec::new();
    let mut from = 0;
    while let Some(pos) = text[from..].find("](ATT-") {
        let start = from + pos + 2;
        let rest = &text[start + 4..];
        let len = rest
            .find(|c: char| !c.is_ascii_alphanumeric())
            .unwrap_or(rest.len());
        if len > 0 && rest[len..].starts_with(')') {
            let id = text[start..start + 4 + len].to_owned();
            if !out.contains(&id) {
                out.push(id);
            }
        }
        from = start;
    }
    out
}

/// 把调用者刚上传、尚未使用的附件绑到任务上，并校验正文引用都属于这个任务。
/// 这样不会出现 Agent 或其他成员下载不到的悬空引用，也不能引用别的工作区的文件。
pub async fn attach(
    tx: &mut sqlx::SqliteConnection,
    workspace_id: &str,
    issue_id: &str,
    user_id: &str,
    ids: &[String],
    text: &str,
) -> AppResult<()> {
    for id in ids {
        let bound = sqlx::query(
            "UPDATE attachments SET issue_id = ?
             WHERE id = ? AND workspace_id = ? AND uploaded_by = ?
               AND (issue_id IS NULL OR issue_id = ?)",
        )
        .bind(issue_id)
        .bind(id)
        .bind(workspace_id)
        .bind(user_id)
        .bind(issue_id)
        .execute(&mut *tx)
        .await?
        .rows_affected();
        if bound == 0 {
            return Err(AppError::BadRequest(
                "附件不存在、已被其他任务使用，或不是你上传的".into(),
            ));
        }
    }
    for r in attachment_refs(text) {
        let found: Option<(i64,)> =
            sqlx::query_as("SELECT 1 FROM attachments WHERE id = ? AND issue_id = ?")
                .bind(&r)
                .bind(issue_id)
                .fetch_optional(&mut *tx)
                .await?;
        if found.is_none() {
            return Err(AppError::BadRequest(format!(
                "正文引用的附件 {r} 不属于该任务"
            )));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::attachment_refs;

    #[test]
    fn parses_refs_in_order_without_duplicates() {
        let t = "看图 ![弹窗](ATT-ab12) 和 [日志](ATT-cd34)，再看 ![](ATT-ab12) 与 [x](ATT-) [y](http://a)";
        assert_eq!(attachment_refs(t), vec!["ATT-ab12", "ATT-cd34"]);
    }

    #[test]
    fn ignores_unterminated_refs() {
        assert!(attachment_refs("![a](ATT-ab12").is_empty());
    }
}
