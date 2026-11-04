use std::collections::HashMap;

use axum::{
    Json, Router,
    extract::{Path, Query, State},
    http::StatusCode,
    routing::get,
};
use chrono::Utc;
use serde::{Deserialize, Deserializer};

use super::{access, files};
use crate::{
    error::{AppError, AppResult},
    models::{Activity, Attachment, Comment, Issue, PRIORITIES, new_id},
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
    attach_files(db, issues).await
}

async fn attach_files(db: &sqlx::SqlitePool, issues: &mut [Issue]) -> AppResult<()> {
    let placeholders = vec!["?"; issues.len()].join(",");
    let sql = format!(
        "SELECT id, filename, mime, size_bytes, issue_id FROM attachments
         WHERE issue_id IN ({placeholders}) ORDER BY created_at"
    );
    let mut q = sqlx::query_as::<_, Attachment>(&sql);
    for i in issues.iter() {
        q = q.bind(&i.id);
    }
    let mut map: HashMap<String, Vec<Attachment>> = HashMap::new();
    for a in q.fetch_all(db).await? {
        if let Some(issue_id) = a.issue_id.clone() {
            map.entry(issue_id).or_default().push(a);
        }
    }
    for i in issues.iter_mut() {
        i.attachments = map.remove(&i.id).unwrap_or_default();
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

/// 任务列表的过滤条件；多值用逗号分隔，Web 和 CLI 共用。
#[derive(Deserialize)]
struct ListQuery {
    state: Option<String>,
    priority: Option<String>,
    /// 成员 id，`none` 表示未指派，可与成员 id 混用。
    assignee: Option<String>,
    label: Option<String>,
    /// 标题或描述包含的关键字。
    q: Option<String>,
    due_before: Option<String>,
    due_after: Option<String>,
}

fn csv(v: Option<&str>) -> Vec<String> {
    v.map(|s| {
        s.split(',')
            .map(str::trim)
            .filter(|x| !x.is_empty())
            .map(str::to_owned)
            .collect()
    })
    .unwrap_or_default()
}

fn push_in(qb: &mut sqlx::QueryBuilder<'_, sqlx::Sqlite>, column: &str, values: Vec<String>) {
    qb.push(format!(" AND {column} IN ("));
    let mut sep = qb.separated(", ");
    for v in values {
        sep.push_bind(v);
    }
    sep.push_unseparated(")");
}

async fn list(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Query(f): Query<ListQuery>,
) -> AppResult<Json<Vec<Issue>>> {
    access::project(&s.db, &id, &user.id).await?;
    let mut qb =
        sqlx::QueryBuilder::<sqlx::Sqlite>::new("SELECT * FROM issues WHERE project_id = ");
    qb.push_bind(id);

    let states = csv(f.state.as_deref());
    if !states.is_empty() {
        push_in(&mut qb, "state_id", states);
    }
    let priorities = csv(f.priority.as_deref());
    for p in &priorities {
        validate_priority(p)?;
    }
    if !priorities.is_empty() {
        push_in(&mut qb, "priority", priorities);
    }
    let assignees = csv(f.assignee.as_deref());
    if !assignees.is_empty() {
        let none = assignees.iter().any(|a| a == "none");
        let ids: Vec<String> = assignees.into_iter().filter(|a| a != "none").collect();
        qb.push(" AND (");
        if none {
            qb.push("assignee_id IS NULL");
        }
        if !ids.is_empty() {
            if none {
                qb.push(" OR ");
            }
            qb.push("assignee_id IN (");
            let mut sep = qb.separated(", ");
            for v in ids {
                sep.push_bind(v);
            }
            sep.push_unseparated(")");
        }
        qb.push(")");
    }
    let labels = csv(f.label.as_deref());
    if !labels.is_empty() {
        qb.push(" AND id IN (SELECT issue_id FROM issue_labels WHERE label_id IN (");
        let mut sep = qb.separated(", ");
        for v in labels {
            sep.push_bind(v);
        }
        sep.push_unseparated("))");
    }
    if let Some(q) = f.q.as_deref().map(str::trim).filter(|q| !q.is_empty()) {
        let like = format!("%{q}%");
        qb.push(" AND (title LIKE ")
            .push_bind(like.clone())
            .push(" OR description LIKE ")
            .push_bind(like)
            .push(")");
    }
    if let Some(d) = f.due_before.as_deref() {
        validate_date(d)?;
        qb.push(" AND due_date <= ").push_bind(d.to_owned());
    }
    if let Some(d) = f.due_after.as_deref() {
        validate_date(d)?;
        qb.push(" AND due_date >= ").push_bind(d.to_owned());
    }
    qb.push(" ORDER BY sort_order");

    let mut rows = qb.build_query_as::<Issue>().fetch_all(&s.db).await?;
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
    start_date: Option<String>,
    #[serde(default)]
    label_ids: Vec<String>,
    /// 先上传得到的附件 id；正文里用 `![说明](ATT-xxx)` 引用。
    #[serde(default)]
    attachment_ids: Vec<String>,
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

/// 开始日期不能晚于截止日期。
fn validate_range(start: Option<&str>, due: Option<&str>) -> AppResult<()> {
    if let (Some(s), Some(d)) = (start, due) {
        let parse = |v: &str| chrono::NaiveDate::parse_from_str(v, "%Y-%m-%d");
        if let (Ok(s), Ok(d)) = (parse(s), parse(d))
            && s > d
        {
            return Err(AppError::BadRequest("开始日期不能晚于截止日期".into()));
        }
    }
    Ok(())
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
    if let Some(d) = &req.start_date {
        validate_date(d)?;
    }
    validate_range(req.start_date.as_deref(), req.due_date.as_deref())?;
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
                             due_date, start_date, sort_order, created_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
    .bind(&req.start_date)
    .bind(min_sort.unwrap_or(65536.0) - 1024.0)
    .bind(&user.id)
    .bind(now)
    .bind(now)
    .execute(&mut *tx)
    .await?;
    set_labels(&mut tx, &project_id, &id, &req.label_ids).await?;
    files::attach(
        &mut tx,
        &ws,
        &id,
        &user.id,
        &req.attachment_ids,
        &req.description,
    )
    .await?;
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
    #[serde(default, deserialize_with = "nullable")]
    start_date: Option<Option<String>>,
    label_ids: Option<Vec<String>>,
    attachment_ids: Option<Vec<String>>,
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

/// 更新前的全部校验，保证后面在单个事务里写入时不会部分失败。返回规范化后的标题。
async fn validate_update(
    db: &sqlx::SqlitePool,
    project_id: &str,
    ws: &str,
    cur: &Issue,
    req: &UpdateReq,
) -> AppResult<Option<String>> {
    let title = req.title.as_deref().map(validate_title).transpose()?;
    if let Some(p) = &req.priority {
        validate_priority(p)?;
    }
    if let Some(sid) = &req.state_id {
        ensure_state(db, project_id, sid).await?;
    }
    if let Some(Some(a)) = &req.assignee_id {
        access::ensure_member(db, ws, a).await?;
    }
    for d in [&req.due_date, &req.start_date]
        .into_iter()
        .flatten()
        .flatten()
    {
        validate_date(d)?;
    }
    // 只改其中一个日期时，要和另一个的现值比较。
    let start = req
        .start_date
        .clone()
        .unwrap_or_else(|| cur.start_date.clone());
    let due = req.due_date.clone().unwrap_or_else(|| cur.due_date.clone());
    validate_range(start.as_deref(), due.as_deref())?;
    Ok(title)
}

async fn update(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<UpdateReq>,
) -> AppResult<Json<Issue>> {
    let (project_id, ws) = access::issue(&s.db, &id, &user.id).await?;
    let cur = fetch(&s.db, &id).await?;
    let title = validate_update(&s.db, &project_id, &ws, &cur, &req).await?;
    let touches_files = req.description.is_some() || req.attachment_ids.is_some();
    let final_desc = req
        .description
        .clone()
        .unwrap_or_else(|| cur.description.clone());

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
    if let Some(v) = req.start_date {
        apply!("start_date", v, cur.start_date.clone(), true);
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
    if touches_files {
        files::attach(
            &mut tx,
            &ws,
            &id,
            &user.id,
            req.attachment_ids.as_deref().unwrap_or(&[]),
            &final_desc,
        )
        .await?;
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
    // 附件行随任务一起删除，磁盘文件在事务提交后尽力清理。
    let keys: Vec<(String,)> =
        sqlx::query_as("SELECT storage_key FROM attachments WHERE issue_id = ?")
            .bind(&id)
            .fetch_all(&s.db)
            .await?;
    let mut tx = s.db.begin().await?;
    sqlx::query("DELETE FROM attachments WHERE issue_id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM issues WHERE id = ?")
        .bind(&id)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    for (key,) in keys {
        let _ = tokio::fs::remove_file(s.config.attachment_dir.join(key)).await;
    }
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
    /// 评论里新上传的附件，同样绑定到任务上。
    #[serde(default)]
    attachment_ids: Vec<String>,
}

async fn create_comment(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<CommentReq>,
) -> AppResult<Json<Comment>> {
    let (_, ws) = access::issue(&s.db, &id, &user.id).await?;
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
    let mut tx = s.db.begin().await?;
    files::attach(
        &mut tx,
        &ws,
        &c.issue_id,
        &c.author_id,
        &req.attachment_ids,
        &c.body,
    )
    .await?;
    sqlx::query(
        "INSERT INTO comments (id, issue_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&c.id)
    .bind(&c.issue_id)
    .bind(&c.author_id)
    .bind(&c.body)
    .bind(c.created_at)
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
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
