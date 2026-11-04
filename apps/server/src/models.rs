use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::FromRow;

pub fn new_id() -> String {
    uuid::Uuid::now_v7().to_string()
}

#[derive(Debug, Serialize, FromRow)]
pub struct User {
    pub id: String,
    pub email: String,
    pub name: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Workspace {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub owner_id: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Member {
    pub id: String,
    pub email: String,
    pub name: String,
    pub role: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Project {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub identifier: String,
    pub description: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct State {
    pub id: String,
    pub project_id: String,
    pub name: String,
    #[sqlx(rename = "grp")]
    #[serde(rename = "group")]
    pub group: String,
    pub color: String,
    pub position: f64,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Label {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Issue {
    pub id: String,
    pub project_id: String,
    pub seq: i64,
    pub title: String,
    pub description: String,
    pub state_id: String,
    pub priority: String,
    pub assignee_id: Option<String>,
    pub due_date: Option<String>,
    pub start_date: Option<String>,
    pub sort_order: f64,
    pub created_by: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    #[sqlx(skip)]
    pub label_ids: Vec<String>,
    #[sqlx(skip)]
    pub attachments: Vec<Attachment>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Comment {
    pub id: String,
    pub issue_id: String,
    pub author_id: String,
    pub body: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Activity {
    pub id: String,
    pub issue_id: String,
    pub actor_id: String,
    pub field: String,
    pub old_value: Option<String>,
    pub new_value: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct Attachment {
    pub id: String,
    pub filename: String,
    pub mime: String,
    pub size_bytes: i64,
    pub issue_id: Option<String>,
}

#[derive(Debug, Serialize, FromRow)]
pub struct ApiToken {
    pub id: String,
    pub name: String,
    pub prefix: String,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

pub const PRIORITIES: [&str; 5] = ["urgent", "high", "medium", "low", "none"];
pub const STATE_GROUPS: [&str; 5] = ["backlog", "unstarted", "started", "completed", "cancelled"];
