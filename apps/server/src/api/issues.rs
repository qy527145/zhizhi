use std::collections::HashMap;

use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::get,
};
use chrono::Utc;
use serde::{Deserialize, Deserializer};

use super::access;
use crate::{
    error::{AppError, AppResult},
    models::{Activity, Comment, Issue, PRIORITIES, new_id},
    session::AuthUser,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/projects/{id}/issues", get(list).post(create))
        .route("/workspaces/{slug}/my-issues", get(my_issues))
        .route("/issues/{id}", get(detail).patch(update).delete(remove))
        .route("/issues/{id}/comments", get(comments).post(create_comment))
        .route("/issues/{id}/activities", get(activities))
}

/// 区分 PATCH 请求中「字段缺省」与「显式置空」：缺省为 None，null 为 `Some(None)`。
///
/// 三态（缺省 / null / 值）无法用普通 `Option` 表达，因此这里刻意使用 `Option<Option<T>>`。
#[allow(clippy::option_option)]
fn nullable<'de, D, T>(d: D) -> Result<Option<Option<T>>, D::Error>
where
    D: Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<T>::deserialize(d).map(Some)
}

async fn attach_labels(db: &sqlx::SqlitePool, issues: &mut [Issue]) -> AppResult<()> {
    if issues.is_empty() {
        return Ok(());
    }
    let placeholders = vec!["?"; issues.len()].join(",");
    let sql =
        format!("SELECT issue_id, label_id FROM issue_labels WHERE issue_id IN ({placeholders})");
    let mut q = sqlx::query_as::<_, (String, String)>(&sql);
    for i in issues.iter() {
        q = q.bind(&i.id);
    }
    let mut map: HashMap<String, Vec<String>> = HashMap::new();
    for (issue_id, label_id) in q.fetch_all(db).await? {
        map.entry(issue_id).or_default().push(label_id);
    }
    for i in issues.iter_mut() {
        i.label_ids = map.remove(&i.id).unwrap_or_default();
    }
    Ok(())
}

async fn fetch(db: &sqlx::SqlitePool, id: &str) -> AppResult<Issue> {
    let mut issue = sqlx::query_as::<_, Issue>("SELECT * FROM issues WHERE id = ?")
        .bind(id)
        .fetch_optional(db)
        .await?
        .ok_or(AppError::NotFound("任务"))?;
    attach_labels(db, std::slice::from_mut(&mut issue)).await?;
    Ok(issue)
}

async fn list(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<Vec<Issue>>> {
    access::project(&s.db, &id, &user.id).await?;
    let mut rows =
        sqlx::query_as::<_, Issue>("SELECT * FROM issues WHERE project_id = ? ORDER BY sort_order")
            .bind(&id)
            .fetch_all(&s.db)
            .await?;
    attach_labels(&s.db, &mut rows).await?;
    Ok(Json(rows))
}

async fn my_issues(
    State(s): State<AppState>,
    user: AuthUser,
    Path(slug): Path<String>,
) -> AppResult<Json<Vec<Issue>>> {
    let ws = access::workspace_by_slug(&s.db, &slug, &user.id).await?;
    let mut rows = sqlx::query_as::<_, Issue>(
        "SELECT i.* FROM issues i JOIN projects p ON p.id = i.project_id
         WHERE p.workspace_id = ? AND i.assignee_id = ? ORDER BY i.updated_at DESC",
    )
    .bind(ws)
    .bind(&user.id)
    .fetch_all(&s.db)
    .await?;
    attach_labels(&s.db, &mut rows).await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct CreateReq {
    title: String,
    #[serde(default)]
    description: String,
    state_id: Option<String>,
    priority: Option<String>,
    assignee_id: Option<String>,
    due_date: Option<String>,
    #[serde(default)]
    label_ids: Vec<String>,
}

fn validate_title(t: &str) -> AppResult<String> {
    let t = t.trim();
    if t.is_empty() || t.chars().count() > 255 {
        return Err(AppError::BadRequest("标题长度需在 1-255 个字符之间".into()));
    }
    Ok(t.to_owned())
}

fn validate_priority(p: &str) -> AppResult<()> {
    if PRIORITIES.contains(&p) {
        Ok(())
    } else {
        Err(AppError::BadRequest("无效的优先级".into()))
    }
}

fn validate_date(d: &str) -> AppResult<()> {
    chrono::NaiveDate::parse_from_str(d, "%Y-%m-%d")
        .map(|_| ())
        .map_err(|_| AppError::BadRequest("日期格式应为 YYYY-MM-DD".into()))
}

async fn ensure_state(db: &sqlx::SqlitePool, project_id: &str, state_id: &str) -> AppResult<()> {
    let ok: Option<(i64,)> = sqlx::query_as("SELECT 1 FROM states WHERE id = ? AND project_id = ?")
        .bind(state_id)
        .bind(project_id)
        .fetch_optional(db)
        .await?;
    ok.map(|_| ())
        .ok_or_else(|| AppError::BadRequest("无效的状态".into()))
}

async fn set_labels(
    tx: &mut sqlx::SqliteConnection,
    project_id: &str,
    issue_id: &str,
    label_ids: &[String],
) -> AppResult<()> {
    sqlx::query("DELETE FROM issue_labels WHERE issue_id = ?")
        .bind(issue_id)
        .execute(&mut *tx)
        .await?;
    for lid in label_ids {
        let r = sqlx::query(
            "INSERT OR IGNORE INTO issue_labels (issue_id, label_id)
             SELECT ?, id FROM labels WHERE id = ? AND project_id = ?",
        )
        .bind(issue_id)
        .bind(lid)
        .bind(project_id)
        .execute(&mut *tx)
        .await?;
        if r.rows_affected() == 0 {
            return Err(AppError::BadRequest("无效的标签".into()));
        }
    }
    Ok(())
}

async fn create(
    State(s): State<AppState>,
    user: AuthUser,
    Path(project_id): Path<String>,
    Json(req): Json<CreateReq>,
) -> AppResult<Json<Issue>> {
    let ws = access::project(&s.db, &project_id, &user.id).await?;
    let title = validate_title(&req.title)?;
    let priority = req.priority.unwrap_or_else(|| "none".into());
    validate_priority(&priority)?;
    if let Some(d) = &req.due_date {
        validate_date(d)?;
    }
    if let Some(a) = &req.assignee_id {
        access::ensure_member(&s.db, &ws, a).await?;
    }
    let state_id = if let Some(sid) = req.state_id {
        ensure_state(&s.db, &project_id, &sid).await?;
        sid
    } else {
        // 未指定状态时落到项目里第一个「待处理」状态，没有则退回 backlog。
        let (sid,): (String,) = sqlx::query_as(
            "SELECT id FROM states WHERE project_id = ?
             ORDER BY CASE grp WHEN 'unstarted' THEN 0 WHEN 'backlog' THEN 1 ELSE 2 END, position LIMIT 1",
        )
        .bind(&project_id)
        .fetch_one(&s.db)
        .await?;
        sid
    };

    let id = new_id();
    let now = Utc::now();
    let mut tx = s.db.begin().await?;
    // 在事务内递增序号，保证同一项目下的任务编号（如 ZZ-12）唯一且连续。
    let (seq,): (i64,) = sqlx::query_as(
        "UPDATE projects SET issue_seq = issue_seq + 1 WHERE id = ? RETURNING issue_seq",
    )
    .bind(&project_id)
    .fetch_one(&mut *tx)
    .await?;
    let (min_sort,): (Option<f64>,) =
        sqlx::query_as("SELECT MIN(sort_order) FROM issues WHERE project_id = ?")
            .bind(&project_id)
            .fetch_one(&mut *tx)
            .await?;
    sqlx::query(
        "INSERT INTO issues (id, project_id, seq, title, description, state_id, priority, assignee_id,
                             due_date, sort_order, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&project_id)
    .bind(seq)
    .bind(&title)
    .bind(&req.description)
    .bind(&state_id)
    .bind(&priority)
    .bind(&req.assignee_id)
    .bind(&req.due_date)
    .bind(min_sort.unwrap_or(65536.0) - 1024.0)
    .bind(&user.id)
    .bind(now)
    .bind(now)
    .execute(&mut *tx)
    .await?;
    set_labels(&mut tx, &project_id, &id, &req.label_ids).await?;
    log_activity(&mut tx, &id, &user.id, "created", None, None).await?;
    tx.commit().await?;
    Ok(Json(fetch(&s.db, &id).await?))
}

async fn detail(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<Issue>> {
    access::issue(&s.db, &id, &user.id).await?;
    Ok(Json(fetch(&s.db, &id).await?))
}

/// PATCH 语义：字段缺省表示不修改，显式 `null` 表示清空。
/// `assignee_id` / `due_date` 需要这个三态，因此是 `Option<Option<T>>`。
#[derive(Deserialize)]
#[allow(clippy::option_option)]
struct UpdateReq {
    title: Option<String>,
    description: Option<String>,
    state_id: Option<String>,
    priority: Option<String>,
    #[serde(default, deserialize_with = "nullable")]
    assignee_id: Option<Option<String>>,
    #[serde(default, deserialize_with = "nullable")]
    due_date: Option<Option<String>>,
    label_ids: Option<Vec<String>>,
    sort_order: Option<f64>,
}

async fn log_activity(
    tx: &mut sqlx::SqliteConnection,
    issue_id: &str,
    actor: &str,
    field: &str,
    old: Option<&str>,
    new: Option<&str>,
) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO activities (id, issue_id, actor_id, field, old_value, new_value, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(new_id())
    .bind(issue_id)
    .bind(actor)
    .bind(field)
    .bind(old)
    .bind(new)
    .bind(Utc::now())
    .execute(&mut *tx)
    .await?;
    Ok(())
}

async fn update(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<UpdateReq>,
) -> AppResult<Json<Issue>> {
    let (project_id, ws) = access::issue(&s.db, &id, &user.id).await?;
    let cur = fetch(&s.db, &id).await?;

    // 先完成全部校验，再在单个事务里写入，避免部分更新。
    let title = req.title.as_deref().map(validate_title).transpose()?;
    if let Some(p) = &req.priority {
        validate_priority(p)?;
    }
    if let Some(sid) = &req.state_id {
        ensure_state(&s.db, &project_id, sid).await?;
    }
    if let Some(Some(a)) = &req.assignee_id {
        access::ensure_member(&s.db, &ws, a).await?;
    }
    if let Some(Some(d)) = &req.due_date {
        validate_date(d)?;
    }

    let mut tx = s.db.begin().await?;
    macro_rules! apply {
        ($col:literal, $new:expr, $old:expr, $log:expr) => {{
            let new_v: Option<String> = $new;
            let old_v: Option<String> = $old;
            if new_v != old_v {
                sqlx::query(concat!("UPDATE issues SET ", $col, " = ? WHERE id = ?"))
                    .bind(&new_v)
                    .bind(&id)
                    .execute(&mut *tx)
                    .await?;
                if $log {
                    log_activity(
                        &mut tx,
                        &id,
                        &user.id,
                        $col,
                        old_v.as_deref(),
                        new_v.as_deref(),
                    )
                    .await?;
                }
            }
        }};
    }
    if let Some(t) = title {
        apply!("title", Some(t), Some(cur.title.clone()), true);
    }
    if let Some(d) = req.description {
        apply!("description", Some(d), Some(cur.description.clone()), false);
    }
    if let Some(v) = req.state_id {
        apply!("state_id", Some(v), Some(cur.state_id.clone()), true);
    }
    if let Some(v) = req.priority {
        apply!("priority", Some(v), Some(cur.priority.clone()), true);
    }
    if let Some(v) = req.assignee_id {
        apply!("assignee_id", v, cur.assignee_id.clone(), true);
    }
    if let Some(v) = req.due_date {
        apply!("due_date", v, cur.due_date.clone(), true);
    }
    if let Some(v) = req.sort_order {
        sqlx::query("UPDATE issues SET sort_order = ? WHERE id = ?")
            .bind(v)
            .bind(&id)
            .execute(&mut *tx)
            .await?;
    }
    if let Some(labels) = req.label_ids {
        let mut old = cur.label_ids.clone();
        let mut new = labels.clone();
        old.sort();
        new.sort();
        if old != new {
            set_labels(&mut tx, &project_id, &id, &labels).await?;
            log_activity(&mut tx, &id, &user.id, "labels", None, None).await?;
        }
    }
    sqlx::query("UPDATE issues SET updated_at = ? WHERE id = ?")
        .bind(Utc::now())
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(fetch(&s.db, &id).await?))
}

async fn remove(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    access::issue(&s.db, &id, &user.id).await?;
    sqlx::query("DELETE FROM issues WHERE id = ?")
        .bind(&id)
        .execute(&s.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn comments(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<Vec<Comment>>> {
    access::issue(&s.db, &id, &user.id).await?;
    let rows = sqlx::query_as::<_, Comment>(
        "SELECT * FROM comments WHERE issue_id = ? ORDER BY created_at",
    )
    .bind(&id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct CommentReq {
    body: String,
}

async fn create_comment(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<CommentReq>,
) -> AppResult<Json<Comment>> {
    access::issue(&s.db, &id, &user.id).await?;
    let body = req.body.trim().to_owned();
    if body.is_empty() {
        return Err(AppError::BadRequest("评论内容不能为空".into()));
    }
    let c = Comment {
        id: new_id(),
        issue_id: id,
        author_id: user.id,
        body,
        created_at: Utc::now(),
    };
    sqlx::query(
        "INSERT INTO comments (id, issue_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&c.id)
    .bind(&c.issue_id)
    .bind(&c.author_id)
    .bind(&c.body)
    .bind(c.created_at)
    .execute(&s.db)
    .await?;
    Ok(Json(c))
}

async fn activities(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<Vec<Activity>>> {
    access::issue(&s.db, &id, &user.id).await?;
    let rows = sqlx::query_as::<_, Activity>(
        "SELECT * FROM activities WHERE issue_id = ? ORDER BY created_at",
    )
    .bind(&id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}
