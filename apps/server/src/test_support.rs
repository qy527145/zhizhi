//! 测试专用：构造一套指向内存 `SQLite` 的 `AppState`，每次调用互不影响。

use std::str::FromStr;
use std::sync::Arc;
use std::time::Instant;

use axum::Router;
use axum::body::Body;
use axum::http::{Request, StatusCode, header};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use tower::ServiceExt;

use crate::config::Config;
use crate::session::JwtKeys;
use crate::state::AppState;

pub fn config() -> Config {
    Config {
        host: "127.0.0.1".to_owned(),
        port: 8080,
        log_filter: "info".to_owned(),
        database_url: "sqlite::memory:".to_owned(),
        jwt_secret: "test-secret".to_owned(),
        // 每个测试状态用独立目录，避免并发测试互相覆盖或误删文件。
        attachment_dir: std::env::temp_dir()
            .join("zhizhi-test-attachments")
            .join(crate::models::new_id()),
        public_base_url: "http://127.0.0.1:8080".to_owned(),
        release_dir: std::env::temp_dir()
            .join("zhizhi-test-releases")
            .join(crate::models::new_id()),
    }
}

/// 每个调用者拿到独立的 `:memory:` 数据库，并已执行完全部迁移。
pub async fn state() -> AppState {
    let options = SqliteConnectOptions::from_str("sqlite::memory:")
        .expect("in-memory dsn parses")
        .foreign_keys(true);
    let db = SqlitePoolOptions::new()
        .max_connections(1)
        .connect_with(options)
        .await
        .expect("in-memory sqlite connects");
    sqlx::migrate!("./migrations")
        .run(&db)
        .await
        .expect("migrations run");

    let config = config();
    let jwt = Arc::new(JwtKeys::new(config.jwt_secret.as_bytes()));
    AppState {
        config: Arc::new(config),
        db,
        jwt,
        started_at: Instant::now(),
    }
}

/// 进程内 HTTP 客户端：直接驱动 Router，不监听端口。
pub struct Client {
    app: Router,
}

impl Client {
    pub async fn new() -> Self {
        Self {
            app: crate::app::router(state().await),
        }
    }

    async fn send(&self, req: Request<Body>) -> (StatusCode, Value) {
        let res = self
            .app
            .clone()
            .oneshot(req)
            .await
            .expect("router is infallible");
        let status = res.status();
        let bytes = res
            .into_body()
            .collect()
            .await
            .expect("body collects")
            .to_bytes();
        let body = serde_json::from_slice(&bytes).unwrap_or(Value::Null);
        (status, body)
    }

    pub async fn json(
        &self,
        method: &str,
        path: &str,
        token: Option<&str>,
        body: Option<Value>,
    ) -> (StatusCode, Value) {
        let mut b = Request::builder().method(method).uri(path);
        if let Some(t) = token {
            b = b.header(header::AUTHORIZATION, format!("Bearer {t}"));
        }
        let req = match body {
            Some(v) => b
                .header(header::CONTENT_TYPE, "application/json")
                .body(Body::from(v.to_string())),
            None => b.body(Body::empty()),
        };
        self.send(req.expect("request builds")).await
    }

    /// 原样返回响应体字节，用于校验附件下载内容。
    pub async fn raw(&self, path: &str, token: &str) -> (StatusCode, Vec<u8>) {
        let req = Request::builder()
            .uri(path)
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .body(Body::empty())
            .expect("request builds");
        let res = self
            .app
            .clone()
            .oneshot(req)
            .await
            .expect("router is infallible");
        let status = res.status();
        let bytes = res
            .into_body()
            .collect()
            .await
            .expect("body collects")
            .to_bytes();
        (status, bytes.to_vec())
    }

    pub async fn upload(
        &self,
        slug: &str,
        token: &str,
        filename: &str,
        data: &[u8],
    ) -> (StatusCode, Value) {
        let boundary = "zhizhi-test-boundary";
        let mut body = format!(
            "--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n"
        )
        .into_bytes();
        body.extend_from_slice(data);
        body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
        let req = Request::builder()
            .method("POST")
            .uri(format!("/api/workspaces/{slug}/files"))
            .header(header::AUTHORIZATION, format!("Bearer {token}"))
            .header(
                header::CONTENT_TYPE,
                format!("multipart/form-data; boundary={boundary}"),
            )
            .body(Body::from(body))
            .expect("request builds");
        self.send(req).await
    }

    /// 注册用户并创建工作区和项目，返回 `(token, project_id)`。
    pub async fn seed(&self, email: &str, slug: &str) -> (String, String) {
        let (_, auth) = self
            .json(
                "POST",
                "/api/auth/register",
                None,
                Some(json!({ "email": email, "name": "测试", "password": "12345678" })),
            )
            .await;
        let token = auth["token"].as_str().expect("token").to_owned();
        self.json(
            "POST",
            "/api/workspaces",
            Some(&token),
            Some(json!({ "name": slug, "slug": slug })),
        )
        .await;
        let (_, project) = self
            .json(
                "POST",
                &format!("/api/workspaces/{slug}/projects"),
                Some(&token),
                Some(json!({ "name": "核心", "identifier": "core" })),
            )
            .await;
        let project_id = project["id"].as_str().expect("project id").to_owned();
        (token, project_id)
    }
}

/// 最小的合法 PNG（1×1），用于上传测试。
pub const PNG: &[u8] = &[
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4,
    0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
    0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE,
    0x42, 0x60, 0x82,
];
