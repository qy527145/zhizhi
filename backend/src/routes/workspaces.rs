use axum::{extract::{Path, State}, routing::get, Json, Router};
use chrono::Utc;
use serde::Deserialize;

use super::access;
use crate::{
    auth::AuthUser,
    error::{AppError, AppResult},
    models::{new_id, Member, Workspace},
    AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/workspaces", get(list).post(create))
        .route("/workspaces/{slug}", get(detail))
        .route("/workspaces/{slug}/members", get(members).post(add_member))
}

async fn list(State(s): State<AppState>, user: AuthUser) -> AppResult<Json<Vec<Workspace>>> {
    let rows = sqlx::query_as::<_, Workspace>(
        "SELECT w.* FROM workspaces w JOIN workspace_members m ON m.workspace_id = w.id
         WHERE m.user_id = ? ORDER BY w.created_at",
    )
    .bind(&user.id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct CreateReq {
    name: String,
    slug: String,
}

fn valid_slug(slug: &str) -> bool {
    (2..=48).contains(&slug.len())
        && slug.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && !slug.starts_with('-')
}

async fn create(State(s): State<AppState>, user: AuthUser, Json(req): Json<CreateReq>) -> AppResult<Json<Workspace>> {
    let name = req.name.trim().to_owned();
    let slug = req.slug.trim().to_lowercase();
    if name.is_empty() || name.chars().count() > 80 {
        return Err(AppError::BadRequest("工作区名称长度需在 1-80 个字符之间".into()));
    }
    if !valid_slug(&slug) {
        return Err(AppError::BadRequest("URL 标识只能包含小写字母、数字和连字符，长度 2-48".into()));
    }
    let ws = Workspace { id: new_id(), name, slug, owner_id: user.id.clone(), created_at: Utc::now() };
    let mut tx = s.db.begin().await?;
    sqlx::query("INSERT INTO workspaces (id, name, slug, owner_id, created_at) VALUES (?, ?, ?, ?, ?)")
        .bind(&ws.id)
        .bind(&ws.name)
        .bind(&ws.slug)
        .bind(&ws.owner_id)
        .bind(ws.created_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| match AppError::from(e) {
            AppError::Conflict(_) => AppError::Conflict("该 URL 标识已被占用".into()),
            other => other,
        })?;
    sqlx::query("INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, 'owner', ?)")
        .bind(&ws.id)
        .bind(&user.id)
        .bind(ws.created_at)
        .execute(&mut *tx)
        .await?;
    tx.commit().await?;
    Ok(Json(ws))
}

async fn detail(State(s): State<AppState>, user: AuthUser, Path(slug): Path<String>) -> AppResult<Json<Workspace>> {
    let id = access::workspace_by_slug(&s.db, &slug, &user.id).await?;
    let ws = sqlx::query_as::<_, Workspace>("SELECT * FROM workspaces WHERE id = ?")
        .bind(id)
        .fetch_one(&s.db)
        .await?;
    Ok(Json(ws))
}

async fn members(State(s): State<AppState>, user: AuthUser, Path(slug): Path<String>) -> AppResult<Json<Vec<Member>>> {
    let id = access::workspace_by_slug(&s.db, &slug, &user.id).await?;
    let rows = sqlx::query_as::<_, Member>(
        "SELECT u.id, u.email, u.name, m.role FROM workspace_members m JOIN users u ON u.id = m.user_id
         WHERE m.workspace_id = ? ORDER BY m.joined_at",
    )
    .bind(id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct AddMemberReq {
    email: String,
}

async fn add_member(
    State(s): State<AppState>,
    user: AuthUser,
    Path(slug): Path<String>,
    Json(req): Json<AddMemberReq>,
) -> AppResult<Json<Member>> {
    let ws_id = access::workspace_by_slug(&s.db, &slug, &user.id).await?;
    let (role,): (String,) = sqlx::query_as("SELECT role FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
        .bind(&ws_id)
        .bind(&user.id)
        .fetch_one(&s.db)
        .await?;
    if role != "owner" && role != "admin" {
        return Err(AppError::Forbidden);
    }
    let target: (String, String, String) = sqlx::query_as("SELECT id, email, name FROM users WHERE email = ?")
        .bind(req.email.trim().to_lowercase())
        .fetch_optional(&s.db)
        .await?
        .ok_or_else(|| AppError::BadRequest("该邮箱尚未注册".into()))?;
    sqlx::query("INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (?, ?, 'member', ?)")
        .bind(&ws_id)
        .bind(&target.0)
        .bind(Utc::now())
        .execute(&s.db)
        .await
        .map_err(|e| match AppError::from(e) {
            AppError::Conflict(_) => AppError::Conflict("该用户已是成员".into()),
            other => other,
        })?;
    Ok(Json(Member { id: target.0, email: target.1, name: target.2, role: "member".into() }))
}
