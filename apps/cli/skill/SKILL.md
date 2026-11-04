---

name: zhizhi
description: 读写知之（Zhizhi）项目与任务管理系统。当用户要在知之里查看、创建、修改或推进任务，
或者要把讨论结论落成任务、按任务清单开工、汇报进度时使用。
---

## 前置检查

1. 运行 `zhizhi whoami --json`。退出码 2 表示未登录：请用户到知之「设置 → 访问令牌」
   创建一个令牌（`zhz_` 开头），再执行
   `zhizhi login --url <地址> --token <令牌> --workspace <工作区标识>`，不要猜测地址。
2. 后续所有命令一律追加 `--json`，输出是单行 JSON；错误写 stderr，形状为
   `{"error":{"code","message"}}`。

## 怎么用

- 先 `zhizhi project list --json` 看清有哪些项目、标识是什么（如 `CORE`）。
- 任务编号形如 `CORE-12`。**除了刚创建时返回的 id，一律用编号**，不要自己拼 UUID。
- 看任务：`zhizhi issue get CORE-12 --download --json`。
- 建任务：`zhizhi issue create --title ... --desc ... [--attach 截图.png] --json`。
- 推进：`zhizhi issue move CORE-12 started --json`、`zhizhi issue comment CORE-12 "..." --json`。
- 完整命令、退出码与字段说明见 `references/cli.md`；
  常见场景的完整流程见 `references/workflows.md`。

## 红线

- 开工前必须 `issue get --download` 读完任务：`description_local` 里的图片已换成本地路径，
  用 Read 工具逐张看，不要凭标题猜需求。
- 不要修改别人负责的任务状态或负责人，除非用户明确要求。
- 删除任务必须有用户在場确认，并且带 `--yes`；不要自作主张删除。
- 修改前先 `issue get`，`updated_at` 变了就重新读一遍，避免覆盖别人的修改。
- 退出码 4（冲突）或 5（网络）可以重试一次；退出码 6（参数）要按 message 修正参数，
  不要原样重试。
