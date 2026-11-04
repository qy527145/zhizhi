use std::sync::Arc;
use std::time::Instant;

use crate::config::Config;
use crate::session::JwtKeys;

/// 传给 handler 的共享状态。只放廉价可克隆的东西（Arc / 连接池 / 广播端）。
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: sqlx::SqlitePool,
    pub jwt: Arc<JwtKeys>,
    pub started_at: Instant,
}

impl AppState {
    pub fn uptime_secs(&self) -> u64 {
        self.started_at.elapsed().as_secs()
    }
}
