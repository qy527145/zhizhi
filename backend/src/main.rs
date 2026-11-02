mod auth;
mod error;
mod models;
mod routes;

use std::{net::SocketAddr, str::FromStr, sync::Arc, time::Duration};

use axum::Router;
use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use tower_http::{
    compression::CompressionLayer,
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
    trace::TraceLayer,
};
use tracing_subscriber::EnvFilter;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::SqlitePool,
    pub jwt: Arc<auth::JwtKeys>,
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "zhizhi_server=info,tower_http=info".into()))
        .init();

    let database_url = std::env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://zhizhi.db".into());
    let secret = std::env::var("JWT_SECRET").unwrap_or_else(|_| {
        tracing::warn!("未设置 JWT_SECRET，使用开发默认值，切勿用于生产环境");
        "zhizhi-dev-secret-change-me".into()
    });
    let addr: SocketAddr = std::env::var("BIND_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:8080".into())
        .parse()
        .expect("BIND_ADDR 格式错误");
    let static_dir = std::env::var("STATIC_DIR").unwrap_or_else(|_| "../frontend/dist".into());

    let opts = SqliteConnectOptions::from_str(&database_url)
        .expect("DATABASE_URL 格式错误")
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5));
    let db = SqlitePoolOptions::new()
        .max_connections(16)
        .connect_with(opts)
        .await
        .expect("无法连接数据库");
    sqlx::migrate!("./migrations").run(&db).await.expect("数据库迁移失败");

    let state = AppState { db, jwt: Arc::new(auth::JwtKeys::new(secret.as_bytes())) };

    // 生产环境下由后端直接托管前端构建产物，未匹配的路径回落到 index.html 交给前端路由。
    let spa = ServeDir::new(&static_dir).not_found_service(ServeFile::new(format!("{static_dir}/index.html")));

    let app = Router::new()
        .nest("/api", routes::router())
        .fallback_service(spa)
        .layer(CompressionLayer::new())
        .layer(CorsLayer::permissive())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(addr).await.expect("端口绑定失败");
    tracing::info!("知之服务已启动：http://{addr}");
    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            tokio::signal::ctrl_c().await.ok();
        })
        .await
        .unwrap();
}
