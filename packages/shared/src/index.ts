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
  public_base_url: string;
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
  /** 开始日期（YYYY-MM-DD），时间线视图使用。 */
  start_date: string | null;
  sort_order: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  label_ids: string[];
  attachments: Attachment[];
  comment_count: number;
}

/** 附件元数据，对应 `apps/server/src/models.rs` 的 `Attachment`。正文用 `![说明](ATT-xxx)` 引用。 */
export interface Attachment {
  id: string;
  filename: string;
  mime: string;
  size_bytes: number;
  issue_id: string | null;
}

/** 个人访问令牌（列表中不含明文）。 */
export interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  last_used_at: string | null;
  created_at: string;
}

/** `POST /api/tokens` 的响应体：`token` 为明文，只返回这一次。 */
export interface CreatedToken {
  id: string;
  name: string;
  prefix: string;
  token: string;
  created_at: string;
}

export type ViewKind = "list" | "board" | "table" | "calendar" | "timeline";
export type GroupBy = "state" | "priority" | "assignee" | "label" | "none";
export type SortBy =
  | "manual"
  | "priority"
  | "due_date"
  | "start_date"
  | "updated_at"
  | "created_at"
  | "title";
export type TableColumn =
  | "state"
  | "priority"
  | "assignee"
  | "labels"
  | "start_date"
  | "due_date"
  | "updated_at";
/** 可以「排除所选」的筛选维度。 */
export type FilterDimension = "states" | "priorities" | "assignees" | "labels";

/** 任务筛选条件；数组为空表示不限制。 */
export interface IssueFilter {
  states: string[];
  priorities: Priority[];
  /** 成员 id，`"none"` 表示未指派。 */
  assignees: string[];
  labels: string[];
  /** 这些维度的语义从「属于所选」变成「不属于所选」。 */
  negate: FilterDimension[];
  text: string;
  due: "any" | "overdue" | "week" | "none";
  hideClosed: boolean;
}

/** 保存的视图配置，存在 `saved_views.config` 中。 */
export interface ViewConfig {
  kind: ViewKind;
  groupBy: GroupBy;
  sortBy: SortBy;
  sortDesc: boolean;
  /** 表格视图显示的列。 */
  columns: TableColumn[];
  filter: IssueFilter;
}

export interface SavedView {
  id: string;
  project_id: string;
  name: string;
  config: ViewConfig;
  position: number;
  created_at: string;
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
    | "start_date"
    | "label_ids"
    | "sort_order"
  >
> & {
  /** 新上传、需要绑定到任务上的附件 id。 */
  attachment_ids?: string[];
};
