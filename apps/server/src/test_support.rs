//! 测试专用：构造一套指向内存 `SQLite` 的 `AppState`，每次调用互不影响。

use std::str::FromStr;
use std::sync::Arc;
use std::time::Instant;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};

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
