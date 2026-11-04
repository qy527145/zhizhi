use std::env;
use std::path::PathBuf;

use thiserror::Error;

/// 全部运行时配置的唯一来源。
/// 新增变量：在 `from_env` 读取 → 在 `.env` / `.env.example` 补默认值与说明 → 在 README 表格登记。
#[derive(Debug, Clone)]
pub struct Config {
    pub host: String,
    pub port: u16,
    pub log_filter: String,
    pub database_url: String,
    pub jwt_secret: String,
    /// 附件落盘目录；数据库只存元数据，部署时需要持久化这个目录。
    pub attachment_dir: PathBuf,
}

impl Config {
    pub fn from_env() -> Result<Self, ConfigError> {
        let host = env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_owned());

        let port = match env::var("PORT") {
            Ok(raw) => raw.parse().map_err(|_| ConfigError::InvalidPort(raw))?,
            Err(_) => 8080,
        };

        let log_filter = env::var("RUST_LOG").unwrap_or_else(|_| "info".to_owned());

        let database_url =
            env::var("DATABASE_URL").unwrap_or_else(|_| "sqlite://zhizhi.db".to_owned());

        // 未配置时退回开发默认值，保证 `cargo run` 开箱可用；生产环境见 .env.example。
        let jwt_secret = match env::var("JWT_SECRET") {
            Ok(secret) if !secret.is_empty() => secret,
            _ => {
                tracing::warn!("未设置 JWT_SECRET，使用开发默认值，切勿用于生产环境");
                "zhizhi-dev-secret-change-me".to_owned()
            }
        };

        let attachment_dir = match env::var("ATTACHMENT_DIR") {
            Ok(dir) if !dir.is_empty() => PathBuf::from(dir),
            _ => PathBuf::from("./data/attachments"),
        };

        Ok(Self {
            host,
            port,
            log_filter,
            database_url,
            jwt_secret,
            attachment_dir,
        })
    }

    /// `HOST:PORT`，交给 `TcpListener::bind` 解析，支持主机名。
    pub fn addr(&self) -> String {
        format!("{}:{}", self.host, self.port)
    }
}

#[derive(Debug, Error)]
pub enum ConfigError {
    #[error("PORT 必须是 0-65535 之间的整数，实际为 `{0}`")]
    InvalidPort(String),
}

#[cfg(test)]
mod tests {
    use super::Config;

    #[test]
    fn addr_joins_host_and_port() {
        let config = Config {
            host: "0.0.0.0".to_owned(),
            port: 8080,
            log_filter: "info".to_owned(),
            database_url: "sqlite::memory:".to_owned(),
            jwt_secret: "test".to_owned(),
            attachment_dir: std::path::PathBuf::from("./data/attachments"),
        };
        assert_eq!(config.addr(), "0.0.0.0:8080");
    }
}
