//! 附件、令牌、过滤与保存视图的端到端测试（进程内驱动 Router）。

use axum::http::StatusCode;
use serde_json::json;

use crate::test_support::{Client, PNG};

#[tokio::test]
async fn upload_attach_download_roundtrip() {
    let c = Client::new().await;
    let (tok, proj) = c.seed("a@x.com", "ws-a").await;

    let (status, att) = c.upload("ws-a", &tok, "shot.png", PNG).await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(att["mime"], "image/png");
    let att_id = att["id"].as_str().unwrap();

    let (status, issue) = c
        .json(
            "POST",
            &format!("/api/projects/{proj}/issues"),
            Some(&tok),
            Some(json!({
                "title": "带图的任务",
                "description": format!("看这里 ![截图]({att_id})"),
                "attachment_ids": [att_id],
            })),
        )
        .await;
    assert_eq!(status, StatusCode::OK, "{issue}");
    assert_eq!(issue["attachments"][0]["id"], att_id);

    let (status, bytes) = c.raw(&format!("/api/files/{att_id}"), &tok).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(bytes, PNG);
}

#[tokio::test]
async fn rejects_disallowed_mime() {
    let c = Client::new().await;
    let (tok, _) = c.seed("a@x.com", "ws-a").await;
    // 二进制但不在白名单里（这里用 PDF 文件头）。
    let (status, _) = c
        .upload("ws-a", &tok, "a.pdf", b"%PDF-1.4\n\xff\xfe\x00\x01binary")
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn outsiders_cannot_download_or_reference() {
    let c = Client::new().await;
    let (ta, _) = c.seed("a@x.com", "ws-a").await;
    let (tb, pb) = c.seed("b@x.com", "ws-b").await;
    let (_, att) = c.upload("ws-a", &ta, "a.png", PNG).await;
    let att_id = att["id"].as_str().unwrap();

    // 非工作区成员不能下载。
    let (status, _) = c.raw(&format!("/api/files/{att_id}"), &tb).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // 也不能在自己的任务里绑定或引用别的工作区的附件。
    let (status, _) = c
        .json(
            "POST",
            &format!("/api/projects/{pb}/issues"),
            Some(&tb),
            Some(json!({ "title": "盗图", "attachment_ids": [att_id] })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (status, _) = c
        .json(
            "POST",
            &format!("/api/projects/{pb}/issues"),
            Some(&tb),
            Some(json!({ "title": "盗图", "description": format!("![x]({att_id})") })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn token_auth_and_revocation() {
    let c = Client::new().await;
    let (jwt, proj) = c.seed("a@x.com", "ws-a").await;

    let (status, created) = c
        .json(
            "POST",
            "/api/tokens",
            Some(&jwt),
            Some(json!({ "name": "agent" })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let pat = created["token"].as_str().unwrap().to_owned();
    assert!(pat.starts_with("zhz_"));

    // 令牌可以访问业务接口……
    let (status, _) = c
        .json(
            "GET",
            &format!("/api/projects/{proj}/issues"),
            Some(&pat),
            None,
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    // ……但不能管理令牌。
    let (status, _) = c.json("GET", "/api/tokens", Some(&pat), None).await;
    assert_eq!(status, StatusCode::FORBIDDEN);

    // 列表不含明文；吊销后立即失效。
    let (_, list) = c.json("GET", "/api/tokens", Some(&jwt), None).await;
    assert!(list[0].get("token").is_none());
    let id = created["id"].as_str().unwrap();
    let (status, _) = c
        .json("DELETE", &format!("/api/tokens/{id}"), Some(&jwt), None)
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = c.json("GET", "/api/auth/me", Some(&pat), None).await;
    assert_eq!(status, StatusCode::UNAUTHORIZED);
}

#[tokio::test]
async fn list_filters_and_date_range() {
    let c = Client::new().await;
    let (tok, proj) = c.seed("a@x.com", "ws-a").await;
    let create = |title: &'static str, priority: &'static str| {
        let c = &c;
        let tok = tok.clone();
        let proj = proj.clone();
        async move {
            c.json(
                "POST",
                &format!("/api/projects/{proj}/issues"),
                Some(&tok),
                Some(json!({ "title": title, "priority": priority })),
            )
            .await
        }
    };
    create("修复登录", "urgent").await;
    create("写文档", "low").await;

    let (_, rows) = c
        .json(
            "GET",
            &format!("/api/projects/{proj}/issues?priority=urgent,high"),
            Some(&tok),
            None,
        )
        .await;
    assert_eq!(rows.as_array().unwrap().len(), 1);
    let (_, rows) = c
        .json(
            "GET",
            &format!("/api/projects/{proj}/issues?q=%E6%96%87%E6%A1%A3"),
            Some(&tok),
            None,
        )
        .await;
    assert_eq!(rows[0]["title"], "写文档");

    let (status, _) = c
        .json(
            "POST",
            &format!("/api/projects/{proj}/issues"),
            Some(&tok),
            Some(json!({ "title": "倒序", "start_date": "2026-05-02", "due_date": "2026-05-01" })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}

#[tokio::test]
async fn comment_binds_images_and_project_delete_cleans_up() {
    let c = Client::new().await;
    let (tok, proj) = c.seed("a@x.com", "ws-a").await;
    let (_, issue) = c
        .json(
            "POST",
            &format!("/api/projects/{proj}/issues"),
            Some(&tok),
            Some(json!({ "title": "任务" })),
        )
        .await;
    let issue_id = issue["id"].as_str().unwrap();
    let (_, att) = c.upload("ws-a", &tok, "a.png", PNG).await;
    let att_id = att["id"].as_str().unwrap();

    // 引用了但没绑定：拒绝，且不留下评论。
    let path = format!("/api/issues/{issue_id}/comments");
    let body = format!("![图]({att_id})");
    let (status, _) = c
        .json("POST", &path, Some(&tok), Some(json!({ "body": body })))
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    let (_, list) = c.json("GET", &path, Some(&tok), None).await;
    assert_eq!(list.as_array().unwrap().len(), 0);

    let (status, _) = c
        .json(
            "POST",
            &path,
            Some(&tok),
            Some(json!({ "body": body, "attachment_ids": [att_id] })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    let (_, fresh) = c
        .json("GET", &format!("/api/issues/{issue_id}"), Some(&tok), None)
        .await;
    assert_eq!(fresh["attachments"][0]["id"], att_id);

    // 删除项目后附件记录一并清除，不能再下载。
    let (status, _) = c
        .json("DELETE", &format!("/api/projects/{proj}"), Some(&tok), None)
        .await;
    assert_eq!(status, StatusCode::NO_CONTENT);
    let (status, _) = c.raw(&format!("/api/files/{att_id}"), &tok).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn saved_views_are_private() {
    let c = Client::new().await;
    let (tok, proj) = c.seed("a@x.com", "ws-a").await;
    let (status, v) = c
        .json(
            "POST",
            &format!("/api/projects/{proj}/views"),
            Some(&tok),
            Some(json!({ "name": "我的紧急", "config": { "kind": "table" } })),
        )
        .await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(v["config"]["kind"], "table");

    let (status, _) = c
        .json(
            "POST",
            &format!("/api/projects/{proj}/views"),
            Some(&tok),
            Some(json!({ "name": "坏配置", "config": [1, 2] })),
        )
        .await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
}
