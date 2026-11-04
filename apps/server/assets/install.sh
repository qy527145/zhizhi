#!/bin/sh
# 知之 CLI 安装脚本，由服务端渲染。macOS 与 Linux 通用；Windows 用 install.ps1。
set -eu

SERVER_URL="__ZHIZHI_BASE_URL__"
BASE_URL="${ZHIZHI_BASE_URL:-$SERVER_URL}"
BIN_DIR="${ZHIZHI_BIN_DIR:-$HOME/.local/bin}"

die() { echo "zhizhi install: $*" >&2; exit 1; }

# 只有本机地址、服务端自己声明的地址，或显式 ZHIZHI_ALLOW_HTTP=1 时才允许明文 HTTP。
case "$BASE_URL" in
  https://*) CURL="curl -fsSL --proto =https --tlsv1.2" ;;
  http://127.0.0.1*|http://localhost*) CURL="curl -fsSL" ;;
  http://*)
    if [ "$BASE_URL" = "$SERVER_URL" ] || [ "${ZHIZHI_ALLOW_HTTP:-0}" = "1" ]; then
      CURL="curl -fsSL"
      echo "zhizhi install: warning: installing over plain HTTP — tokens will be transmitted unencrypted" >&2
    else
      die "base url must be https (set ZHIZHI_ALLOW_HTTP=1 to override for private networks): $BASE_URL"
    fi
    ;;
  *) die "unsupported base url scheme: $BASE_URL" ;;
esac

case "$(uname -s)" in
  Darwin) os=apple-darwin ;;
  Linux)  os=unknown-linux-musl ;;
  *)      die "unsupported OS: $(uname -s)" ;;
esac
case "$(uname -m)" in
  arm64|aarch64) arch=aarch64 ;;
  x86_64|amd64)  arch=x86_64 ;;
  *)             die "unsupported arch: $(uname -m)" ;;
esac
target="$arch-$os"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

$CURL "$BASE_URL/dl/latest.json" -o "$tmp/latest.json" || die "cannot fetch latest.json"

# latest.json 由 scripts/release.ts 生成。按对象解析而不是按行匹配，这样格式化过的
# 清单也能读，不必依赖 jq。
parsed=$(awk -v t="$target" '
  index($0, "\"target\"") && index($0, t) { f = 1 }
  f && /"url"/ {
    v = $0; sub(/.*"url"[[:space:]]*:[[:space:]]*"/, "", v); sub(/".*/, "", v); url = v
  }
  f && /"sha256"/ {
    v = $0; sub(/.*"sha256"[[:space:]]*:[[:space:]]*"/, "", v); sub(/".*/, "", v); sum = v
  }
  f && /}/ && url != "" && sum != "" { print url; print sum; exit }
' "$tmp/latest.json")
url=$(printf '%s\n' "$parsed" | sed -n 1p)
sum=$(printf '%s\n' "$parsed" | sed -n 2p)
[ -n "$url" ] && [ -n "$sum" ] || die "no build for $target in latest.json"
# 清单里的 url 是相对路径，跟着服务地址走，部署换域名不用重新发布。
case "$url" in
  http://*|https://*) ;;
  /*) url="$BASE_URL$url" ;;
  *) url="$BASE_URL/$url" ;;
esac

$CURL "$url" -o "$tmp/zhizhi.tar.gz" || die "download failed"
if command -v sha256sum >/dev/null 2>&1; then
  got=$(sha256sum "$tmp/zhizhi.tar.gz" | cut -d' ' -f1)
else
  got=$(shasum -a 256 "$tmp/zhizhi.tar.gz" | cut -d' ' -f1)
fi
[ "$got" = "$sum" ] || die "sha256 mismatch (got $got, expected $sum)"

tar -xzf "$tmp/zhizhi.tar.gz" -C "$tmp"
mkdir -p "$BIN_DIR"
install -m 0755 "$tmp/zhizhi" "$BIN_DIR/zhizhi"
echo "installed $BIN_DIR/zhizhi ($("$BIN_DIR/zhizhi" --version))"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *) echo "note: add $BIN_DIR to your PATH: export PATH=\"$BIN_DIR:\$PATH\"" ;;
esac
echo "next: zhizhi skill install"
