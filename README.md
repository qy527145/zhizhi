# 知之 Zhizhi

> 知之为知之——让每一项任务都清清楚楚。

新一代项目与任务管理系统：极简、中文友好、运行极快，可完全脱离鼠标操作。设计灵感来自 [Plane](https://github.com/makeplane/plane)。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 后端 | Rust · Axum 0.8 · SQLx（SQLite，WAL）· JWT（HS256）· Argon2 |
| 前端 | React 19 · TypeScript · Vite · Tailwind CSS 4 · Zustand · Lucide React · Bun |

## 快速开始

依赖：Rust 1.85+、Bun 1.2+。

```bash
make dev        # 后端 :8080 + 前端 :5173，浏览器打开 http://localhost:5173
make smoke      # 后端 API 冒烟测试
make build      # 生产构建，之后只需运行 backend/target/release/zhizhi-server
```

后端配置见 [backend/.env.example](backend/.env.example)，生产环境务必设置 `JWT_SECRET`。

## 键盘快捷键

| 按键 | 作用 | 按键 | 作用 |
| --- | --- | --- | --- |
| `⌘K` | 命令面板 | `C` | 新建任务 |
| `J` / `K` | 上下移动 | `↵` | 打开详情 |
| `S` | 更改状态 | `P` | 设置优先级 |
| `A` | 指派负责人 | `I` | 指派给自己 |
| `L` | 设置标签 | `D` | 截止日期 |
| `E` | 编辑标题 | `⌘⌫` | 删除任务 |
| `V` | 列表 / 看板 | `F` | 筛选 |
| `G I` | 我的任务 | `G P` | 第一个项目 |
| `G S` | 设置 | `[` | 折叠侧边栏 |
| `?` | 快捷键帮助 | `Esc` | 关闭 |

选择器中可直接按 `1`–`9` 选中对应项。

## 目录结构

```
backend/
  migrations/        SQL 迁移（启动时自动执行）
  src/auth.rs        JWT 签发校验、密码哈希、AuthUser 提取器
  src/routes/        REST API：auth / workspaces / projects / issues
  src/routes/access.rs  基于工作区成员关系的统一访问控制
frontend/src/
  lib/               API 客户端、类型、常量
  stores/            Zustand：auth / workspace / issues（乐观更新）/ ui
  hooks/             全局快捷键（支持组合键与 G X 序列）
  components/        命令面板、属性选择器、列表、看板、详情面板
  pages/             路由页面
```

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
GET|PATCH|DELETE /issues/{id}
GET|POST /issues/{id}/comments             GET /issues/{id}/activities
```

PATCH 任务时，`assignee_id` / `due_date` 传 `null` 表示清空，不传表示不修改。
