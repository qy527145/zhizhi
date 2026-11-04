use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString, rand_core::OsRng},
};
use axum::{extract::FromRequestParts, http::request::Parts};
use chrono::Utc;
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult, internal};
use crate::state::AppState;

const TOKEN_TTL_SECS: i64 = 60 * 60 * 24 * 7;

#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    exp: i64,
    iat: i64,
}

pub struct JwtKeys {
    enc: EncodingKey,
    dec: DecodingKey,
}

impl JwtKeys {
    pub fn new(secret: &[u8]) -> Self {
        Self {
            enc: EncodingKey::from_secret(secret),
            dec: DecodingKey::from_secret(secret),
        }
    }

    pub fn issue(&self, user_id: &str) -> AppResult<String> {
        let now = Utc::now().timestamp();
        let claims = Claims {
            sub: user_id.to_owned(),
            iat: now,
            exp: now + TOKEN_TTL_SECS,
        };
        encode(&Header::default(), &claims, &self.enc).map_err(internal)
    }

    fn verify(&self, token: &str) -> AppResult<String> {
        decode::<Claims>(token, &self.dec, &Validation::default())
            .map(|d| d.claims.sub)
            .map_err(|_| AppError::Unauthorized)
    }
}

pub fn hash_password(password: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(internal)
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash).is_ok_and(|parsed| {
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok()
    })
}

/// 已认证用户。作为 handler 参数即要求请求携带有效的 Bearer Token。
pub struct AuthUser {
    pub id: String,
    /// 是否通过个人访问令牌认证；令牌不能用来管理令牌。
    pub via_token: bool,
}

/// 个人访问令牌的固定前缀，用来和 JWT 区分。
pub const TOKEN_PREFIX: &str = "zhz_";

/// 令牌只存哈希，库泄露也无法还原明文。
pub fn hash_token(token: &str) -> String {
    use sha2::{Digest, Sha256};
    hex::encode(Sha256::digest(token.as_bytes()))
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &AppState,
    ) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(AppError::Unauthorized)?;
        if token.starts_with(TOKEN_PREFIX) {
            let row: Option<(String, String)> = sqlx::query_as(
                "SELECT id, user_id FROM api_tokens WHERE token_hash = ? AND revoked_at IS NULL",
            )
            .bind(hash_token(token))
            .fetch_optional(&state.db)
            .await?;
            let (token_id, user_id) = row.ok_or(AppError::Unauthorized)?;
            sqlx::query("UPDATE api_tokens SET last_used_at = ? WHERE id = ?")
                .bind(Utc::now())
                .bind(token_id)
                .execute(&state.db)
                .await?;
            return Ok(AuthUser {
                id: user_id,
                via_token: true,
            });
        }
        let id = state.jwt.verify(token)?;
        Ok(AuthUser {
            id,
            via_token: false,
        })
    }
}
