#!/usr/bin/env bash
set -Eeuo pipefail

base=${1:?Missing site directory}
id=${2:?Missing release ID}
hash=${3:?Missing archive hash}
[[ "$base" = /* && "$base" != / && "$id" =~ ^[0-9]{17}$ && "$hash" =~ ^[a-f0-9]{64}$ ]] || exit 2
cd "$base"
exec 9> .deploy.lock
flock -n 9 || { echo 'Another deployment is running'; exit 1; }
archive="$base/.deploy-$id.tar.gz"
stage="$base/.deploy-stage-$id"
backup="$base/.deploy-backup-$id"
failed="$base/.deploy-failed-$id"
[[ -d dist && ! -L dist && -f dist/index.html && ! -e "$stage" && ! -e "$backup" ]]
printf '%s  %s\n' "$hash" "$archive" | sha256sum -c -

# 拒绝绝对路径、父目录穿越及链接。打包内容只能是静态文件和目录。
tar -tzf "$archive" | awk '/^\// || /(^|\/)\.\.(\/|$)/ {exit 1}'
tar -tvzf "$archive" | awk 'substr($0,1,1) != "-" && substr($0,1,1) != "d" {exit 1}'
# 验证目录只由服务器管理，不接受本地覆盖。
listing=$(tar -tzf "$archive")
if grep -E '^(\./)?\.well-known(/|$)' <<< "$listing" >/dev/null; then
  echo 'Archive must not contain .well-known'; exit 1
fi
mkdir "$stage"
cp -a dist/. "$stage/"
tar -xzf "$archive" -C "$stage" --no-same-owner
test -s "$stage/index.html"
chown -R www:www "$stage"
chmod -R u+rwX,go+rX "$stage"

moved=0
rollback() {
  status=$?
  trap - EXIT
  if [[ "$moved" = 1 ]]; then
    if [[ -e "$base/dist" ]]; then mv "$base/dist" "$failed"; fi
    mv "$backup" "$base/dist"
    echo "Deployment failed; previous site restored. Failed files: $failed" >&2
  fi
  exit "$status"
}
trap rollback EXIT
mv dist "$backup"
moved=1
mv "$stage" dist
# 检查 Nginx 实际返回新首页，而不只是 HTTP 状态成功。
curl --fail --silent --show-error --max-time 30 --retry 2 \
  --resolve designer.wltlink.com:443:127.0.0.1 \
  "https://designer.wltlink.com/?deploy=$id" -o "$base/.deploy-response-$id"
cmp dist/index.html "$base/.deploy-response-$id"
moved=0
trap - EXIT
echo "Deployment verified. Backup: $backup"
