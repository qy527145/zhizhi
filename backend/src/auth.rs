use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use axum::{extract::FromRequestParts, http::request::Parts};
use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use crate::{
    error::{internal, AppError, AppResult},
    AppState,
};

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
    PasswordHash::new(hash)
        .map(|parsed| Argon2::default().verify_password(password.as_bytes(), &parsed).is_ok())
        .unwrap_or(false)
}

/// 已认证用户。作为 handler 参数即要求请求携带有效的 Bearer Token。
pub struct AuthUser {
    pub id: String,
}

impl FromRequestParts<AppState> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &AppState) -> Result<Self, Self::Rejection> {
        let token = parts
            .headers
            .get(axum::http::header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .ok_or(AppError::Unauthorized)?;
        let id = state.jwt.verify(token)?;
        Ok(AuthUser { id })
    }
}
