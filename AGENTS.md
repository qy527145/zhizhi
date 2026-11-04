# AGENTS.md

给 AI Agent 和人类协作者的单一事实来源。项目约束以本文件为准；命令只有这里列出的才是「官方」的。

## 这是什么

知之（Zhizhi）：项目与任务管理系统的单二进制 Web 应用。axum 提供 `/api`，React 前端由 Vite 构建后
在 release 编译期嵌入二进制（`rust-embed`），生产环境只部署一个可执行文件。
Bun 与 Turbo 负责前端和任务编排。

## 目录

| 路径                                 | 职责                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------- |
| `apps/server/`                       | Rust / axum + SQLx(SQLite)。唯一二进制入口 `src/main.rs`                          |
| `apps/server/src/api/`               | 按领域分模块，每个模块导出 `router() -> Router<AppState>`，在 `api/mod.rs` merge  |
| `apps/server/src/api/access.rs`      | 基于工作区成员关系的统一访问控制                                                  |
| `apps/server/src/app.rs`             | 根 Router：挂 `/api`、SPA fallback、中间件                                        |
| `apps/server/src/config.rs`          | **唯一**读取环境变量的地方                                                        |
| `apps/server/src/session.rs`         | JWT 签发校验、密码哈希、`AuthUser` 提取器                                         |
| `apps/server/src/error.rs`           | `AppError` → 统一 JSON 错误响应                                                   |
| `apps/server/migrations/`            | SQL 迁移，启动时自动执行                                                          |
| `apps/server/src/api/files.rs`       | 附件上传下载与正文引用校验                                                        |
| `apps/cli/`                          | `zhizhi` 命令行（clap + 阻塞 reqwest），`skill/` 是编译期打进二进制的 Agent Skill |
| `apps/server/src/api/install.rs`     | `/install.sh`、`/install.ps1`、`/download`、`/dl/*`，assets/ 下是脚本模板         |
| `apps/web/src/pages/ConnectPage.tsx` | 浏览器里的五步接入引导（安装 → 令牌 → 登录 → Skill → 使用）                       |
| `apps/web/`                          | React 19 + Vite 8 + Tailwind v4                                                   |
| `packages/ui/`                       | 共享组件（源码级消费，无需 build）                                                |
| `packages/shared/`                   | 与 Rust 对齐的 TS 类型契约                                                        |
| `scripts/build.ts`                   | 单二进制构建编排                                                                  |
| `.env`                               | 非敏感默认配置，前后端共用                                                        |

## 命令

```bash
bun run init         # 一键安装依赖 + 准备 .env（幂等）
bun run dev          # 同时起 Vite (WEB_PORT) 和 axum (HOST:PORT)，Vite 代理 /api
bun run build        # 当前平台单二进制 → dist/
bun run build:win    # 见 README「交叉编译」的宿主限制
bun run build:mac
bun run build:linux
bun run check        # biome check + tsc --noEmit + cargo fmt --check + clippy -D warnings
bun run test         # cargo test + bun test
bun run smoke        # 启动临时服务走通核心 API 流程（含附件、令牌）
bun run cli -- <args>    # 用源码运行 CLI，例如 `bun run cli -- issue list --json`
bun run skill:install    # 把 Skill 装到 ~/.claude/skills/zhizhi
bun run release      # 生成 CLI 制品与 latest.json 到 RELEASE_DIR（/install.sh 依赖它）
bun run lint         # biome check
bun run fmt          # biome --write + cargo fmt
```

## 规则

1. **环境变量只从 `Config::from_env()` 读**，不要在 handler 里直接用 `std::env`。
   新增变量必须同时更新：`config.rs`、`.env`、`.env.example`（带一行注释）、README 表格。
2. **所有 HTTP 接口挂在 `/api` 下**，返回 `AppResult<T>`，错误走 `AppError`。
   响应体固定为 `{"error": {"code", "message"}}`。前端代理只转发 `/api`，其他路径都是 SPA 路由。
3. **跨语言类型在 `packages/shared/src/index.ts` 手写并保持同步**。Rust 侧字段名即线格式（snake_case），改动时两边同改。
4. **`apps/web/dist/` 是构建产物，不要手改**。其中的 `.gitkeep` 必须保留（`rust-embed` 编译期要求目录存在）。
5. 前端样式用 Tailwind v4 工具类 + `packages/ui` 组件；`@source` 已配置，新增 UI 包需同步 `apps/web/src/index.css`。
6. 新增 workspace 包：`packages/<name>/package.json` 声明 `exports`，并在 `apps/web` 的
   `tsconfig.json` / `vite.config.ts` / `package.json` 三处补别名与依赖。
7. **附件走 `files.rs`**：正文用 `![说明](ATT-xxx)` 引用，创建/编辑任务时校验引用属于该任务；
   上传按内容嗅探 MIME，白名单不含 SVG/HTML。文件落在 `ATTACHMENT_DIR`，部署时需持久化并随数据库备份。
8. **个人访问令牌**（`zhz_` 前缀）只存 SHA-256 哈希，供 CLI 与 Agent 使用；令牌不能再管理令牌。
   `AuthUser.via_token` 区分两种认证方式。
9. **安装链路不在 `/api` 下**：`/install.sh`、`/install.ps1`、`/download`、`/dl/*` 由
   `api/install.rs` 直接挂在根 Router 上，因为用户此时还没登录。脚本里的服务地址来自
   `PUBLIC_BASE_URL`，制品清单的 `url` 写相对路径，换域名不用重新发布。
10. 不引入第二个前端构建器，不引入 node_modules 之外的全局安装。
11. `Cargo.toml` 里 `profile.release.strip` 必须显式为 `false`：省略时 rustc 会连 proc-macro 的 dylib
    一起剥离，macOS 上表现为链接期 `mis-aligned LINKEDIT string pool`。二进制体积由 `scripts/build.ts` 用系统 `strip` 处理。

## 开发模式为什么不用 embedded 资源

dev 下 Vite 跑在 `WEB_PORT`，`/api` 代理到 axum；`rust-embed` 只在 `cargo build --release` 时读取
`apps/web/dist`。因此改前端不需要重编 Rust，改后端用 `cargo watch -x run` 热重启。

## 完成定义

改完代码后至少跑通：`bun run check` 与 `bun run test`。涉及前端可见改动时再跑 `bun run build` 确认单二进制可用。
