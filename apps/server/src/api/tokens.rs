use argon2::password_hash::rand_core::{OsRng, RngCore};
use axum::{
    Json, Router,
    extract::{Path, State},
    http::StatusCode,
    routing::{delete, get},
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

use crate::{
    error::{AppError, AppResult},
    models::{ApiToken, new_id},
    session::{AuthUser, TOKEN_PREFIX, hash_token},
    state::AppState,
};

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/tokens", get(list).post(create))
        .route("/tokens/{id}", delete(revoke))
}

/// 令牌只能由登录会话（JWT）管理，避免一个泄露的令牌继续繁殖新令牌。
fn require_session(user: &AuthUser) -> AppResult<()> {
    if user.via_token {
        Err(AppError::Forbidden)
    } else {
        Ok(())
    }
}

async fn list(State(s): State<AppState>, user: AuthUser) -> AppResult<Json<Vec<ApiToken>>> {
    require_session(&user)?;
    let rows = sqlx::query_as::<_, ApiToken>(
        "SELECT id, name, prefix, last_used_at, created_at FROM api_tokens
         WHERE user_id = ? AND revoked_at IS NULL ORDER BY created_at DESC",
    )
    .bind(&user.id)
    .fetch_all(&s.db)
    .await?;
    Ok(Json(rows))
}

#[derive(Deserialize)]
struct CreateReq {
    name: String,
}

#[derive(Serialize)]
struct CreatedToken {
    id: String,
    name: String,
    prefix: String,
    /// 明文令牌，只在创建时返回这一次。
    token: String,
    created_at: DateTime<Utc>,
}

async fn create(
    State(s): State<AppState>,
    user: AuthUser,
    Json(req): Json<CreateReq>,
) -> AppResult<Json<CreatedToken>> {
    require_session(&user)?;
    let name = req.name.trim().to_owned();
    if name.is_empty() || name.chars().count() > 40 {
        return Err(AppError::BadRequest(
            "令牌名称长度需在 1-40 个字符之间".into(),
        ));
    }
    let mut bytes = [0u8; 24];
    OsRng.fill_bytes(&mut bytes);
    let token = format!("{TOKEN_PREFIX}{}", hex::encode(bytes));
    let created = CreatedToken {
        id: new_id(),
        name,
        prefix: token.chars().take(8).collect(),
        token,
        created_at: Utc::now(),
    };
    sqlx::query(
        "INSERT INTO api_tokens (id, user_id, name, token_hash, prefix, created_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&created.id)
    .bind(&user.id)
    .bind(&created.name)
    .bind(hash_token(&created.token))
    .bind(&created.prefix)
    .bind(created.created_at)
    .execute(&s.db)
    .await?;
    Ok(Json(created))
}

async fn revoke(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
) -> AppResult<StatusCode> {
    require_session(&user)?;
    let done = sqlx::query(
        "UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL",
    )
    .bind(Utc::now())
    .bind(&id)
    .bind(&user.id)
    .execute(&s.db)
    .await?;
    if done.rows_affected() == 0 {
        return Err(AppError::NotFound("令牌"));
    }
    Ok(StatusCode::NO_CONTENT)
}
