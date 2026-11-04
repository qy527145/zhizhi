#!/usr/bin/env bash
# 后端冒烟测试：启动一个使用临时数据库的服务并走通核心 API 流程。
set -euo pipefail
cd "$(dirname "$0")/../apps/server"
cargo build -q
DB=$(mktemp -d)/smoke.db
PORT=${PORT:-8099}
DATABASE_URL="sqlite://$DB" HOST=127.0.0.1 PORT="$PORT" JWT_SECRET=smoke ../../target/debug/zhizhi-server >/tmp/zhizhi-smoke.log 2>&1 &
PID=$!
trap 'kill $PID 2>/dev/null' EXIT
for _ in $(seq 100); do curl -sf "http://127.0.0.1:$PORT/api/health" >/dev/null && break; sleep 0.1; done

B="http://127.0.0.1:$PORT/api"
TOKEN=""
req() { # method path [body] -> 打印响应体，状态码写入 $CODE_FILE
  local out; out=$(curl -s -w '\n%{http_code}' -X "$1" -H 'Content-Type: application/json' \
    ${TOKEN:+-H "Authorization: Bearer $TOKEN"} ${3:+-d "$3"} "$B$2")
  echo "${out##*$'\n'}" >/tmp/zhizhi-smoke.code
  echo "${out%$'\n'*}"
}
field() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }
expect() { local c; c=$(cat /tmp/zhizhi-smoke.code); [[ "$c" == "$1" ]] || { echo "FAIL: $2 期望 $1 实际 $c"; exit 1; }; echo "ok  $2"; }

TOKEN=$(req POST /auth/register '{"email":"a@x.com","name":"小明","password":"12345678"}' | field '["token"]'); expect 200 注册
req POST /auth/register '{"email":"A@x.com","name":"x","password":"12345678"}' >/dev/null; expect 409 重复注册
req GET /auth/me >/dev/null; expect 200 当前用户
req POST /workspaces '{"name":"知之团队","slug":"zz"}' >/dev/null; expect 200 创建工作区
P=$(req POST /workspaces/zz/projects '{"name":"核心","identifier":"core"}' | field '["id"]'); expect 200 创建项目
N=$(req GET /projects/$P/states | field '.__len__()'); expect 200 状态列表; [[ $N == 5 ]]
L=$(req POST /projects/$P/labels '{"name":"缺陷","color":"#ef4444"}' | field '["id"]'); expect 200 创建标签
I=$(req POST /projects/$P/issues "{\"title\":\"第一个任务\",\"priority\":\"high\",\"label_ids\":[\"$L\"]}" | field '["id"]'); expect 200 创建任务
S=$(req POST /projects/$P/issues '{"title":"第二个任务"}' | field '["seq"]'); expect 200 序号递增; [[ $S == 2 ]]
req PATCH /issues/$I '{"due_date":"2026-12-01","priority":"urgent","assignee_id":null}' >/dev/null; expect 200 更新任务
req PATCH /issues/$I '{"priority":"bogus"}' >/dev/null; expect 400 非法优先级
A=$(req GET /issues/$I/activities | field '.__len__()'); expect 200 活动记录; [[ $A == 3 ]]
req POST /issues/$I/comments '{"body":"收到"}' >/dev/null; expect 200 发表评论

# 另一个用户不能访问他人工作区
OWNER=$TOKEN
TOKEN=$(req POST /auth/register '{"email":"b@x.com","name":"小红","password":"12345678"}' | field '["token"]')
req GET /issues/$I >/dev/null; expect 403 越权访问
TOKEN=$OWNER
req POST /workspaces/zz/members '{"email":"b@x.com"}' >/dev/null; expect 200 邀请成员
req DELETE /issues/$I >/dev/null; expect 204 删除任务
TOKEN=""; req GET /auth/me >/dev/null; expect 401 未登录
echo "全部通过"
