use rust_embed::Embed;

/// 前端构建产物，编译期嵌入二进制。
/// 目录由 `apps/web` 的 Vite 构建生成；`apps/web/dist/.gitkeep` 保证目录始终存在。
#[derive(Embed)]
#[folder = "$CARGO_MANIFEST_DIR/../web/dist/"]
pub struct Assets;
