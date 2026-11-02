mod access;
mod auth;
mod issues;
mod projects;
mod workspaces;

use axum::{routing::get, Router};

use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(|| async { "ok" }))
        .merge(auth::router())
        .merge(workspaces::router())
        .merge(projects::router())
        .merge(issues::router())
}
