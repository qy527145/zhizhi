# 常见流程

## 1. 读完一个任务再开工

```
zhizhi issue get CORE-12 --download --json
```

- 以 `description_local` 为准：里面的 `![说明](路径)` 已经是本地文件。
- `attachments[]` 每项带 `local_path`；`mime` 为 `image/*` 的用 Read 工具逐张看，
  `text/plain`、`application/json` 直接读，zip 按需解压。
- 看 `comments` 了解进展，`body_local` 是评论里图片的本地路径。
- 需求不清楚时看 `labels`、`state_group`，仍然不清楚就问用户，不要猜。

## 2. 把讨论结论落成任务

```
zhizhi issue create --title "登录页在 Safari 下按钮错位" \
  --desc - --priority high --label 缺陷 --due +7 --attach ./safari.png --json <<'MD'
复现步骤：
1. 打开登录页
2. 观察主按钮

截图如下：
![Safari 截图](./safari.png)
MD
```

- 先 `zhizhi project show --json` 确认标签名存在；标签不会自动创建。
- 一次建多条时，先建好再逐条 `issue get` 回读编号，把编号汇报给用户。

## 3. 按清单推进并汇报

```
zhizhi issue list --mine --json          # 我负责的
zhizhi issue move CORE-12 started --json
zhizhi issue comment CORE-12 "已定位：按钮容器用了 fixed 高度" --json
zhizhi issue move CORE-12 completed --json
```

- 只动自己负责的任务；发现需要改别人的任务，先说明原因并征得用户同意。
- 完成前把关键结论写进评论，方便之后回看；不要在没做完时把任务移进已完成。

## 4. 批量统计

```
zhizhi issue list --all --json | jq -r '.[] | "\(.key)\t\(.state)\t\(.title)"'
```
