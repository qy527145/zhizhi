use axum::Router;
use axum::body::Body;
use axum::extract::Request;
use axum::http::{HeaderValue, StatusCode, header};
use axum::response::{IntoResponse, Response};
use tower_http::compression::CompressionLayer;
use tower_http::trace::TraceLayer;

use crate::api;
use crate::embed::Assets;
use crate::state::AppState;

pub fn router(state: AppState) -> Router {
    Router::new()
        .nest("/api", api::router())
        .fallback(serve_static)
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .with_state(state)
}

/// 空路径映射到 `index.html`，其余去掉前导 `/`。
fn normalize(path: &str) -> &str {
    let trimmed = path.trim_start_matches('/');
    if trimmed.is_empty() {
        "index.html"
    } else {
        trimmed
    }
}

/// 带扩展名的路径视为静态资源；否则视为 SPA 路由。
fn looks_like_file(path: &str) -> bool {
    path.rsplit('/')
        .next()
        .is_some_and(|name| name.contains('.'))
}

async fn serve_static(req: Request) -> Response {
    let path = normalize(req.uri().path());

    if let Some(file) = Assets::get(path) {
        return file_response(path, file);
    }

    if looks_like_file(path) {
        return StatusCode::NOT_FOUND.into_response();
    }

    match Assets::get("index.html") {
        Some(file) => file_response("index.html", file),
        None => (
            StatusCode::SERVICE_UNAVAILABLE,
            "frontend not built yet: run `bun run build` first\n",
        )
            .into_response(),
    }
}

fn file_response(path: &str, file: rust_embed::EmbeddedFile) -> Response {
    // rust-embed 不提供 MIME，按扩展名推断；未知类型回退为二进制。
    let mime = mime_guess::from_path(path).first_or_octet_stream();

    // Vite 产出的文件名带内容哈希，可以永久缓存；其余（index.html 等）每次校验。
    let cache_control = if path.starts_with("assets/") {
        "public, max-age=31536000, immutable"
    } else {
        "no-cache"
    };

    let mut response = Response::new(Body::from(file.data.into_owned()));
    let headers = response.headers_mut();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_str(mime.essence_str())
            .unwrap_or_else(|_| HeaderValue::from_static("application/octet-stream")),
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static(cache_control),
    );
    response
}

#[cfg(test)]
mod tests {
    use super::{looks_like_file, normalize};

    #[test]
    fn root_maps_to_index() {
        assert_eq!(normalize("/"), "index.html");
        assert_eq!(normalize(""), "index.html");
    }

    #[test]
    fn strips_leading_slash() {
        assert_eq!(normalize("/assets/app.js"), "assets/app.js");
    }

    #[test]
    fn detects_static_paths() {
        assert!(looks_like_file("assets/app.js"));
        assert!(looks_like_file("favicon.ico"));
        assert!(!looks_like_file("dashboard"));
        assert!(!looks_like_file("dashboard/settings"));
    }
}
