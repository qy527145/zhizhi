use axum::{
    Json, Router,
    extract::State,
    routing::{get, post},
};
use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::{
    error::{AppError, AppResult},
    models::{User, new_id},
    session::{AuthUser, hash_password, verify_password},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/auth/register", post(register))
        .route("/auth/login", post(login))
        .route("/auth/me", get(me))
}

#[derive(Deserialize)]
struct RegisterReq {
    email: String,
    name: String,
    password: String,
}

#[derive(Deserialize)]
struct LoginReq {
    email: String,
    password: String,
}

#[derive(Serialize)]
struct AuthResp {
    token: String,
    user: User,
}

async fn register(
    State(s): State<AppState>,
    Json(req): Json<RegisterReq>,
) -> AppResult<Json<AuthResp>> {
    let email = req.email.trim().to_lowercase();
    let name = req.name.trim().to_owned();
    if !email.contains('@') || email.len() > 254 {
        return Err(AppError::BadRequest("邮箱格式不正确".into()));
    }
    if name.is_empty() || name.chars().count() > 50 {
        return Err(AppError::BadRequest("名称长度需在 1-50 个字符之间".into()));
    }
    if req.password.chars().count() < 8 {
        return Err(AppError::BadRequest("密码至少需要 8 位".into()));
    }
    let password = req.password;
    // Argon2 是 CPU 密集型运算，放到阻塞线程池避免卡住异步运行时。
    let hash = tokio::task::spawn_blocking(move || hash_password(&password))
        .await
        .map_err(crate::error::internal)??;

    let user = User {
        id: new_id(),
        email,
        name,
        created_at: Utc::now(),
    };
    sqlx::query(
        "INSERT INTO users (id, email, name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&user.id)
    .bind(&user.email)
    .bind(&user.name)
    .bind(&hash)
    .bind(user.created_at)
    .execute(&s.db)
    .await
    .map_err(|e| match AppError::from(e) {
        AppError::Conflict(_) => AppError::Conflict("该邮箱已注册".into()),
        other => other,
    })?;

    let token = s.jwt.issue(&user.id)?;
    Ok(Json(AuthResp { token, user }))
}

async fn login(State(s): State<AppState>, Json(req): Json<LoginReq>) -> AppResult<Json<AuthResp>> {
    let row: Option<(String, String, String, String, chrono::DateTime<Utc>)> = sqlx::query_as(
        "SELECT id, email, name, password_hash, created_at FROM users WHERE email = ?",
    )
    .bind(req.email.trim().to_lowercase())
    .fetch_optional(&s.db)
    .await?;
    let invalid = || AppError::BadRequest("邮箱或密码错误".into());
    let (id, email, name, hash, created_at) = row.ok_or_else(invalid)?;
    let password = req.password;
    let ok = tokio::task::spawn_blocking(move || verify_password(&password, &hash))
        .await
        .map_err(crate::error::internal)?;
    if !ok {
        return Err(invalid());
    }
    let token = s.jwt.issue(&id)?;
    Ok(Json(AuthResp {
        token,
        user: User {
            id,
            email,
            name,
            created_at,
        },
    }))
}

async fn me(State(s): State<AppState>, user: AuthUser) -> AppResult<Json<User>> {
    let u = sqlx::query_as::<_, User>("SELECT id, email, name, created_at FROM users WHERE id = ?")
        .bind(&user.id)
        .fetch_optional(&s.db)
        .await?
        .ok_or(AppError::Unauthorized)?;
    Ok(Json(u))
}
