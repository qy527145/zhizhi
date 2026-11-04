use std::str::FromStr;
use std::sync::Arc;
use std::time::{Duration, Instant};

use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePoolOptions, SqliteSynchronous};
use tokio::net::TcpListener;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

mod api;
mod app;
mod config;
mod embed;
mod error;
mod models;
mod session;
mod state;

#[cfg(test)]
mod test_support;

use config::Config;
use session::JwtKeys;
use state::AppState;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    load_dotenv();

    let config = Config::from_env()?;
    init_tracing(&config.log_filter);

    let db = connect(&config.database_url).await?;

    let listener = TcpListener::bind(config.addr()).await?;
    let local_addr = listener.local_addr()?;

    tracing::info!(addr = %local_addr, "listening");
    tracing::info!(
        version = env!("CARGO_PKG_VERSION"),
        "{} started",
        env!("CARGO_PKG_NAME")
    );

    let jwt = Arc::new(JwtKeys::new(config.jwt_secret.as_bytes()));

    let state = AppState {
        config: Arc::new(config),
        db,
        jwt,
        started_at: Instant::now(),
    };

    axum::serve(listener, app::router(state))
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    tracing::info!("shutdown complete");
    Ok(())
}

/// `SQLite` 连接池：WAL + 外键 + `busy_timeout`，启动时自动执行迁移。
async fn connect(database_url: &str) -> anyhow::Result<sqlx::SqlitePool> {
    let options = SqliteConnectOptions::from_str(database_url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .synchronous(SqliteSynchronous::Normal)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5));

    let db = SqlitePoolOptions::new()
        .max_connections(16)
        .connect_with(options)
        .await?;

    sqlx::migrate!("./migrations").run(&db).await?;
    Ok(db)
}

/// 从当前目录逐级向上查找 `.env`，找不到时静默使用默认值，便于直接运行发布产物。
///
/// 找到后把工作目录切到 `.env` 所在目录再加载：`DATABASE_URL`、`ATTACHMENT_DIR`、`RELEASE_DIR`
/// 都是相对路径，双击 exe（cwd 是 exe 所在目录）或从别处启动时，只有这样才能解析到同一份数据。
fn load_dotenv() {
    let Ok(mut dir) = std::env::current_dir() else {
        tracing::warn!("无法读取当前目录，跳过 .env 加载");
        return;
    };
    loop {
        if dir.join(".env").is_file() {
            if std::env::set_current_dir(&dir).is_err() {
                tracing::warn!(dir = %dir.display(), "无法切换到 .env 所在目录，相对路径将按当前目录解析");
            }
            if let Err(err) = dotenvy::dotenv() {
                tracing::warn!(%err, "读取 .env 失败，改用默认配置");
            }
            return;
        }
        match dir.parent() {
            Some(parent) => dir = parent.to_path_buf(),
            None => return,
        }
    }
}

fn init_tracing(filter: &str) {
    let env_filter = tracing_subscriber::EnvFilter::try_new(filter)
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer().compact())
        .init();
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };

    #[cfg(unix)]
    let terminate = async {
        if let Ok(mut signal) =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
        {
            signal.recv().await;
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = ctrl_c => {}
        () = terminate => {}
    }

    tracing::info!("shutdown signal received");
}
