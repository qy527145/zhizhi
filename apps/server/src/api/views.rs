use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{get, patch},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;

use super::access;
use crate::{
    error::{AppError, AppResult},
    models::new_id,
    session::AuthUser,
    state::AppState,
};

/// 保存的视图归属于「项目 + 用户」，只有创建者能看到和修改。
pub fn router() -> Router<AppState> {
    Router::new()
        .route("/projects/{id}/views", get(list).post(create))
        .route("/views/{id}", patch(update).delete(remove))
}

#[derive(Serialize, FromRow)]
struct SavedView {
    id: String,
    project_id: String,
    name: String,
    /// 前端定义的视图配置（视图类型、筛选、分组、排序），服务端只校验是 JSON 对象。
    #[sqlx(json)]
    config: serde_json::Value,
    position: f64,
    created_at: DateTime<Utc>,
}

fn validate(name: Option<&str>, config: Option<&serde_json::Value>) -> AppResult<()> {
    if let Some(n) = name {
        let n = n.trim();
        if n.is_empty() || n.chars().count() > 40 {
            return Err(AppError::BadRequest(
                "视图名称长度需在 1-40 个字符之间".into(),
            ));
        }
    }
    if let Some(c) = config
        && !c.is_object()
    {
        return Err(AppError::BadRequest("视图配置必须是 JSON 对象".into()));
    }
    Ok(())
}

async fn list(
    State(s): State<AppState>,
    user: AuthUser,
    Path(project_id): Path<String>,
) -> AppResult<Json<Vec<SavedView>>> {
    access::project(&s.db, &project_id, &user.id).await?;
    let rows = sqlx::query_as::<_, SavedView>(
        "SELECT id, project_id, name, config, position, created_at FROM saved_views
         WHERE project_id = ? AND user_id = ? ORDER BY position",
    )
    .bind(&project_id)
    .bind(&user.id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct CreateReq {
    name: String,
    config: serde_json::Value,
}

async fn create(
    State(s): State<AppState>,
    user: AuthUser,
    Path(project_id): Path<String>,
    Json(req): Json<CreateReq>,
) -> AppResult<Json<SavedView>> {
    access::project(&s.db, &project_id, &user.id).await?;
    validate(Some(&req.name), Some(&req.config))?;
    let (max,): (Option<f64>,) = sqlx::query_as(
        "SELECT MAX(position) FROM saved_views WHERE project_id = ? AND user_id = ?",
    )
    .bind(&project_id)
    .bind(&user.id)
    .fetch_one(&s.db)
    .await?;
    let v = SavedView {
        id: new_id(),
        project_id,
        name: req.name.trim().to_owned(),
        config: req.config,
        position: max.unwrap_or(0.0) + 1024.0,
        created_at: Utc::now(),
    };
    sqlx::query(
        "INSERT INTO saved_views (id, project_id, user_id, name, config, position, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&v.id)
    .bind(&v.project_id)
    .bind(&user.id)
    .bind(&v.name)
    .bind(v.config.to_string())
    .bind(v.position)
    .bind(v.created_at)
    .execute(&s.db)
    .await?;
    Ok(Json(v))
}

#[derive(Deserialize)]
struct UpdateReq {
    name: Option<String>,
    config: Option<serde_json::Value>,
}

async fn owned(db: &sqlx::SqlitePool, id: &str, user_id: &str) -> AppResult<()> {
    let row: Option<(i64,)> =
        sqlx::query_as("SELECT 1 FROM saved_views WHERE id = ? AND user_id = ?")
            .bind(id)
            .bind(user_id)
            .fetch_optional(db)
            .await?;
    row.map(|_| ()).ok_or(AppError::NotFound("视图"))
}

async fn update(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<UpdateReq>,
) -> AppResult<Json<SavedView>> {
    owned(&s.db, &id, &user.id).await?;
    validate(req.name.as_deref(), req.config.as_ref())?;
    if let Some(name) = &req.name {
        sqlx::query("UPDATE saved_views SET name = ? WHERE id = ?")
            .bind(name.trim())
            .bind(&id)
            .execute(&s.db)
            .await?;
    }
    if let Some(config) = &req.config {
        sqlx::query("UPDATE saved_views SET config = ? WHERE id = ?")
            .bind(config.to_string())
            .bind(&id)
            .execute(&s.db)
            .await?;
    }
    let v = sqlx::query_as::<_, SavedView>(
        "SELECT id, project_id, name, config, position, created_at FROM saved_views WHERE id = ?",
    )
    .bind(&id)
    .fetch_one(&s.db)
    .await?;
    Ok(Json(v))
}

async fn remove(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    owned(&s.db, &id, &user.id).await?;
    sqlx::query("DELETE FROM saved_views WHERE id = ?")
        .bind(&id)
        .execute(&s.db)
        .await?;
    Ok(StatusCode::NO_CONTENT)
}
