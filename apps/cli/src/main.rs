//! 知之命令行。给人用，也给 Agent 用：加 `--json` 时只输出机器可读的 JSON，错误写到 stderr，
//! 退出码区分错误类别，方便脚本和 Agent 判断下一步。

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::process::exit;

use clap::{Args, Parser, Subcommand};
use reqwest::Method;
use reqwest::blocking::{Client, RequestBuilder, Response, multipart};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Skill 文件在编译期打进二进制，`zhizhi skill install` 直接写出，版本永远和 CLI 一致。
const SKILL_FILES: &[(&str, &str)] = &[
    ("SKILL.md", include_str!("../skill/SKILL.md")),
    (
        "references/cli.md",
        include_str!("../skill/references/cli.md"),
    ),
    (
        "references/workflows.md",
        include_str!("../skill/references/workflows.md"),
    ),
];

/// 退出码：0 成功 / 1 通用 / 2 未认证 / 3 不存在 / 4 冲突 / 5 网络或服务端 / 6 参数 / 7 无权限。
mod code {
    pub const GENERAL: i32 = 1;
    pub const AUTH: i32 = 2;
    pub const NOT_FOUND: i32 = 3;
    pub const CONFLICT: i32 = 4;
    pub const NETWORK: i32 = 5;
    pub const INVALID: i32 = 6;
    pub const FORBIDDEN: i32 = 7;
}

fn exit_code_for_status(status: u16) -> i32 {
    match status {
        400 | 422 => code::INVALID,
        401 => code::AUTH,
        403 => code::FORBIDDEN,
        404 => code::NOT_FOUND,
        409 => code::CONFLICT,
        _ => code::NETWORK,
    }
}

#[derive(Parser)]
#[command(name = "zhizhi", version, about = "知之命令行：在终端里管理项目与任务")]
struct Cli {
    #[command(flatten)]
    g: Global,
    #[command(subcommand)]
    cmd: Cmd,
}

#[derive(Args)]
struct Global {
    /// 输出 JSON（Agent 请始终加上）
    #[arg(long, global = true)]
    json: bool,
    /// 服务地址，如 `<https://zhizhi.example.com>`
    #[arg(long, global = true)]
    url: Option<String>,
    /// 个人访问令牌（zhz_ 开头，在 Web 设置页创建）
    #[arg(long, global = true)]
    token: Option<String>,
    /// 工作区 URL 标识
    #[arg(long, short = 'w', global = true)]
    workspace: Option<String>,
    /// 默认项目标识，如 CORE
    #[arg(long, short = 'p', global = true)]
    project: Option<String>,
}

#[derive(Subcommand)]
enum Cmd {
    /// 校验令牌并保存为配置
    Login {
        /// 配置名，默认用工作区标识
        #[arg(long)]
        profile: Option<String>,
    },
    /// 查看当前身份和生效的配置
    Whoami,
    /// 管理已保存的配置
    Profile {
        #[command(subcommand)]
        cmd: ProfileCmd,
    },
    /// 安装 Agent Skill
    Skill {
        #[command(subcommand)]
        cmd: SkillCmd,
    },
    /// 项目
    Project {
        #[command(subcommand)]
        cmd: ProjectCmd,
    },
    /// 工作区成员
    Member {
        #[command(subcommand)]
        cmd: MemberCmd,
    },
    /// 任务
    Issue {
        #[command(subcommand)]
        cmd: IssueCmd,
    },
    /// 附件
    File {
        #[command(subcommand)]
        cmd: FileCmd,
    },
}

#[derive(Subcommand)]
enum ProfileCmd {
    List,
    Use { name: String },
}

#[derive(Subcommand)]
enum SkillCmd {
    Install {
        /// user 装到 ~/.claude/skills，project 装到当前目录的 .claude/skills
        #[arg(long, default_value = "user", value_parser = ["user", "project"])]
        scope: String,
        /// 自定义 skills 目录，装到 <dir>/zhizhi；给了就忽略 --scope
        #[arg(long)]
        dir: Option<PathBuf>,
    },
}

#[derive(Subcommand)]
enum ProjectCmd {
    /// 列出工作区里的项目
    List,
    /// 查看项目的状态和标签
    Show { project: Option<String> },
}

#[derive(Subcommand)]
enum MemberCmd {
    List,
}

#[derive(Subcommand)]
enum FileCmd {
    /// 下载附件，默认存到 .zhizhi/attachments/
    Get {
        id: String,
        #[arg(short, long)]
        output: Option<PathBuf>,
    },
}

#[derive(Args)]
struct Filters {
    /// 状态名或状态分组（backlog/unstarted/started/completed/cancelled），可重复
    #[arg(long = "state")]
    states: Vec<String>,
    /// urgent/high/medium/low/none，可重复
    #[arg(long = "priority")]
    priorities: Vec<String>,
    /// 成员邮箱、名字、me 或 none，可重复
    #[arg(long = "assignee")]
    assignees: Vec<String>,
    /// 标签名，可重复
    #[arg(long = "label")]
    labels: Vec<String>,
    /// 标题或描述包含的关键字
    #[arg(long, short = 'q')]
    query: Option<String>,
    /// 截止日期不晚于（YYYY-MM-DD）
    #[arg(long)]
    due_before: Option<String>,
    /// 截止日期不早于（YYYY-MM-DD）
    #[arg(long)]
    due_after: Option<String>,
    /// 只看我负责的
    #[arg(long)]
    mine: bool,
    /// 包含已完成和已取消的
    #[arg(long)]
    all: bool,
}

#[derive(Subcommand)]
enum IssueCmd {
    /// 列出任务
    List {
        #[command(flatten)]
        f: Filters,
    },
    /// 查看任务详情（含评论）
    Get {
        /// 任务编号，如 `<CORE-12>`
        key: String,
        /// 下载附件到本地（默认 `.zhizhi/attachments/<编号>/`），并输出 `description_local`
        // 三态：不给 / 给目录 / 给默认目录。clap 靠 Option<Option<T>> 的推导区分，无法用别名。
        #[allow(clippy::option_option)]
        #[arg(long, num_args = 0..=1)]
        download: Option<Option<PathBuf>>,
    },
    /// 新建任务
    Create {
        #[arg(long, short = 't')]
        title: String,
        /// 描述，支持 Markdown；用 - 从标准输入读取
        #[arg(long, short = 'd', default_value = "")]
        desc: String,
        #[arg(long)]
        state: Option<String>,
        #[arg(long)]
        priority: Option<String>,
        #[arg(long)]
        assignee: Option<String>,
        #[arg(long = "label")]
        labels: Vec<String>,
        #[arg(long)]
        start: Option<String>,
        #[arg(long)]
        due: Option<String>,
        /// 上传附件；描述里写 ![说明](./a.png) 会换成附件引用，没引用的图片追加到描述末尾
        #[arg(long = "attach")]
        attach: Vec<PathBuf>,
    },
    /// 修改任务，只改给出的字段
    Edit {
        key: String,
        #[arg(long, short = 't')]
        title: Option<String>,
        /// 用 - 从标准输入读取
        #[arg(long, short = 'd')]
        desc: Option<String>,
        #[arg(long)]
        state: Option<String>,
        #[arg(long)]
        priority: Option<String>,
        /// 成员邮箱、名字、me；none 表示取消指派
        #[arg(long)]
        assignee: Option<String>,
        /// 替换全部标签；给空字符串清空
        #[arg(long = "label")]
        labels: Option<Vec<String>>,
        /// none 表示清除
        #[arg(long)]
        start: Option<String>,
        /// none 表示清除
        #[arg(long)]
        due: Option<String>,
        #[arg(long = "attach")]
        attach: Vec<PathBuf>,
    },
    /// 把任务移到某个状态，如 started、已完成
    Move { key: String, state: String },
    /// 指派任务；不给成员时指派给自己
    Assign { key: String, member: Option<String> },
    /// 发表评论
    Comment {
        key: String,
        /// 评论内容，支持 Markdown；用 - 从标准输入读取
        body: String,
        #[arg(long = "attach")]
        attach: Vec<PathBuf>,
    },
    /// 删除任务（需要 --yes 确认）
    Delete {
        key: String,
        #[arg(long)]
        yes: bool,
    },
}

// ---------------------------------------------------------------- 配置

#[derive(Default, Serialize, Deserialize, Clone)]
struct Profile {
    url: Option<String>,
    token: Option<String>,
    workspace: Option<String>,
    project: Option<String>,
}

#[derive(Default, Serialize, Deserialize)]
struct UserConfig {
    active: Option<String>,
    #[serde(default)]
    profiles: BTreeMap<String, Profile>,
}

/// 仓库根目录的 `.zhizhi.toml`：团队共享，只放地址、工作区、默认项目，不放令牌。
#[derive(Default, Deserialize)]
struct RepoConfig {
    url: Option<String>,
    workspace: Option<String>,
    project: Option<String>,
}

fn fail(code: i32, json: bool, err_code: &str, message: &str) -> ! {
    if json {
        eprintln!(
            "{}",
            json!({ "error": { "code": err_code, "message": message } })
        );
    } else {
        eprintln!("错误：{message}");
    }
    exit(code)
}

fn config_path() -> PathBuf {
    if let Ok(p) = std::env::var("ZHIZHI_CONFIG")
        && !p.is_empty()
    {
        return PathBuf::from(p);
    }
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("zhizhi/config.toml")
}

fn load_user_config() -> UserConfig {
    std::fs::read_to_string(config_path())
        .ok()
        .and_then(|s| toml::from_str(&s).ok())
        .unwrap_or_default()
}

fn save_user_config(cfg: &UserConfig, json: bool) {
    let path = config_path();
    let write = || -> std::io::Result<()> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        let text = toml::to_string_pretty(cfg).map_err(std::io::Error::other)?;
        std::fs::write(&path, text)?;
        // 配置里有令牌，只允许本人读写。
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
        }
        Ok(())
    };
    if let Err(e) = write() {
        fail(
            code::GENERAL,
            json,
            "config",
            &format!("无法写入 {}：{e}", path.display()),
        );
    }
}

fn find_repo_config() -> RepoConfig {
    let mut dir = std::env::current_dir().ok();
    while let Some(d) = dir {
        let p = d.join(".zhizhi.toml");
        if p.is_file() {
            return std::fs::read_to_string(p)
                .ok()
                .and_then(|s| toml::from_str(&s).ok())
                .unwrap_or_default();
        }
        dir = d.parent().map(Path::to_path_buf);
    }
    RepoConfig::default()
}

#[derive(Clone)]
struct Resolved {
    url: String,
    token: String,
    workspace: String,
    project: Option<String>,
    profile: Option<String>,
}

/// 优先级：命令行参数 > 环境变量 > 仓库 `.zhizhi.toml` > 用户配置里的当前 profile。
fn resolve(g: &Global) -> Resolved {
    let user = load_user_config();
    let profile_name = std::env::var("ZHIZHI_PROFILE")
        .ok()
        .filter(|v| !v.is_empty())
        .or(user.active.clone());
    let prof = profile_name
        .as_ref()
        .and_then(|n| user.profiles.get(n))
        .cloned()
        .unwrap_or_default();
    let repo = find_repo_config();
    let env = |k: &str| std::env::var(k).ok().filter(|v| !v.is_empty());
    let missing = |what: &str| -> ! {
        fail(
            code::AUTH,
            g.json,
            "unauthenticated",
            &format!(
                "缺少{what}。先运行：zhizhi login --url <地址> --token <令牌> --workspace <工作区>"
            ),
        )
    };
    let url = g
        .url
        .clone()
        .or_else(|| env("ZHIZHI_URL"))
        .or(repo.url)
        .or(prof.url)
        .unwrap_or_else(|| missing("服务地址"));
    let token = g
        .token
        .clone()
        .or_else(|| env("ZHIZHI_TOKEN"))
        .or(prof.token)
        .unwrap_or_else(|| missing("访问令牌"));
    let workspace = g
        .workspace
        .clone()
        .or_else(|| env("ZHIZHI_WORKSPACE"))
        .or(repo.workspace)
        .or(prof.workspace)
        .unwrap_or_else(|| missing("工作区"));
    let project = g
        .project
        .clone()
        .or_else(|| env("ZHIZHI_PROJECT"))
        .or(repo.project)
        .or(prof.project);
    Resolved {
        url: url.trim_end_matches('/').to_owned(),
        token,
        workspace,
        project,
        profile: profile_name,
    }
}

// ---------------------------------------------------------------- HTTP

struct Api {
    http: Client,
    r: Resolved,
    json: bool,
}

impl Api {
    fn new(r: Resolved, json: bool) -> Self {
        let http = Client::builder()
            .user_agent(format!("zhizhi-cli/{VERSION}"))
            .build()
            .unwrap_or_else(|e| fail(code::NETWORK, json, "network", &e.to_string()));
        Self { http, r, json }
    }

    fn req(&self, method: Method, path: &str) -> RequestBuilder {
        self.http
            .request(method, format!("{}/api{path}", self.r.url))
            .bearer_auth(&self.r.token)
    }

    /// 非 2xx 时按服务端的错误信封输出，并以对应退出码退出。
    fn checked(&self, b: RequestBuilder) -> Response {
        let resp = b.send().unwrap_or_else(|e| {
            fail(
                code::NETWORK,
                self.json,
                "network",
                &format!("无法连接 {}：{e}", self.r.url),
            )
        });
        let status = resp.status();
        if status.is_success() {
            return resp;
        }
        let text = resp.text().unwrap_or_default();
        let parsed: Option<Value> = serde_json::from_str(&text).ok();
        let (err_code, message) = parsed.as_ref().and_then(|v| v.get("error")).map_or_else(
            || {
                (
                    "http".to_owned(),
                    format!(
                        "HTTP {status}：{}",
                        text.chars().take(200).collect::<String>()
                    ),
                )
            },
            |e| {
                (
                    e["code"].as_str().unwrap_or("http").to_owned(),
                    e["message"].as_str().unwrap_or_default().to_owned(),
                )
            },
        );
        fail(
            exit_code_for_status(status.as_u16()),
            self.json,
            &err_code,
            &message,
        )
    }

    fn send(&self, b: RequestBuilder) -> Value {
        let text = self.checked(b).text().unwrap_or_default();
        serde_json::from_str(&text).unwrap_or(Value::Null)
    }

    fn get(&self, path: &str) -> Value {
        self.send(self.req(Method::GET, path))
    }

    fn get_query(&self, path: &str, query: &[(&str, String)]) -> Value {
        self.send(self.req(Method::GET, path).query(query))
    }

    fn post(&self, path: &str, body: &Value) -> Value {
        self.send(self.req(Method::POST, path).json(body))
    }

    fn patch(&self, path: &str, body: &Value) -> Value {
        self.send(self.req(Method::PATCH, path).json(body))
    }

    fn upload(&self, files: &[PathBuf]) -> Vec<Value> {
        files
            .iter()
            .map(|f| {
                let form = multipart::Form::new().file("file", f).unwrap_or_else(|e| {
                    fail(
                        code::INVALID,
                        self.json,
                        "invalid",
                        &format!("{}：{e}", f.display()),
                    )
                });
                self.send(
                    self.req(
                        Method::POST,
                        &format!("/workspaces/{}/files", self.r.workspace),
                    )
                    .multipart(form),
                )
            })
            .collect()
    }

    fn download(&self, id: &str, dest: &Path) -> String {
        let bytes = self
            .checked(self.req(Method::GET, &format!("/files/{id}")))
            .bytes()
            .unwrap_or_else(|e| fail(code::NETWORK, self.json, "network", &e.to_string()));
        let res = std::fs::create_dir_all(dest.parent().unwrap_or(Path::new(".")))
            .and_then(|()| std::fs::write(dest, &bytes));
        if let Err(e) = res {
            fail(
                code::GENERAL,
                self.json,
                "io",
                &format!("{}：{e}", dest.display()),
            );
        }
        std::path::absolute(dest)
            .unwrap_or_else(|_| dest.to_path_buf())
            .display()
            .to_string()
    }
}

// ---------------------------------------------------------------- 工作区上下文

/// 一个项目的状态和标签。
type ProjectMeta = (Vec<Value>, Vec<Value>);

/// 一次性取回工作区的项目、成员，以及用到的项目的状态和标签，用来把人类可读的名字换成 id。
struct Ctx<'a> {
    api: &'a Api,
    projects: Vec<Value>,
    members: Vec<Value>,
    me: Value,
    meta: std::cell::RefCell<BTreeMap<String, ProjectMeta>>,
}

impl<'a> Ctx<'a> {
    fn load(api: &'a Api) -> Self {
        let ws = &api.r.workspace;
        let projects = api
            .get(&format!("/workspaces/{ws}/projects"))
            .as_array()
            .cloned()
            .unwrap_or_default();
        let members = api
            .get(&format!("/workspaces/{ws}/members"))
            .as_array()
            .cloned()
            .unwrap_or_default();
        let me = api.get("/auth/me");
        Self {
            api,
            projects,
            members,
            me,
            meta: std::cell::RefCell::new(BTreeMap::new()),
        }
    }

    fn json(&self) -> bool {
        self.api.json
    }

    fn invalid(&self, msg: &str) -> ! {
        fail(code::INVALID, self.json(), "invalid", msg)
    }

    fn project(&self, ident: Option<&str>) -> &Value {
        let ident = ident.or(self.api.r.project.as_deref()).unwrap_or_else(|| {
            if self.projects.len() == 1 {
                return self.projects[0]["identifier"].as_str().unwrap_or_default();
            }
            self.invalid("没有指定项目。用 --project <标识> 指定，或在 .zhizhi.toml 里设置 project")
        });
        self.projects
            .iter()
            .find(|p| {
                p["identifier"]
                    .as_str()
                    .is_some_and(|i| i.eq_ignore_ascii_case(ident))
            })
            .unwrap_or_else(|| {
                let all: Vec<&str> = self
                    .projects
                    .iter()
                    .filter_map(|p| p["identifier"].as_str())
                    .collect();
                fail(
                    code::NOT_FOUND,
                    self.json(),
                    "not_found",
                    &format!("项目 {ident} 不存在，可用：{}", all.join(", ")),
                )
            })
    }

    fn project_by_id(&self, id: &str) -> Option<&Value> {
        self.projects.iter().find(|p| p["id"] == id)
    }

    fn meta(&self, project_id: &str) -> ProjectMeta {
        if let Some(m) = self.meta.borrow().get(project_id) {
            return m.clone();
        }
        let arr = |v: Value| v.as_array().cloned().unwrap_or_default();
        let states = arr(self.api.get(&format!("/projects/{project_id}/states")));
        let labels = arr(self.api.get(&format!("/projects/{project_id}/labels")));
        self.meta
            .borrow_mut()
            .insert(project_id.to_owned(), (states.clone(), labels.clone()));
        (states, labels)
    }

    /// 状态可以写名字（「进行中」）或分组（started）。
    fn state_id(&self, project_id: &str, name: &str) -> String {
        let (states, _) = self.meta(project_id);
        let by_name = states.iter().find(|s| s["name"] == name);
        let by_group = || {
            states
                .iter()
                .filter(|s| {
                    s["group"]
                        .as_str()
                        .is_some_and(|g| g.eq_ignore_ascii_case(name))
                })
                .min_by(|a, b| {
                    a["position"]
                        .as_f64()
                        .partial_cmp(&b["position"].as_f64())
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
        };
        by_name
            .or_else(by_group)
            .and_then(|s| s["id"].as_str())
            .map_or_else(
                || {
                    let all: Vec<&str> = states.iter().filter_map(|s| s["name"].as_str()).collect();
                    self.invalid(&format!(
                        "状态「{name}」不存在。可用：{}，或分组 backlog/unstarted/started/completed/cancelled",
                        all.join("、")
                    ))
                },
                str::to_owned,
            )
    }

    fn label_ids(&self, project_id: &str, names: &[String]) -> Vec<String> {
        let (_, labels) = self.meta(project_id);
        names
            .iter()
            .filter(|n| !n.is_empty())
            .map(|n| {
                labels
                    .iter()
                    .find(|l| l["name"] == n.as_str())
                    .and_then(|l| l["id"].as_str())
                    .map_or_else(
                        || {
                            let all: Vec<&str> =
                                labels.iter().filter_map(|l| l["name"].as_str()).collect();
                            self.invalid(&format!("标签「{n}」不存在。可用：{}", all.join("、")))
                        },
                        str::to_owned,
                    )
            })
            .collect()
    }

    /// 成员可以写邮箱、名字或 me；返回 None 表示 none（未指派）。
    fn member_id(&self, who: &str) -> Option<String> {
        match who {
            "none" => None,
            "me" => self.me["id"].as_str().map(str::to_owned),
            _ => {
                let matches: Vec<&Value> = self
                    .members
                    .iter()
                    .filter(|m| {
                        m["email"]
                            .as_str()
                            .is_some_and(|e| e.eq_ignore_ascii_case(who))
                            || m["name"] == who
                    })
                    .collect();
                match matches.as_slice() {
                    [m] => m["id"].as_str().map(str::to_owned),
                    [] => self.invalid(&format!(
                        "工作区里没有成员「{who}」，用 zhizhi member list 查看"
                    )),
                    _ => self.invalid(&format!("有多个成员叫「{who}」，请改用邮箱")),
                }
            }
        }
    }

    fn member_name(&self, id: &Value) -> String {
        self.members
            .iter()
            .find(|m| m["id"] == *id)
            .and_then(|m| m["name"].as_str())
            .unwrap_or("")
            .to_owned()
    }

    fn issue(&self, key: &str) -> Value {
        self.api.get(&format!(
            "/workspaces/{}/issues/{}",
            self.api.r.workspace,
            key.trim()
        ))
    }

    fn key_of(&self, issue: &Value) -> String {
        let ident = issue["project_id"]
            .as_str()
            .and_then(|p| self.project_by_id(p))
            .and_then(|p| p["identifier"].as_str())
            .unwrap_or("?");
        format!("{ident}-{}", issue["seq"])
    }

    /// 给任务补上人类可读的字段（编号、状态名、负责人、标签名），Agent 不必再查一次。
    fn enrich(&self, mut issue: Value) -> Value {
        let project_id = issue["project_id"].as_str().unwrap_or_default().to_owned();
        let (states, labels) = self.meta(&project_id);
        let state = states.iter().find(|s| s["id"] == issue["state_id"]);
        issue["key"] = json!(self.key_of(&issue));
        issue["state"] = json!(state.and_then(|s| s["name"].as_str()));
        issue["state_group"] = json!(state.and_then(|s| s["group"].as_str()));
        issue["assignee"] = if issue["assignee_id"].is_null() {
            Value::Null
        } else {
            json!(self.member_name(&issue["assignee_id"]))
        };
        let names: Vec<Value> = issue["label_ids"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|id| labels.iter().find(|l| l["id"] == *id))
            .map(|l| l["name"].clone())
            .collect();
        issue["labels"] = json!(names);
        issue
    }
}

// ---------------------------------------------------------------- 正文与附件

/// 描述里写 `](./a.png)` 并带 `--attach ./a.png` 时，上传后换成 `](ATT-xxx)`；
/// 没有在正文里引用的图片追加到末尾，保证图片一定出现在任务里。
fn link_uploads(text: &str, files: &[PathBuf], uploaded: &[Value]) -> String {
    let mut out = text.to_owned();
    let mut unreferenced = Vec::new();
    for (f, a) in files.iter().zip(uploaded) {
        let id = a["id"].as_str().unwrap_or_default();
        let shown = f.display().to_string();
        let variants = [
            shown.clone(),
            format!("./{}", shown.trim_start_matches("./")),
        ];
        let mut hit = false;
        for v in variants {
            let needle = format!("]({v})");
            if out.contains(&needle) {
                out = out.replace(&needle, &format!("]({id})"));
                hit = true;
            }
        }
        if !hit {
            let name = a["filename"].as_str().unwrap_or("附件");
            let image = a["mime"].as_str().is_some_and(|m| m.starts_with("image/"));
            unreferenced.push(if image {
                format!("![{name}]({id})")
            } else {
                format!("[{name}]({id})")
            });
        }
    }
    if !unreferenced.is_empty() {
        if !out.is_empty() && !out.ends_with('\n') {
            out.push('\n');
        }
        if !out.is_empty() {
            out.push('\n');
        }
        out.push_str(&unreferenced.join("\n"));
    }
    out
}

/// 按出现顺序返回正文里 `](ATT-xxx)` 的位置与 id。
fn attachment_refs(text: &str) -> Vec<(usize, &str)> {
    let mut spans = Vec::new();
    let mut from = 0;
    while let Some(pos) = text[from..].find("](ATT-") {
        let start = from + pos + 2;
        let rest = &text[start + 4..];
        let len = rest
            .find(|c: char| !c.is_ascii_alphanumeric())
            .unwrap_or(rest.len());
        if len > 0 && rest[len..].starts_with(')') {
            spans.push((start, &text[start..start + 4 + len]));
        }
        from = start;
    }
    spans
}

fn rewrite_refs(text: &str, map: &BTreeMap<String, String>) -> String {
    let mut out = String::with_capacity(text.len());
    let mut last = 0;
    for (start, id) in attachment_refs(text) {
        if let Some(rep) = map.get(id) {
            out.push_str(&text[last..start]);
            out.push_str(rep);
            last = start + id.len();
        }
    }
    out.push_str(&text[last..]);
    out
}

/// 附件缓存目录。首次创建时写入 `*` 的 .gitignore，避免把下载的图片提交进仓库。
fn attachments_root() -> PathBuf {
    let root = PathBuf::from(".zhizhi/attachments");
    let ignore = PathBuf::from(".zhizhi/.gitignore");
    if !ignore.exists() {
        let _ = std::fs::create_dir_all(&root).and_then(|()| std::fs::write(&ignore, "*\n"));
    }
    root
}

fn safe_filename(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || matches!(c, '.' | '-' | '_') {
                c
            } else {
                '_'
            }
        })
        .collect();
    let s = s.trim_start_matches('.');
    if s.is_empty() {
        "file".into()
    } else {
        s.into()
    }
}

/// `-` 表示从标准输入读取，方便传多行 Markdown。
fn read_text(v: &str, json: bool) -> String {
    if v != "-" {
        return v.to_owned();
    }
    let mut s = String::new();
    if let Err(e) = std::io::Read::read_to_string(&mut std::io::stdin(), &mut s) {
        fail(
            code::INVALID,
            json,
            "invalid",
            &format!("读取标准输入失败：{e}"),
        );
    }
    s
}

fn validate_priority(p: &str, json: bool) -> String {
    let p = p.trim().to_lowercase();
    let mapped = match p.as_str() {
        "p0" | "紧急" => "urgent",
        "p1" | "高" => "high",
        "p2" | "中" => "medium",
        "p3" | "低" => "low",
        other => other,
    };
    if ["urgent", "high", "medium", "low", "none"].contains(&mapped) {
        mapped.to_owned()
    } else {
        fail(
            code::INVALID,
            json,
            "invalid",
            "优先级只能是 urgent/high/medium/low/none（也接受 P0-P3）",
        )
    }
}

/// 日期参数：YYYY-MM-DD、today、tomorrow、+N（N 天后），或 none 表示清除。
fn parse_date(v: &str, json: bool) -> Option<String> {
    let v = v.trim();
    if v.eq_ignore_ascii_case("none") {
        return None;
    }
    let days = match v {
        "today" | "今天" => Some(0),
        "tomorrow" | "明天" => Some(1),
        _ => v.strip_prefix('+').and_then(|n| n.parse::<i64>().ok()),
    };
    if let Some(n) = days {
        return Some(days_from_today(n));
    }
    let ok = v.len() == 10
        && v.as_bytes()[4] == b'-'
        && v.as_bytes()[7] == b'-'
        && v.chars().filter(char::is_ascii_digit).count() == 8;
    if ok {
        Some(v.to_owned())
    } else {
        fail(
            code::INVALID,
            json,
            "invalid",
            &format!("无法识别日期「{v}」，请用 YYYY-MM-DD、today、tomorrow 或 +N"),
        )
    }
}

/// 本地时区今天加 N 天。不引入时间库：用系统 date 的结果不可移植，这里按 UTC 天数换算，
/// 跨时区的一天误差对「截止日期」可以接受，并在帮助里说明以服务端日期为准。
fn days_from_today(n: i64) -> String {
    let secs = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_or(0, |d| i64::try_from(d.as_secs()).unwrap_or(0));
    civil_from_days(secs.div_euclid(86_400) + n)
}

/// Howard Hinnant 的 `civil_from_days`：把 1970-01-01 起的天数换成公历日期。
fn civil_from_days(z: i64) -> String {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!("{y:04}-{m:02}-{d:02}")
}

// ---------------------------------------------------------------- 输出

fn emit(v: &Value, json: bool, human: impl FnOnce(&Value)) {
    if json {
        println!("{}", serde_json::to_string(v).unwrap_or_default());
    } else {
        human(v);
    }
}

fn pad(s: &str, width: usize) -> String {
    // 中文按两个宽度计算，让列表在终端里对齐。
    let w: usize = s.chars().map(|c| if c.is_ascii() { 1 } else { 2 }).sum();
    format!("{s}{}", " ".repeat(width.saturating_sub(w)))
}

/// 终端里显示中文优先级，JSON 里保持服务端的英文键值。
fn priority_label(p: &str) -> &str {
    match p {
        "urgent" => "紧急",
        "high" => "高",
        "medium" => "中",
        "low" => "低",
        _ => "无",
    }
}

fn print_issue_row(i: &Value) {
    let s = |k: &str| i[k].as_str().unwrap_or("").to_owned();
    let due = i["due_date"]
        .as_str()
        .map(|d| format!("  截止 {d}"))
        .unwrap_or_default();
    let who = i["assignee"]
        .as_str()
        .map(|a| format!("  @{a}"))
        .unwrap_or_default();
    println!(
        "{} {} {} {}{}{}",
        pad(&s("key"), 10),
        pad(&s("state"), 8),
        pad(priority_label(&s("priority")), 6),
        s("title"),
        who,
        due
    );
}

fn print_issue_detail(i: &Value) {
    let s = |k: &str| i[k].as_str().unwrap_or("—").to_owned();
    println!("{}  {}", s("key"), s("title"));
    println!(
        "状态 {}  优先级 {}  负责人 {}",
        s("state"),
        priority_label(&s("priority")),
        i["assignee"].as_str().unwrap_or("未指派")
    );
    if !i["start_date"].is_null() || !i["due_date"].is_null() {
        println!("开始 {}  截止 {}", s("start_date"), s("due_date"));
    }
    let labels: Vec<&str> = i["labels"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .collect();
    if !labels.is_empty() {
        println!("标签 {}", labels.join("、"));
    }
    let desc = i["description_local"]
        .as_str()
        .or(i["description"].as_str())
        .unwrap_or("");
    if !desc.trim().is_empty() {
        println!("\n{desc}");
    }
    for a in i["attachments"].as_array().into_iter().flatten() {
        let local = a["local_path"]
            .as_str()
            .map(|p| format!(" → {p}"))
            .unwrap_or_default();
        println!("附件 {} {}{}", s_of(a, "id"), s_of(a, "filename"), local);
    }
    let comments = i["comments"].as_array().cloned().unwrap_or_default();
    if !comments.is_empty() {
        println!("\n评论 {}", comments.len());
        for c in comments {
            println!(
                "— {} {}\n{}",
                s_of(&c, "author"),
                s_of(&c, "created_at"),
                s_of(&c, "body")
            );
        }
    }
}

fn s_of(v: &Value, k: &str) -> String {
    v[k].as_str().unwrap_or("").to_owned()
}

// ---------------------------------------------------------------- 命令

fn main() {
    let cli = Cli::parse();
    let g = &cli.g;
    match &cli.cmd {
        Cmd::Login { profile } => login(g, profile.clone()),
        Cmd::Profile { cmd } => profile_cmd(g, cmd),
        Cmd::Skill {
            cmd: SkillCmd::Install { scope, dir },
        } => skill_install(g, scope, dir.as_deref()),
        Cmd::Whoami => whoami(g),
        Cmd::Project { cmd } => project_cmd(g, cmd),
        Cmd::Member {
            cmd: MemberCmd::List,
        } => {
            let api = Api::new(resolve(g), g.json);
            let v = api.get(&format!("/workspaces/{}/members", api.r.workspace));
            emit(&v, g.json, |v| {
                for m in v.as_array().into_iter().flatten() {
                    println!(
                        "{} {} {}",
                        pad(&s_of(m, "name"), 12),
                        pad(&s_of(m, "email"), 28),
                        s_of(m, "role")
                    );
                }
            });
        }
        Cmd::Issue { cmd } => issue_cmd(g, cmd),
        Cmd::File {
            cmd: FileCmd::Get { id, output },
        } => {
            let api = Api::new(resolve(g), g.json);
            let dest = output
                .clone()
                .unwrap_or_else(|| attachments_root().join(id));
            let path = api.download(id, &dest);
            emit(&json!({ "id": id, "local_path": path }), g.json, |_| {
                println!("{path}");
            });
        }
    }
}

fn login(g: &Global, profile: Option<String>) {
    let (Some(url), Some(token), Some(workspace)) = (&g.url, &g.token, &g.workspace) else {
        fail(
            code::INVALID,
            g.json,
            "invalid",
            "用法：zhizhi login --url <地址> --token <令牌> --workspace <工作区> [--project <标识>]",
        )
    };
    let r = Resolved {
        url: url.trim_end_matches('/').to_owned(),
        token: token.clone(),
        workspace: workspace.clone(),
        project: g.project.clone(),
        profile: None,
    };
    let api = Api::new(r, g.json);
    // 先确认令牌和工作区都有效，再写配置。
    let me = api.get("/auth/me");
    let ws = api.get(&format!("/workspaces/{workspace}"));
    let name = profile.unwrap_or_else(|| workspace.clone());
    let mut cfg = load_user_config();
    cfg.profiles.insert(
        name.clone(),
        Profile {
            url: Some(api.r.url.clone()),
            token: Some(token.clone()),
            workspace: Some(workspace.clone()),
            project: g.project.clone(),
        },
    );
    cfg.active = Some(name.clone());
    save_user_config(&cfg, g.json);
    let out = json!({ "profile": name, "user": me, "workspace": ws, "config": config_path() });
    emit(&out, g.json, |_| {
        println!(
            "已登录为 {}（{}），工作区「{}」。配置保存为 {name}。",
            s_of(&me, "name"),
            s_of(&me, "email"),
            s_of(&ws, "name")
        );
    });
}

fn whoami(g: &Global) {
    let api = Api::new(resolve(g), g.json);
    let me = api.get("/auth/me");
    let ws = api.get(&format!("/workspaces/{}", api.r.workspace));
    let out = json!({
        "user": me,
        "workspace": ws,
        "url": api.r.url,
        "project": api.r.project,
        "profile": api.r.profile,
    });
    emit(&out, g.json, |_| {
        println!("{}（{}）", s_of(&me, "name"), s_of(&me, "email"));
        println!("服务 {}", api.r.url);
        println!("工作区 {}（{}）", s_of(&ws, "name"), api.r.workspace);
        if let Some(p) = &api.r.project {
            println!("默认项目 {p}");
        }
    });
}

fn profile_cmd(g: &Global, cmd: &ProfileCmd) {
    let mut cfg = load_user_config();
    match cmd {
        ProfileCmd::List => {
            let items: Vec<Value> = cfg
                .profiles
                .iter()
                .map(|(n, p)| {
                    json!({
                        "name": n, "url": p.url, "workspace": p.workspace, "project": p.project,
                        "active": cfg.active.as_deref() == Some(n.as_str()),
                    })
                })
                .collect();
            emit(&Value::Array(items), g.json, |v| {
                for i in v.as_array().into_iter().flatten() {
                    let mark = if i["active"] == true { "*" } else { " " };
                    println!(
                        "{mark} {} {} {}",
                        pad(&s_of(i, "name"), 16),
                        pad(&s_of(i, "workspace"), 16),
                        s_of(i, "url")
                    );
                }
            });
        }
        ProfileCmd::Use { name } => {
            if !cfg.profiles.contains_key(name) {
                fail(
                    code::NOT_FOUND,
                    g.json,
                    "not_found",
                    &format!("配置 {name} 不存在"),
                );
            }
            cfg.active = Some(name.clone());
            save_user_config(&cfg, g.json);
            emit(&json!({ "active": name }), g.json, |_| {
                println!("已切换到 {name}");
            });
        }
    }
}

fn skill_install(g: &Global, scope: &str, dir: Option<&Path>) {
    let home = || {
        dirs::home_dir()
            .unwrap_or_else(|| fail(code::GENERAL, g.json, "config", "找不到用户主目录"))
    };
    let root = match dir {
        // 引号包住或 PowerShell 下 `~` 不会被 shell 展开，这里补上。
        Some(d) => match d.strip_prefix("~") {
            Ok(rest) => home().join(rest),
            Err(_) => d.to_path_buf(),
        }
        .join("zhizhi"),
        None if scope == "project" => PathBuf::from(".claude/skills/zhizhi"),
        None => home().join(".claude/skills/zhizhi"),
    };
    for (rel, content) in SKILL_FILES {
        let p = root.join(rel);
        let res = std::fs::create_dir_all(p.parent().unwrap_or(&root))
            .and_then(|()| std::fs::write(&p, content));
        if let Err(e) = res {
            fail(
                code::GENERAL,
                g.json,
                "io",
                &format!("{}：{e}", p.display()),
            );
        }
    }
    let out = json!({ "installed": root.display().to_string(), "files": SKILL_FILES.len() });
    emit(&out, g.json, |_| {
        println!("Skill 已安装到 {}", root.display());
    });
}

fn project_cmd(g: &Global, cmd: &ProjectCmd) {
    let api = Api::new(resolve(g), g.json);
    let ctx = Ctx::load(&api);
    match cmd {
        ProjectCmd::List => emit(&Value::Array(ctx.projects.clone()), g.json, |v| {
            for p in v.as_array().into_iter().flatten() {
                println!(
                    "{} {} {}",
                    pad(&s_of(p, "identifier"), 8),
                    pad(&s_of(p, "name"), 20),
                    s_of(p, "description")
                );
            }
        }),
        ProjectCmd::Show { project } => {
            let p = ctx.project(project.as_deref()).clone();
            let (states, labels) = ctx.meta(p["id"].as_str().unwrap_or_default());
            let out = json!({ "project": p, "states": states, "labels": labels });
            emit(&out, g.json, |_| {
                println!("{}  {}", s_of(&p, "identifier"), s_of(&p, "name"));
                let st: Vec<String> = states
                    .iter()
                    .map(|s| format!("{}({})", s_of(s, "name"), s_of(s, "group")))
                    .collect();
                println!("状态 {}", st.join("  "));
                let lb: Vec<String> = labels.iter().map(|l| s_of(l, "name")).collect();
                println!(
                    "标签 {}",
                    if lb.is_empty() {
                        "无".into()
                    } else {
                        lb.join("、")
                    }
                );
            });
        }
    }
}

fn list_issues(ctx: &Ctx, f: &Filters) -> Vec<Value> {
    let api = ctx.api;
    let project_ids: Vec<String> = match api.r.project.as_deref() {
        Some(p) => vec![
            ctx.project(Some(p))["id"]
                .as_str()
                .unwrap_or_default()
                .to_owned(),
        ],
        None => ctx
            .projects
            .iter()
            .filter_map(|p| p["id"].as_str().map(str::to_owned))
            .collect(),
    };
    let mut assignees: Vec<String> = f
        .assignees
        .iter()
        .map(|a| ctx.member_id(a).unwrap_or_else(|| "none".into()))
        .collect();
    if f.mine
        && let Some(me) = ctx.me["id"].as_str()
    {
        assignees.push(me.to_owned());
    }
    let priorities: Vec<String> = f
        .priorities
        .iter()
        .map(|p| validate_priority(p, ctx.json()))
        .collect();
    for d in [&f.due_before, &f.due_after].into_iter().flatten() {
        parse_date(d, ctx.json());
    }
    let mut out = Vec::new();
    for pid in project_ids {
        let mut q: Vec<(&str, String)> = Vec::new();
        if !f.states.is_empty() {
            let ids: Vec<String> = f.states.iter().map(|s| ctx.state_id(&pid, s)).collect();
            q.push(("state", ids.join(",")));
        }
        if !priorities.is_empty() {
            q.push(("priority", priorities.join(",")));
        }
        if !assignees.is_empty() {
            q.push(("assignee", assignees.join(",")));
        }
        if !f.labels.is_empty() {
            // 多项目查询时，标签只在拥有它的项目里生效；其他项目直接跳过。
            let (_, labels) = ctx.meta(&pid);
            let ids: Vec<String> = f
                .labels
                .iter()
                .filter_map(|n| labels.iter().find(|l| l["name"] == n.as_str()))
                .filter_map(|l| l["id"].as_str().map(str::to_owned))
                .collect();
            if ids.is_empty() {
                continue;
            }
            q.push(("label", ids.join(",")));
        }
        if let Some(text) = &f.query {
            q.push(("q", text.clone()));
        }
        if let Some(d) = f
            .due_before
            .as_deref()
            .and_then(|d| parse_date(d, ctx.json()))
        {
            q.push(("due_before", d));
        }
        if let Some(d) = f
            .due_after
            .as_deref()
            .and_then(|d| parse_date(d, ctx.json()))
        {
            q.push(("due_after", d));
        }
        let rows = api.get_query(&format!("/projects/{pid}/issues"), &q);
        for i in rows.as_array().cloned().unwrap_or_default() {
            let i = ctx.enrich(i);
            // 默认隐藏已完成和已取消；按状态筛选时以用户给的状态为准。
            let closed = matches!(i["state_group"].as_str(), Some("completed" | "cancelled"));
            if closed && !f.all && f.states.is_empty() {
                continue;
            }
            out.push(i);
        }
    }
    out
}

fn issue_cmd(g: &Global, cmd: &IssueCmd) {
    let api = Api::new(resolve(g), g.json);
    let ctx = Ctx::load(&api);
    match cmd {
        IssueCmd::List { f } => cmd_list(&ctx, f),
        IssueCmd::Get { key, download } => cmd_get(&ctx, key, download.as_ref()),
        IssueCmd::Create {
            title,
            desc,
            state,
            priority,
            assignee,
            labels,
            start,
            due,
            attach,
        } => cmd_create(
            &ctx,
            &CreateArgs {
                title,
                desc,
                state: state.as_deref(),
                priority: priority.as_deref(),
                assignee: assignee.as_deref(),
                labels,
                start: start.as_deref(),
                due: due.as_deref(),
                attach,
            },
        ),
        IssueCmd::Edit {
            key,
            title,
            desc,
            state,
            priority,
            assignee,
            labels,
            start,
            due,
            attach,
        } => cmd_edit(
            &ctx,
            key,
            &EditArgs {
                title: title.as_deref(),
                desc: desc.as_deref(),
                state: state.as_deref(),
                priority: priority.as_deref(),
                assignee: assignee.as_deref(),
                labels: labels.as_deref(),
                start: start.as_deref(),
                due: due.as_deref(),
                attach,
            },
        ),
        IssueCmd::Move { key, state } => cmd_move(&ctx, key, state),
        IssueCmd::Assign { key, member } => cmd_assign(&ctx, key, member.as_deref()),
        IssueCmd::Comment { key, body, attach } => cmd_comment(&ctx, key, body, attach),
        IssueCmd::Delete { key, yes } => cmd_delete(&ctx, key, *yes),
    }
}

/// 新建任务的参数，避免把一个函数写成十个位置参数。
struct CreateArgs<'a> {
    title: &'a str,
    desc: &'a str,
    state: Option<&'a str>,
    priority: Option<&'a str>,
    assignee: Option<&'a str>,
    labels: &'a [String],
    start: Option<&'a str>,
    due: Option<&'a str>,
    attach: &'a [PathBuf],
}

#[allow(clippy::struct_field_names)]
struct EditArgs<'a> {
    title: Option<&'a str>,
    desc: Option<&'a str>,
    state: Option<&'a str>,
    priority: Option<&'a str>,
    assignee: Option<&'a str>,
    labels: Option<&'a [String]>,
    start: Option<&'a str>,
    due: Option<&'a str>,
    attach: &'a [PathBuf],
}

fn cmd_list(ctx: &Ctx, f: &Filters) {
    let json = ctx.json();
    let rows = list_issues(ctx, f);
    emit(&Value::Array(rows), json, |v| {
        let rows = v.as_array().cloned().unwrap_or_default();
        for i in &rows {
            print_issue_row(i);
        }
        println!("共 {} 个任务", rows.len());
    });
}

fn cmd_get(ctx: &Ctx, key: &str, download: Option<&Option<PathBuf>>) {
    let api = ctx.api;
    let json = ctx.json();
    let mut out = ctx.enrich(ctx.issue(key));
    let id = s_of(&out, "id");
    let comments: Vec<Value> = api
        .get(&format!("/issues/{id}/comments"))
        .as_array()
        .cloned()
        .unwrap_or_default()
        .into_iter()
        .map(|mut c| {
            c["author"] = json!(ctx.member_name(&c["author_id"]));
            c
        })
        .collect();
    out["comments"] = json!(comments);
    if let Some(dir) = download {
        let dir = dir
            .clone()
            .unwrap_or_else(|| attachments_root().join(key.to_uppercase()));
        let mut paths = BTreeMap::new();
        for a in out["attachments"].as_array_mut().into_iter().flatten() {
            let aid = s_of(a, "id");
            let name = safe_filename(a["filename"].as_str().unwrap_or("file"));
            let path = api.download(&aid, &dir.join(format!("{aid}-{name}")));
            a["local_path"] = json!(path);
            paths.insert(aid, path);
        }
        let desc = s_of(&out, "description");
        out["description_local"] = json!(rewrite_refs(&desc, &paths));
        for c in out["comments"].as_array_mut().into_iter().flatten() {
            let body = s_of(c, "body");
            c["body_local"] = json!(rewrite_refs(&body, &paths));
        }
    }
    emit(&out, json, print_issue_detail);
}

fn cmd_create(ctx: &Ctx, a: &CreateArgs) {
    let json = ctx.json();
    let project = ctx.project(None).clone();
    let pid = s_of(&project, "id");
    let mut body = json!({ "title": a.title });
    if let Some(s) = a.state {
        body["state_id"] = json!(ctx.state_id(&pid, s));
    }
    if let Some(p) = a.priority {
        body["priority"] = json!(validate_priority(p, json));
    }
    if let Some(who) = a.assignee {
        body["assignee_id"] = json!(ctx.member_id(who));
    }
    if !a.labels.is_empty() {
        body["label_ids"] = json!(ctx.label_ids(&pid, a.labels));
    }
    if let Some(d) = a.start {
        body["start_date"] = json!(parse_date(d, json));
    }
    if let Some(d) = a.due {
        body["due_date"] = json!(parse_date(d, json));
    }
    // 参数全部校验完再上传，避免校验失败留下没人用的附件。
    let desc = read_text(a.desc, json);
    let uploaded = ctx.api.upload(a.attach);
    body["description"] = json!(link_uploads(&desc, a.attach, &uploaded));
    body["attachment_ids"] = json!(ids_of(&uploaded));
    let issue = ctx.enrich(ctx.api.post(&format!("/projects/{pid}/issues"), &body));
    emit(&issue, json, |i| {
        println!("已创建 {}  {}", s_of(i, "key"), s_of(i, "title"));
    });
}

fn cmd_edit(ctx: &Ctx, key: &str, a: &EditArgs) {
    let json = ctx.json();
    let cur = ctx.issue(key);
    let pid = s_of(&cur, "project_id");
    let mut body = json!({});
    if let Some(t) = a.title {
        body["title"] = json!(t);
    }
    if let Some(s) = a.state {
        body["state_id"] = json!(ctx.state_id(&pid, s));
    }
    if let Some(p) = a.priority {
        body["priority"] = json!(validate_priority(p, json));
    }
    if let Some(who) = a.assignee {
        body["assignee_id"] = json!(ctx.member_id(who));
    }
    if let Some(ls) = a.labels {
        body["label_ids"] = json!(ctx.label_ids(&pid, ls));
    }
    if let Some(d) = a.start {
        body["start_date"] = json!(parse_date(d, json));
    }
    if let Some(d) = a.due {
        body["due_date"] = json!(parse_date(d, json));
    }
    if !a.attach.is_empty() || a.desc.is_some() {
        // 重新上传时以新正文（或原正文）为底，已有附件保持不动。
        let base = a
            .desc
            .map_or_else(|| s_of(&cur, "description"), |d| read_text(d, json));
        let uploaded = ctx.api.upload(a.attach);
        body["description"] = json!(link_uploads(&base, a.attach, &uploaded));
        body["attachment_ids"] = json!(ids_of(&uploaded));
    }
    if body.as_object().is_some_and(serde_json::Map::is_empty) {
        ctx.invalid("没有要修改的字段，用 zhizhi issue edit --help 查看可改的字段");
    }
    let id = s_of(&cur, "id");
    let issue = ctx.enrich(ctx.api.patch(&format!("/issues/{id}"), &body));
    emit(&issue, json, |i| println!("已更新 {}", s_of(i, "key")));
}

fn cmd_move(ctx: &Ctx, key: &str, state: &str) {
    let cur = ctx.issue(key);
    let pid = s_of(&cur, "project_id");
    let body = json!({ "state_id": ctx.state_id(&pid, state) });
    let issue = ctx.enrich(
        ctx.api
            .patch(&format!("/issues/{}", s_of(&cur, "id")), &body),
    );
    emit(&issue, ctx.json(), |i| {
        println!("{} → {}", s_of(i, "key"), s_of(i, "state"));
    });
}

fn cmd_assign(ctx: &Ctx, key: &str, member: Option<&str>) {
    let cur = ctx.issue(key);
    let body = json!({ "assignee_id": ctx.member_id(member.unwrap_or("me")) });
    let issue = ctx.enrich(
        ctx.api
            .patch(&format!("/issues/{}", s_of(&cur, "id")), &body),
    );
    emit(&issue, ctx.json(), |i| {
        println!(
            "{} 负责人：{}",
            s_of(i, "key"),
            i["assignee"].as_str().unwrap_or("未指派")
        );
    });
}

fn cmd_comment(ctx: &Ctx, key: &str, body: &str, attach: &[PathBuf]) {
    let json = ctx.json();
    let cur = ctx.issue(key);
    let text = read_text(body, json);
    if text.trim().is_empty() && attach.is_empty() {
        ctx.invalid("评论内容不能为空");
    }
    let uploaded = ctx.api.upload(attach);
    let req = json!({
        "body": link_uploads(&text, attach, &uploaded),
        "attachment_ids": json!(ids_of(&uploaded)),
    });
    let c = ctx
        .api
        .post(&format!("/issues/{}/comments", s_of(&cur, "id")), &req);
    let k = ctx.key_of(&cur);
    emit(&c, json, |_| println!("已评论 {k}"));
}

fn cmd_delete(ctx: &Ctx, key: &str, yes: bool) {
    if !yes {
        ctx.invalid("删除不可恢复，确认后加 --yes 重试");
    }
    let cur = ctx.issue(key);
    let api = ctx.api;
    api.checked(api.req(Method::DELETE, &format!("/issues/{}", s_of(&cur, "id"))));
    let k = ctx.key_of(&cur);
    emit(&json!({ "deleted": k }), ctx.json(), |_| {
        println!("已删除 {k}");
    });
}

fn ids_of(uploaded: &[Value]) -> Vec<Value> {
    uploaded.iter().map(|a| a["id"].clone()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn links_referenced_uploads_and_appends_the_rest() {
        let files = vec![PathBuf::from("./shot.png"), PathBuf::from("log.txt")];
        let uploaded = vec![
            json!({ "id": "ATT-a1", "filename": "shot.png", "mime": "image/png" }),
            json!({ "id": "ATT-b2", "filename": "log.txt", "mime": "text/plain" }),
        ];
        let out = link_uploads("看图 ![截图](./shot.png)", &files, &uploaded);
        assert_eq!(out, "看图 ![截图](ATT-a1)\n\n[log.txt](ATT-b2)");
    }

    #[test]
    fn matches_paths_with_or_without_dot_slash() {
        let files = vec![PathBuf::from("shot.png")];
        let uploaded = vec![json!({ "id": "ATT-a1", "filename": "shot.png", "mime": "image/png" })];
        assert_eq!(
            link_uploads("![](./shot.png)", &files, &uploaded),
            "![](ATT-a1)"
        );
    }

    #[test]
    fn appends_images_to_empty_description() {
        let files = vec![PathBuf::from("a.png")];
        let uploaded = vec![json!({ "id": "ATT-a1", "filename": "a.png", "mime": "image/png" })];
        assert_eq!(link_uploads("", &files, &uploaded), "![a.png](ATT-a1)");
    }

    #[test]
    fn rewrites_refs_to_local_paths() {
        let mut map = BTreeMap::new();
        map.insert("ATT-a1".to_owned(), "/tmp/a.png".to_owned());
        let t = "![x](ATT-a1) 和 [y](ATT-b2) 以及 ![](ATT-a1)";
        assert_eq!(
            rewrite_refs(t, &map),
            "![x](/tmp/a.png) 和 [y](ATT-b2) 以及 ![](/tmp/a.png)"
        );
    }

    #[test]
    fn civil_dates() {
        assert_eq!(civil_from_days(0), "1970-01-01");
        assert_eq!(civil_from_days(19_723), "2024-01-01");
        assert_eq!(civil_from_days(19_782), "2024-02-29");
    }

    #[test]
    fn priority_aliases() {
        assert_eq!(validate_priority("P0", true), "urgent");
        assert_eq!(validate_priority("高", true), "high");
        assert_eq!(validate_priority("none", true), "none");
    }

    #[test]
    fn date_parsing() {
        assert_eq!(
            parse_date("2026-05-01", true).as_deref(),
            Some("2026-05-01")
        );
        assert_eq!(parse_date("none", true), None);
        assert_eq!(parse_date("+0", true), parse_date("today", true));
    }

    #[test]
    fn exit_codes() {
        assert_eq!(exit_code_for_status(401), code::AUTH);
        assert_eq!(exit_code_for_status(404), code::NOT_FOUND);
        assert_eq!(exit_code_for_status(500), code::NETWORK);
    }

    #[test]
    fn chinese_padding() {
        assert_eq!(pad("进行中", 8), "进行中  ");
        assert_eq!(pad("ab", 4), "ab  ");
    }
}
