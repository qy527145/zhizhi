use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get},
};
use chrono::Utc;
use serde::Deserialize;

use super::access;
use crate::{
    error::{AppError, AppResult},
    models::{Label, Project, STATE_GROUPS, State as IssueState, new_id},
    session::AuthUser,
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/workspaces/{slug}/projects", get(list).post(create))
        .route("/projects/{id}", get(detail).patch(update).delete(remove))
        .route("/projects/{id}/states", get(states).post(create_state))
        .route("/projects/{id}/labels", get(labels).post(create_label))
        .route("/labels/{id}", delete(remove_label))
}

const DEFAULT_STATES: [(&str, &str, &str); 5] = [
    ("待规划", "backlog", "#a3a3a3"),
    ("待处理", "unstarted", "#737373"),
    ("进行中", "started", "#f59e0b"),
    ("已完成", "completed", "#16a34a"),
    ("已取消", "cancelled", "#ef4444"),
];

async fn list(
    State(s): State<AppState>,
    user: AuthUser,
    Path(slug): Path<String>,
) -> AppResult<Json<Vec<Project>>> {
    let ws = access::workspace_by_slug(&s.db, &slug, &user.id).await?;
    let rows = sqlx::query_as::<_, Project>(
        "SELECT id, workspace_id, name, identifier, description, created_at FROM projects
         WHERE workspace_id = ? ORDER BY created_at",
    )
    .bind(ws)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct CreateReq {
    name: String,
    identifier: String,
    #[serde(default)]
    description: String,
}

fn validate_identifier(id: &str) -> AppResult<String> {
    let id = id.trim().to_uppercase();
    if !(1..=8).contains(&id.len()) || !id.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(AppError::BadRequest("项目标识需为 1-8 位字母或数字".into()));
    }
    Ok(id)
}

async fn create(
    State(s): State<AppState>,
    user: AuthUser,
    Path(slug): Path<String>,
    Json(req): Json<CreateReq>,
) -> AppResult<Json<Project>> {
    let ws = access::workspace_by_slug(&s.db, &slug, &user.id).await?;
    let name = req.name.trim().to_owned();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(AppError::BadRequest(
            "项目名称长度需在 1-80 个字符之间".into(),
        ));
    }
    let p = Project {
        id: new_id(),
        workspace_id: ws,
        name,
        identifier: validate_identifier(&req.identifier)?,
        description: req.description,
        created_at: Utc::now(),
    };
    let mut tx = s.db.begin().await?;
    sqlx::query("INSERT INTO projects (id, workspace_id, name, identifier, description, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&p.id)
        .bind(&p.workspace_id)
        .bind(&p.name)
        .bind(&p.identifier)
        .bind(&p.description)
        .bind(p.created_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| match AppError::from(e) {
            AppError::Conflict(_) => AppError::Conflict("该项目标识已存在".into()),
            other => other,
        })?;
    for (i, (name, grp, color)) in DEFAULT_STATES.iter().enumerate() {
        sqlx::query("INSERT INTO states (id, project_id, name, grp, color, position) VALUES (?, ?, ?, ?, ?, ?)")
            .bind(new_id())
            .bind(&p.id)
            .bind(name)
            .bind(grp)
            .bind(color)
            .bind(f64::from(u32::try_from(i).expect("默认状态不超过 u32")) + 1.0)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(Json(p))
}

async fn fetch(db: &sqlx::SqlitePool, id: &str) -> AppResult<Project> {
    Ok(sqlx::query_as::<_, Project>(
        "SELECT id, workspace_id, name, identifier, description, created_at FROM projects WHERE id = ?",
    )
    .bind(id)
    .fetch_one(db)
    .await?)
}

async fn detail(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<Project>> {
    access::project(&s.db, &id, &user.id).await?;
    Ok(Json(fetch(&s.db, &id).await?))
}

#[derive(Deserialize)]
struct UpdateReq {
    name: Option<String>,
    description: Option<String>,
}

async fn update(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<UpdateReq>,
) -> AppResult<Json<Project>> {
    access::project(&s.db, &id, &user.id).await?;
    if let Some(name) = req.name.as_deref().map(str::trim) {
        if name.is_empty() {
            return Err(AppError::BadRequest("项目名称不能为空".into()));
        }
        sqlx::query("UPDATE projects SET name = ? WHERE id = ?")
            .bind(name)
            .bind(&id)
            .execute(&s.db)
            .await?;
    }
    if let Some(desc) = req.description {
        sqlx::query("UPDATE projects SET description = ? WHERE id = ?")
            .bind(desc)
            .bind(&id)
            .execute(&s.db)
            .await?;
    }
    Ok(Json(fetch(&s.db, &id).await?))
}

async fn remove(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    access::project(&s.db, &id, &user.id).await?;
    sqlx::query("DELETE FROM projects WHERE id = ?")
        .bind(&id)
        .execute(&s.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}

async fn states(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<Vec<IssueState>>> {
    access::project(&s.db, &id, &user.id).await?;
    let rows = sqlx::query_as::<_, IssueState>(
        "SELECT * FROM states WHERE project_id = ? ORDER BY position",
    )
    .bind(&id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct CreateStateReq {
    name: String,
    group: String,
    color: String,
}

async fn create_state(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<CreateStateReq>,
) -> AppResult<Json<IssueState>> {
    access::project(&s.db, &id, &user.id).await?;
    if !STATE_GROUPS.contains(&req.group.as_str()) {
        return Err(AppError::BadRequest("无效的状态分组".into()));
    }
    let name = req.name.trim().to_owned();
    if name.is_empty() {
        return Err(AppError::BadRequest("状态名称不能为空".into()));
    }
    let (max,): (Option<f64>,) =
        sqlx::query_as("SELECT MAX(position) FROM states WHERE project_id = ?")
            .bind(&id)
            .fetch_one(&s.db)
            .await?;
    let st = IssueState {
        id: new_id(),
        project_id: id,
        name,
        group: req.group,
        color: req.color,
        position: max.unwrap_or(0.0) + 1000.0,
    };
    sqlx::query(
        "INSERT INTO states (id, project_id, name, grp, color, position) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&st.id)
    .bind(&st.project_id)
    .bind(&st.name)
    .bind(&st.group)
    .bind(&st.color)
    .bind(st.position)
    .execute(&s.db)
    .await?;
    Ok(Json(st))
}

async fn labels(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<Json<Vec<Label>>> {
    access::project(&s.db, &id, &user.id).await?;
    let rows =
        sqlx::query_as::<_, Label>("SELECT * FROM labels WHERE project_id = ? ORDER BY name")
            .bind(&id)
            .fetch_all(&s.db)
            .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct CreateLabelReq {
    name: String,
    color: String,
}

async fn create_label(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<CreateLabelReq>,
) -> AppResult<Json<Label>> {
    access::project(&s.db, &id, &user.id).await?;
    let name = req.name.trim().to_owned();
    if name.is_empty() || name.chars().count() > 30 {
        return Err(AppError::BadRequest(
            "标签名称长度需在 1-30 个字符之间".into(),
        ));
    }
    let l = Label {
        id: new_id(),
        project_id: id,
        name,
        color: req.color,
    };
    sqlx::query("INSERT INTO labels (id, project_id, name, color) VALUES (?, ?, ?, ?)")
        .bind(&l.id)
        .bind(&l.project_id)
        .bind(&l.name)
        .bind(&l.color)
        .execute(&s.db)
        .await
        .map_err(|e| match AppError::from(e) {
            AppError::Conflict(_) => AppError::Conflict("标签已存在".into()),
            other => other,
        })?;
    Ok(Json(l))
}

async fn remove_label(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    let (project_id,): (String,) = sqlx::query_as("SELECT project_id FROM labels WHERE id = ?")
        .bind(&id)
        .fetch_optional(&s.db)
        .await?
        .ok_or(AppError::NotFound("标签"))?;
    access::project(&s.db, &project_id, &user.id).await?;
    sqlx::query("DELETE FROM labels WHERE id = ?")
        .bind(&id)
        .execute(&s.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
