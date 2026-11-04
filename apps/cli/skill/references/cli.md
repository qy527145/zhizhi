# zhizhi 命令

```
zhizhi login --url <地址> --token <令牌> --workspace <工作区> [--project <标识>] [--profile <名>]
zhizhi whoami
zhizhi profile list | use <名>
zhizhi skill install [--scope user|project] [--dir <skills 目录>]

zhizhi project list
zhizhi project show [<标识>]
zhizhi member list

zhizhi issue list [--state S]... [--priority P]... [--assignee A]... [--label L]...
                  [-q 关键字] [--due-before D] [--due-after D] [--mine] [--all]
zhizhi issue get <编号> [--download [目录]]
zhizhi issue create --title T [--desc D|--desc -] [--state S] [--priority P]
                    [--assignee A] [--label L]... [--start D] [--due D] [--attach 文件]...
zhizhi issue edit <编号> [--title T] [--desc D|--desc -] [--state S] [--priority P]
                    [--assignee A] [--label L]... [--start D] [--due D] [--attach 文件]...
zhizhi issue move <编号> <状态>
zhizhi issue assign <编号> [<成员>]          # 不给成员表示指派给自己
zhizhi issue comment <编号> <内容|-> [--attach 文件]...
zhizhi issue delete <编号> --yes

zhizhi file get <ATT-id> [-o 路径]
```

## 参数约定

- **状态**：状态名（如「进行中」）或分组 `backlog` / `unstarted` / `started` /
  `completed` / `cancelled`。分组名在项目里可能有多个状态，取位置最靠前的那个。
- **优先级**：`urgent` / `high` / `medium` / `low` / `none`，也接受 `P0`–`P3` 和「紧急/高/中/低」。
- **成员**：邮箱、名字，或 `me`、`none`（取消指派）。名字重名时请改用邮箱。
- **日期**：`YYYY-MM-DD`、`today`、`tomorrow`、`+N`（N 天后）；`none` 表示清除。
- **--desc -** / 评论文本写 `-`：从标准输入读取，多行 Markdown 用 heredoc 传入。
- **附件**：正文里写 `![说明](./shot.png)` 并同时 `--attach ./shot.png`，上传后自动换成
  `](ATT-xxx)`；没有在正文引用的图片会追加到描述末尾。
- 全局参数：`--json`、`--url`、`--token`、`--workspace`、`--project`。也可以用环境变量
  `ZHIZHI_URL` / `ZHIZHI_TOKEN` / `ZHIZHI_WORKSPACE` / `ZHIZHI_PROJECT`，或仓库根的
  `.zhizhi.toml`（只放地址、工作区和默认项目，不放令牌）。
  优先级：参数 > 环境变量 > `.zhizhi.toml` > 当前 profile。

## JSON 输出

- 任务对象在服务端字段之外补充了 `key`（`CORE-12`）、`state`（状态名）、`state_group`、
  `assignee`（名字）、`labels`（名字数组）。
- `issue get --download` 额外给每个附件补 `local_path`，并输出 `description_local`
  （正文中的 ATT 引用已换成本地路径）和评论的 `body_local`。
- `issue list` 默认隐藏已完成和已取消；按 `--state` 筛选时以筛选条件为准，`--all` 全部显示。

## 退出码

| 码  | 含义                             |
| --- | -------------------------------- |
| 0   | 成功                             |
| 1   | 通用错误（配置、文件读写）       |
| 2   | 未认证：没配置或令牌失效         |
| 3   | 不存在：任务、项目、配置名找不到 |
| 4   | 冲突：唯一约束等                 |
| 5   | 网络或服务端错误                 |
| 6   | 参数错误                         |
| 7   | 无权限：不是工作区成员           |

错误以 JSON 写到 stderr：`{"error":{"code","message"}}`。
