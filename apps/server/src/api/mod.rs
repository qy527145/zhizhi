pub mod access;
pub mod auth;
pub mod files;
pub mod health;
pub mod install;
pub mod issues;
pub mod projects;
#[cfg(test)]
mod tests;
pub mod tokens;
pub mod views;
pub mod workspaces;

use axum::Router;

use crate::error::AppError;
use crate::state::AppState;

/// `/api` 下的全部路由。新增领域模块：在 `mod.rs` 里 `pub mod foo;` 后 merge 进这里。
pub fn router() -> Router<AppState> {
    Router::new()
        .merge(health::router())
        .merge(auth::router())
        .merge(tokens::router())
        .merge(files::router())
        .merge(workspaces::router())
        .merge(projects::router())
        .merge(issues::router())
        .merge(views::router())
        // 未匹配的 `/api/*` 走 JSON 404，而不是掉进 SPA fallback 返回 HTML。
        .fallback(unknown_api)
}

async fn unknown_api() -> AppError {
    AppError::NotFound("接口")
}
