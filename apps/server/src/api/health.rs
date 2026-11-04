use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;

use crate::error::AppResult;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/health", get(health))
        .route("/info", get(info))
}

#[derive(Serialize)]
struct Health {
    status: &'static str,
    version: &'static str,
    uptime_secs: u64,
}

async fn health(State(state): State<AppState>) -> AppResult<Json<Health>> {
    Ok(Json(Health {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        uptime_secs: state.uptime_secs(),
    }))
}

/// 字段名即线格式（`snake_case`），与 `packages/shared` 的类型保持一致。
#[derive(Serialize)]
struct Info {
    name: &'static str,
    version: &'static str,
    addr: String,
    /// 前端拼安装命令用；反代后面和 addr 可能不同。
    public_base_url: String,
}

/// 只暴露非敏感配置，可用于确认部署环境读到了哪份 `.env`。
async fn info(State(state): State<AppState>) -> AppResult<Json<Info>> {
    Ok(Json(Info {
        name: env!("CARGO_PKG_NAME"),
        version: env!("CARGO_PKG_VERSION"),
        addr: state.config.addr(),
        public_base_url: state.config.public_base_url.clone(),
    }))
}

#[cfg(test)]
mod tests {
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    use crate::app;
    use crate::test_support::state;

    async fn get(path: &str) -> (StatusCode, serde_json::Value) {
        let response = app::router(state().await)
            .oneshot(
                Request::builder()
                    .uri(path)
                    .body(Body::empty())
                    .expect("request builds"),
            )
            .await
            .expect("router is infallible");
        let status = response.status();
        let bytes = response
            .into_body()
            .collect()
            .await
            .expect("body collects")
            .to_bytes();
        let json = serde_json::from_slice(&bytes).expect("body is json");
        (status, json)
    }

    #[tokio::test]
    async fn health_is_ok() {
        let (status, json) = get("/api/health").await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["status"], "ok");
        assert!(json["version"].is_string());
        assert!(json["uptime_secs"].is_u64());
    }

    #[tokio::test]
    async fn info_reports_configured_addr() {
        let (status, json) = get("/api/info").await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(json["addr"], "127.0.0.1:8080");
        assert_eq!(json["public_base_url"], "http://127.0.0.1:8080");
    }

    #[tokio::test]
    async fn unknown_api_is_json_404() {
        let (status, json) = get("/api/nope").await;
        assert_eq!(status, StatusCode::NOT_FOUND);
        assert_eq!(json["error"]["code"], "not_found");
    }
}
