use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

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
    #[error("服务器内部错误")]
    Internal(String),
}

impl From<sqlx::Error> for AppError {
    fn from(e: sqlx::Error) -> Self {
        match &e {
            sqlx::Error::RowNotFound => AppError::NotFound("资源"),
            sqlx::Error::Database(db) if db.is_unique_violation() => {
                AppError::Conflict("数据已存在，请勿重复创建".into())
            }
            _ => AppError::Internal(e.to_string()),
        }
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let status = match &self {
            AppError::BadRequest(_) => StatusCode::BAD_REQUEST,
            AppError::Unauthorized => StatusCode::UNAUTHORIZED,
            AppError::Forbidden => StatusCode::FORBIDDEN,
            AppError::NotFound(_) => StatusCode::NOT_FOUND,
            AppError::Conflict(_) => StatusCode::CONFLICT,
            AppError::Internal(e) => {
                tracing::error!(error = %e, "internal error");
                StatusCode::INTERNAL_SERVER_ERROR
            }
        };
        (status, Json(json!({ "error": self.to_string() }))).into_response()
    }
}

pub type AppResult<T> = Result<T, AppError>;

pub fn internal(msg: impl ToString) -> AppError {
    AppError::Internal(msg.to_string())
}
