-- 任务开始日期：时间线视图使用，与 due_date 同为 YYYY-MM-DD。
ALTER TABLE issues ADD COLUMN start_date TEXT;

-- 附件元数据；文件本体落在 ATTACHMENT_DIR 下的 storage_key。
-- issue_id 在上传时为空，创建或编辑任务引用后才绑定。
CREATE TABLE attachments (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    issue_id     TEXT REFERENCES issues(id) ON DELETE SET NULL,
    filename     TEXT NOT NULL,
    mime         TEXT NOT NULL,
    size_bytes   INTEGER NOT NULL,
    storage_key  TEXT NOT NULL,
    uploaded_by  TEXT NOT NULL REFERENCES users(id),
    created_at   TEXT NOT NULL
);
CREATE INDEX idx_attachments_issue ON attachments(issue_id);
CREATE INDEX idx_attachments_workspace ON attachments(workspace_id);

-- 个人访问令牌：只存 SHA-256 哈希，明文仅在创建时返回一次。
CREATE TABLE api_tokens (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    token_hash   TEXT NOT NULL UNIQUE,
    prefix       TEXT NOT NULL,
    last_used_at TEXT,
    revoked_at   TEXT,
    created_at   TEXT NOT NULL
);
CREATE INDEX idx_api_tokens_user ON api_tokens(user_id);

-- 保存的视图：config 为 JSON（视图类型、筛选、分组、排序）。
CREATE TABLE saved_views (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    config     TEXT NOT NULL,
    position   REAL NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_saved_views_project ON saved_views(project_id, user_id);
