use axum::Json;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;

/// 处理函数统一返回 `Result<T, AppError>`。
/// 响应体固定为 `{"error": {"code": "...", "message": "..."}}`，前端可依赖这个形状。
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{0}")]
    BadRequest(String),

    #[error("未登录或登录已过期")]
    Unauthorized,

    #[error("无权访问该资源")]
    Forbidden,

    #[error("{0}不存在")]
    NotFound(&'static str),

    #[error("{0}")]
    Conflict(String),

    #[error(transparent)]
    Internal(#[from] anyhow::Error),
}

impl From<sqlx::Error> for AppError {
    fn from(error: sqlx::Error) -> Self {
        match &error {
            sqlx::Error::RowNotFound => Self::NotFound("资源"),
            sqlx::Error::Database(db) if db.is_unique_violation() => {
                Self::Conflict("数据已存在，请勿重复创建".to_owned())
            }
            _ => Self::Internal(error.into()),
        }
    }
}

pub type AppResult<T> = Result<T, AppError>;

pub fn internal(message: impl std::fmt::Display) -> AppError {
    AppError::Internal(anyhow::anyhow!("{message}"))
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message) = match self {
            Self::BadRequest(message) => (StatusCode::BAD_REQUEST, "bad_request", message),
            Self::Unauthorized => (StatusCode::UNAUTHORIZED, "unauthorized", self.to_string()),
            Self::Forbidden => (StatusCode::FORBIDDEN, "forbidden", self.to_string()),
            Self::NotFound(what) => (StatusCode::NOT_FOUND, "not_found", format!("{what}不存在")),
            Self::Conflict(message) => (StatusCode::CONFLICT, "conflict", message),
            // 内部错误不把细节返回给客户端，只写日志。
            Self::Internal(error) => {
                tracing::error!(error = %error, "internal error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "internal",
                    "internal server error".to_owned(),
                )
            }
        };

        (
            status,
            Json(json!({ "error": { "code": code, "message": message } })),
        )
            .into_response()
    }
}
