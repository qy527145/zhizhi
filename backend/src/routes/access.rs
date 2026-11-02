//! 资源访问控制：所有资源都归属于某个工作区，只有工作区成员可以访问。

use crate::error::{AppError, AppResult};

pub async fn workspace_by_slug(db: &sqlx::SqlitePool, slug: &str, user_id: &str) -> AppResult<String> {
    let row: Option<(String, Option<String>)> = sqlx::query_as(
        "SELECT w.id, m.user_id FROM workspaces w
         LEFT JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ?
         WHERE w.slug = ?",
    )
    .bind(user_id)
    .bind(slug)
    .fetch_optional(db)
    .await?;
    match row {
        None => Err(AppError::NotFound("工作区")),
        Some((_, None)) => Err(AppError::Forbidden),
        Some((id, Some(_))) => Ok(id),
    }
}

/// 校验用户对项目的访问权，返回项目所属工作区 id。
pub async fn project(db: &sqlx::SqlitePool, project_id: &str, user_id: &str) -> AppResult<String> {
    let row: Option<(String, Option<String>)> = sqlx::query_as(
        "SELECT p.workspace_id, m.user_id FROM projects p
         LEFT JOIN workspace_members m ON m.workspace_id = p.workspace_id AND m.user_id = ?
         WHERE p.id = ?",
    )
    .bind(user_id)
    .bind(project_id)
    .fetch_optional(db)
    .await?;
    match row {
        None => Err(AppError::NotFound("项目")),
        Some((_, None)) => Err(AppError::Forbidden),
        Some((ws, Some(_))) => Ok(ws),
    }
}

/// 校验用户对任务的访问权，返回 (project_id, workspace_id)。
pub async fn issue(db: &sqlx::SqlitePool, issue_id: &str, user_id: &str) -> AppResult<(String, String)> {
    let row: Option<(String, String, Option<String>)> = sqlx::query_as(
        "SELECT i.project_id, p.workspace_id, m.user_id FROM issues i
         JOIN projects p ON p.id = i.project_id
         LEFT JOIN workspace_members m ON m.workspace_id = p.workspace_id AND m.user_id = ?
         WHERE i.id = ?",
    )
    .bind(user_id)
    .bind(issue_id)
    .fetch_optional(db)
    .await?;
    match row {
        None => Err(AppError::NotFound("任务")),
        Some((_, _, None)) => Err(AppError::Forbidden),
        Some((p, ws, Some(_))) => Ok((p, ws)),
    }
}

pub async fn ensure_member(db: &sqlx::SqlitePool, workspace_id: &str, user_id: &str) -> AppResult<()> {
    let ok: Option<(i64,)> =
        sqlx::query_as("SELECT 1 FROM workspace_members WHERE workspace_id = ? AND user_id = ?")
            .bind(workspace_id)
            .bind(user_id)
            .fetch_optional(db)
            .await?;
    ok.map(|_| ()).ok_or(AppError::BadRequest("该用户不是工作区成员".into()))
}
