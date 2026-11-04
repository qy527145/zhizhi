# 知之 Zhizhi

> 知之为知之——让每一项任务都清清楚楚。

新一代项目与任务管理系统：极简、中文友好、运行极快，可完全脱离鼠标操作。设计灵感来自 [Plane](https://github.com/makeplane/plane)。

## 技术栈

| 层   | 选型                                                                           |
| ---- | ------------------------------------------------------------------------------ |
| 后端 | Rust · Axum 0.8 · SQLx（SQLite，WAL）· JWT（HS256）· Argon2                    |
| CLI  | Rust · clap · reqwest，配套 Claude Code Skill（编译期打进二进制）              |
| 前端 | React 19 · TypeScript · Vite 8 · Tailwind CSS 4 · Zustand · Lucide React · Bun |
| 工程 | Cargo workspace + Bun workspaces + Turbo · Biome · rust-embed（单二进制）      |

## 快速开始

依赖：Rust 1.90+、Bun 1.2+。

```bash
bun install
bun run init    # 或用这个：安装依赖 + 从 .env.example 生成 .env
bun run dev     # 后端 :8080 + 前端 :5173，浏览器打开 http://localhost:5173
```

- 前端：http://localhost:5173（端口见 `.env` 的 `WEB_PORT`）
- 后端：http://127.0.0.1:8080/api/health（见 `HOST` / `PORT`）

## 构建

```bash
bun run build        # 当前平台，产物在 dist/，形如 zhizhi-server-<target-triple>
bun run build:win
bun run build:mac
bun run build:linux
```

前端产物在 release 编译期嵌入二进制，**生产环境只需要一个可执行文件**。运行时配置见 `.env`，
密钥放 `.env.local`（不会被提交）。

### 交叉编译

| 脚本          | Windows 宿主                  | macOS 宿主                  | Linux 宿主       |
| ------------- | ----------------------------- | --------------------------- | ---------------- |
| `build:win`   | 原生                          | 不支持（需 mingw，改走 CI） | `cargo-zigbuild` |
| `build:mac`   | **不支持**（缺 Apple SDK）    | 原生 arm64                  | **不支持**       |
| `build:linux` | `cargo-zigbuild`（musl 静态） | `cargo-zigbuild`            | 原生             |

`cargo-zigbuild` 需要额外安装：`cargo install cargo-zigbuild`，并确保 `zig` 在 PATH 中。
需要三平台同时出包时用 `.github/workflows/ci.yml`（打 tag 触发）。

## 命令行与 Agent

`zhizhi` 命令行让人和 Agent 在终端里管理任务；Skill 文件编译进二进制，版本始终一致。

```bash
bun run cli -- --help                 # 用源码运行，例如：
bun run cli -- login --url http://127.0.0.1:8080 --token zhz_xxx --workspace my-team
bun run cli -- issue list --json
bun run cli -- issue get CORE-12 --download --json
bun run skill:install                 # 安装 Skill 到 ~/.claude/skills/zhizhi
```

令牌在 Web「设置 → 访问令牌」创建（`zhz_` 前缀，只在创建时显示一次）。
配置优先级：命令行参数 > 环境变量（`ZHIZHI_URL` / `ZHIZHI_TOKEN` / `ZHIZHI_WORKSPACE` /
`ZHIZHI_PROJECT`）> 仓库根的 `.zhizhi.toml`（只放地址、工作区和默认项目）> 当前 profile。

退出码：0 成功 / 1 通用 / 2 未认证 / 3 不存在 / 4 冲突 / 5 网络或服务端 / 6 参数 / 7 无权限；
错误以 JSON 写到 stderr。完整命令见 [apps/cli/skill/references/cli.md](apps/cli/skill/references/cli.md)。

## 键盘快捷键

| 按键      | 作用       | 按键  | 作用       |
| --------- | ---------- | ----- | ---------- |
| `⌘K`      | 命令面板   | `C`   | 新建任务   |
| `J` / `K` | 上下移动   | `↵`   | 打开详情   |
| `S`       | 更改状态   | `P`   | 设置优先级 |
| `A`       | 指派负责人 | `I`   | 指派给自己 |
| `L`       | 设置标签   | `D`   | 截止日期   |
| `E`       | 编辑标题   | `⌘⌫`  | 删除任务   |
| `V`       | 切换视图   | `F`   | 筛选       |
| `G I`     | 我的任务   | `G P` | 第一个项目 |
| `G S`     | 设置       | `[`   | 折叠侧边栏 |
| `?`       | 快捷键帮助 | `Esc` | 关闭       |

选择器中可直接按 `1`–`9` 选中对应项。

## 目录结构

```
apps/cli/            zhizhi 命令行；skill/ 是编译期打进二进制的 Agent Skill
apps/server/         axum + SQLx
  migrations/        SQL 迁移（启动时自动执行）
  src/api/           REST API：health / auth / workspaces / projects / issues
  src/session.rs     JWT 签发校验、密码哈希、AuthUser 提取器
  src/api/access.rs  基于工作区成员关系的统一访问控制
  src/app.rs         根 Router：/api + SPA fallback
apps/web/src/
  lib/               API 客户端、常量
  stores/            Zustand：auth / workspace / issues（乐观更新）/ ui
  hooks/             全局快捷键（支持组合键与 G X 序列）
  components/        命令面板、属性选择器、列表、看板、详情面板
  pages/             路由页面
packages/ui/         共享 UI 组件
packages/shared/     与 Rust 对齐的 TS 类型
scripts/             build / init / clean / smoke
```

工程约束与命令以 [AGENTS.md](AGENTS.md) 为准。

## API 概览

所有接口前缀 `/api`，除注册登录外均需 `Authorization: Bearer <token>`。

```
POST   /auth/register | /auth/login        GET /auth/me
GET    /workspaces                         POST /workspaces
GET    /workspaces/{slug}                  GET|POST /workspaces/{slug}/members
GET    /workspaces/{slug}/projects         POST /workspaces/{slug}/projects
GET|PATCH|DELETE /projects/{id}
GET|POST /projects/{id}/states             GET|POST /projects/{id}/labels   DELETE /labels/{id}
GET|POST /projects/{id}/issues             GET /workspaces/{slug}/my-issues
GET /workspaces/{slug}/issues/{key}        按编号（CORE-12）取任务
GET|PATCH|DELETE /issues/{id}
GET|POST /issues/{id}/comments             GET /issues/{id}/activities
POST   /workspaces/{slug}/files            GET /files/{id}
GET|POST /tokens                           DELETE /tokens/{id}
GET|POST /projects/{id}/views              PATCH|DELETE /views/{id}
```

PATCH 任务时，`assignee_id` / `due_date` 传 `null` 表示清空，不传表示不修改。

## 配置

所有环境变量集中在根目录 `.env`，`.env.example` 是文档。

| 变量             | 默认                 | 说明                                     |
| ---------------- | -------------------- | ---------------------------------------- |
| `HOST`           | `127.0.0.1`          | 后端监听地址，容器内改为 `0.0.0.0`       |
| `PORT`           | `8080`               | 后端端口，也是生产 HTTP 端口             |
| `WEB_PORT`       | `5173`               | Vite 开发服务器端口                      |
| `RUST_LOG`       | `info`               | tracing 过滤器                           |
| `DATABASE_URL`   | `sqlite://zhizhi.db` | SQLite 位置，相对路径基于启动目录        |
| `JWT_SECRET`     | 开发默认值           | 生产环境必须覆盖，建议 32 字节以上随机串 |
| `ATTACHMENT_DIR` | `./data/attachments` | 附件落盘目录，需持久化并随数据库一起备份 |

## 用模板创建新项目

仓库结构与 [qy527145/rust_web](https://github.com/qy527145/rust_web) 一致，可直接作为 cargo-generate 模版复用：

```bash
cargo generate --git <this-repo-url> --name my-app
cd my-app
bun run init
```
