# 宝塔一键部署

## 日常使用

在 Windows PowerShell 中进入项目目录：

```powershell
cd D:\wire-harness-designer
# 仅本地检查、测试、构建和打包，不连接服务器
npm run deploy:check
# 正式发布当前工作区（包含未提交代码）
npm run deploy
```

`npm run dev` 仅启动开发服务，不生成最新发布包。部署脚本会调用 `npm run build`（包含 `tsc -b` 和 Vite 构建），不会复用旧的 dist。PowerShell 中请优先使用独立的 `deploy:check`，避免 npm 参数透传差异。

## 已确认的连接配置

| 配置 | 值 |
| --- | --- |
| SSH | `root@8.135.107.54:22` |
| Nginx 站点根目录 | `/www/wwwroot/designer.wltlink.com/dist` |
| 网站 | `https://designer.wltlink.com` |
| 默认私钥 | `%USERPROFILE%\.ssh\designer_deploy` |
| ED25519 主机指纹 | `SHA256:06BI4UJaX4VD2exZ+ebvSyJR00iw1OOeke+eOSHmQMU` |

宝塔面板端口 9527 不参与部署。脚本要求本机具有 Node/npm、OpenSSH（ssh/scp）、tar；部署回归测试在 Windows 使用 `C:/Program Files/Git/bin/bash.exe`，需安装 Git for Windows。服务器使用 Bash、tar、sha256sum、flock、curl、cmp 及现有 www 用户。

部署使用密钥认证、严格主机身份检查，不自动接受新主机、不回退到密码。换电脑后先核对服务器指纹并手动连接一次。私钥和密码不可写入仓库；自定义密钥路径：

```powershell
$env:DEPLOY_SSH_KEY = "$env:USERPROFILE\.ssh\designer_deploy"
ssh -i $env:DEPLOY_SSH_KEY -o IdentitiesOnly=yes -p 22 root@8.135.107.54 "echo SSH_OK"
```

加密私钥需先载入本机 ssh-agent，否则自动部署会因 BatchMode 拒绝交互而停止。

## 发布流程与保留策略

1. 对 src、server、tests、部署入口及 Vite 配置执行 ESLint（0 告警），执行 npm test（排除临时目录和 worktree），再执行类型检查和生产构建。
2. 将 dist 内容打包到 `.tmp/deploy/<版本号>/dist.tar.gz` 并计算 SHA256。`deploy:check` 到此结束，不连接服务器。
3. SSH 检查目标目录后上传压缩包；服务器持有 flock 锁，避免两个发布同时切换文件。
4. 校验压缩包 SHA256 和路径，拒绝链接及 `.well-known` 内容。复制现有 dist 到临时目录后覆盖新产物，因此原 `.well-known`、其他站点文件及旧哈希静态资源继续保留。
5. 将旧 dist 移到 `.deploy-backup-<版本号>`，新目录改名为 dist。两次改名之间存在极短访问空窗；此方案不是零停机原子切换。
6. 通过本机 Nginx HTTPS 请求首页，核对响应内容与新 index.html 完全一致。失败时自动恢复旧目录，失败版本保存在 `.deploy-failed-<版本号>`。

检查失败立即终止，不跳过门禁。脚本不修改 Nginx、不删除现有压缩包、dist-1 或数据库。前端首页检查不能替代登录、报价等业务验收。SSH 断线、服务器断电或进程被强制终止时，不保证自动回滚，需检查 dist 和备份目录后恢复。

备份、上传包、响应文件和失败临时目录暂不自动清理。每次发布需要容纳旧站点副本和新压缩包；旧静态资源也会累计。空间不足时停止发布，确认备份已不再需要后由维护者精准清理，不使用通配符删除整个站点。

## 手动回滚

先确认没有部署正在运行，并选定确实存在的 `.deploy-backup-<版本号>`。在服务器执行下列脚本，将版本号替换为实际值；当前版本会保留，不删除文件：

```bash
(
  set -eu
  cd /www/wwwroot/designer.wltlink.com
  exec 9> .deploy.lock
  flock -n 9
  backup='.deploy-backup-替换为实际版本号'
  saved=".deploy-manual-$(date +%Y%m%d%H%M%S)"
  test -f "$backup/index.html"
  test -d dist
  test ! -e "$saved"
  mv dist "$saved"
  if ! mv "$backup" dist; then
    mv "$saved" dist
    exit 1
  fi
  curl --fail --silent --show-error --max-time 30 \
    --resolve designer.wltlink.com:443:127.0.0.1 https://designer.wltlink.com/ >/dev/null
)
```

如 dist 因异常中断而不存在，不执行上述两目录交换；由维护者核实版本后将备份目录恢复为 dist。回滚后再次检查登录和相关业务。

## Supabase 发布边界

本命令只发布前端，不执行 SQL、数据迁移或 Supabase Edge Function 发布。涉及报价协议或数据结构变化时，先阅读 [SQL 执行说明](../supabase/sql/README.md) 和 [报价业务规则](报价业务规则.md)，安排数据库、报价函数和前端同批发布。发布前备份相关数据并确认恢复方案，不可只更新前端而遗漏配套变更。

## 验证记录

2026-10-12：SSH 密钥连接及服务器工具、Nginx 根目录已核实。部署回归测试使用本地临时站点，覆盖发布成功、保留 `.well-known` 和旧资源、SHA256 错误、拒绝覆盖验证目录、健康检查失败恢复旧版本。测试模拟 curl、chown、flock，真实执行文件复制、解压和目录切换；锁竞争及线上故障回滚尚未实测。

本地 `npm run deploy:check` 已通过：ESLint 0 错误、0 告警，106 个测试文件 / 895 项测试通过，TypeScript 和 Vite 生产构建通过，压缩包与 SHA256 已生成。Vite 提示部分分包超过 500 kB，属于构建体积提示，本次未调整业务分包。

随后执行 `npm run deploy` 完成首次线上发布，重复通过上述门禁，上传、SHA256 校验、备份和站点切换成功。公网首页返回 HTTP 200，内容与本地构建一致；`.well-known` 与旧版本逐文件比对一致。备份目录为 `/www/wwwroot/designer.wltlink.com/.deploy-backup-20261012062756016`（版本号使用 UTC 时间）。本次未更新数据库或 Supabase 函数，也未执行线上登录、报价等业务验收。
