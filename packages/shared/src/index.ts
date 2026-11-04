/**
 * 与 Rust 端零成本对齐的类型约定。
 *
 * 约定：Rust 侧结构体一律 `#[derive(Serialize)]`，字段名保持 snake_case，保证这里手写的
 * 类型即真实线格式。字段改名时两边一起改。
 */

/** `GET /api/health` 的响应体，对应 `apps/server/src/api/health.rs`。 */
export interface Health {
  status: "ok";
  version: string;
  uptime_secs: number;
}

/** `GET /api/info` 的响应体，对应 `apps/server/src/api/health.rs`。 */
export interface Info {
  name: string;
  version: string;
  addr: string;
}

/** 所有错误响应的形状，对应 `apps/server/src/error.rs`。 */
export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

export type Priority = "urgent" | "high" | "medium" | "low" | "none";
export type StateGroup = "backlog" | "unstarted" | "started" | "completed" | "cancelled";

export interface User {
  id: string;
  email: string;
  name: string;
  created_at: string;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
}

export interface Member {
  id: string;
  email: string;
  name: string;
  role: "owner" | "admin" | "member";
}

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  identifier: string;
  description: string;
  created_at: string;
}

export interface IssueState {
  id: string;
  project_id: string;
  name: string;
  group: StateGroup;
  color: string;
  position: number;
}

export interface Label {
  id: string;
  project_id: string;
  name: string;
  color: string;
}

export interface Issue {
  id: string;
  project_id: string;
  seq: number;
  title: string;
  description: string;
  state_id: string;
  priority: Priority;
  assignee_id: string | null;
  due_date: string | null;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  label_ids: string[];
}

export interface Comment {
  id: string;
  issue_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export interface Activity {
  id: string;
  issue_id: string;
  actor_id: string;
  field: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
}

/** `POST /api/auth/*` 的响应体。 */
export interface AuthResponse {
  token: string;
  user: User;
}

export type IssuePatch = Partial<
  Pick<
    Issue,
    | "title"
    | "description"
    | "state_id"
    | "priority"
    | "assignee_id"
    | "due_date"
    | "label_ids"
    | "sort_order"
  >
>;
