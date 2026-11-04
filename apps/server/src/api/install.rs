//! CLI 安装链路：`/install.sh`、`/install.ps1`、`/download`，以及 `/dl/*` 下的发布产物。
//!
//! 这些路径不在 `/api` 下：用户还没登录、也还没有令牌，安装命令必须能直接 curl。

use axum::extract::{Path, State};
use axum::http::header;
use axum::response::{Html, IntoResponse};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

const INSTALL_SH: &str = include_str!("../../assets/install.sh");
const INSTALL_PS1: &str = include_str!("../../assets/install.ps1");
const DOWNLOAD_HTML: &str = include_str!("../../assets/download.html");

/// 安装脚本和下载页里的服务地址，由 `PUBLIC_BASE_URL` 决定，避免部署在内网时写死 localhost。
pub async fn install_sh(State(s): State<AppState>) -> impl IntoResponse {
    let body = INSTALL_SH.replace("__ZHIZHI_BASE_URL__", &s.config.public_base_url);
    (
        [(header::CONTENT_TYPE, "text/x-shellscript; charset=utf-8")],
        body,
    )
}

pub async fn install_ps1(State(s): State<AppState>) -> impl IntoResponse {
    let body = INSTALL_PS1.replace("__ZHIZHI_BASE_URL__", &s.config.public_base_url);
    ([(header::CONTENT_TYPE, "text/plain; charset=utf-8")], body)
}

pub async fn download_page(State(s): State<AppState>) -> Html<String> {
    Html(DOWNLOAD_HTML.replace("__ZHIZHI_BASE_URL__", &s.config.public_base_url))
}

/// `/dl/<文件名>`：只允许平铺文件名，杜绝路径穿越。
pub async fn artifact(
    State(s): State<AppState>,
    Path(name): Path<String>,
) -> AppResult<impl IntoResponse> {
    let valid = !name.is_empty()
        && !name.starts_with('.')
        && name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'));
    if !valid {
        return Err(AppError::NotFound("文件"));
    }
    let data = tokio::fs::read(s.config.release_dir.join(&name))
        .await
        .map_err(|_| AppError::NotFound("文件"))?;
    // 文件名已经过白名单校验，这里只按后缀给浏览器一个合适的 Content-Type。
    let mime = match std::path::Path::new(&name.to_ascii_lowercase())
        .extension()
        .and_then(|e| e.to_str())
    {
        Some("json") => "application/json",
        // .tar.gz 的 extension 是 gz。
        Some("gz") => "application/gzip",
        Some("zip") => "application/zip",
        _ => "application/octet-stream",
    };
    Ok((
        [
            (header::CONTENT_TYPE, mime.to_owned()),
            (header::X_CONTENT_TYPE_OPTIONS, "nosniff".to_owned()),
        ],
        data,
    ))
}
