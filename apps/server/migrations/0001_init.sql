CREATE TABLE users (
    id            TEXT PRIMARY KEY,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name          TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL
);

CREATE TABLE workspaces (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    slug       TEXT NOT NULL UNIQUE,
    owner_id   TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL
);

CREATE TABLE workspace_members (
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role         TEXT NOT NULL DEFAULT 'member',
    joined_at    TEXT NOT NULL,
    PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE projects (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    identifier   TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    issue_seq    INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    UNIQUE (workspace_id, identifier)
);

CREATE TABLE states (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    grp        TEXT NOT NULL CHECK (grp IN ('backlog','unstarted','started','completed','cancelled')),
    color      TEXT NOT NULL,
    position   REAL NOT NULL
);

CREATE TABLE labels (
    id         TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    color      TEXT NOT NULL,
    UNIQUE (project_id, name)
);

CREATE TABLE issues (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    seq         INTEGER NOT NULL,
    title       TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    state_id    TEXT NOT NULL REFERENCES states(id),
    priority    TEXT NOT NULL DEFAULT 'none' CHECK (priority IN ('urgent','high','medium','low','none')),
    assignee_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    due_date    TEXT,
    sort_order  REAL NOT NULL,
    created_by  TEXT NOT NULL REFERENCES users(id),
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    UNIQUE (project_id, seq)
);
CREATE INDEX idx_issues_project ON issues(project_id, state_id);
CREATE INDEX idx_issues_assignee ON issues(assignee_id);

CREATE TABLE issue_labels (
    issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    label_id TEXT NOT NULL REFERENCES labels(id) ON DELETE CASCADE,
    PRIMARY KEY (issue_id, label_id)
);

CREATE TABLE comments (
    id         TEXT PRIMARY KEY,
    issue_id   TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    author_id  TEXT NOT NULL REFERENCES users(id),
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_comments_issue ON comments(issue_id, created_at);

CREATE TABLE activities (
    id         TEXT PRIMARY KEY,
    issue_id   TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
    actor_id   TEXT NOT NULL REFERENCES users(id),
    field      TEXT NOT NULL,
    old_value  TEXT,
    new_value  TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_activities_issue ON activities(issue_id, created_at);
