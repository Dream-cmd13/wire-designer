# 公开线束询价：上线与运维

- 客户入口 `/request-quote`：免登录提交，手机号或邮箱二选一，需求说明和图纸至少一项。收件编号不是查询凭证，访客不能查询或下载。每条询价最多附 5 份图纸，每份最多 20 MiB。
- 内部入口 `/quote-requests`：启用 `public.user_roles` 中明确登记为 `sales` 或 `admin` 的接单账号；未配置角色、工程师及强制改密账号不能读取。销售可查看队列，认领后仅负责人和管理员可改该单。正式报价通过现有电话或邮件渠道发出，内部记录金额、数量、交期及发送方式后标记已报价。值班人员应主动查看待处理列表。
- 可选群提醒：在 Edge Function secrets 设置 `QUOTE_REQUEST_WECOM_WEBHOOK`（已有企业微信群机器人时）和 `QUOTE_REQUEST_STAFF_URL`（内部入口 URL）。通知只带编号和入口；通知失败不撤销已收到的询价，后台队列是处理依据。不配置也能接单。

## 发布顺序

1. 使用测试库先验证，确认账号改密迁移已执行。备份现有数据库数据及 Storage（数据库备份不包含对象原件），并记录现有业务行数/桶清单。通过项目迁移工具预览 `npm run supabase:migrate -- 20261126_quote_requests.sql`，确认目标、计划、备份及恢复方案后，由有授权的维护人员加 `--apply <确认码>` 执行。已安装询价功能的环境通过 `npm run supabase:migrate -- 20261126_quote_requests_file_limit_20_mib.sql` 预览 20 MiB 限额迁移，确认后再执行。新环境先创建询价表与存储桶，再执行该限额迁移。限额迁移仅更新私有桶配置，保留现有资料。
2. 部署 `supabase functions deploy quote-request --project-ref <目标项目>`。公开 `prepare`、`upload`、`finalize` 由站点同源 `/api/quote-request/` 转发，接入层按客户端 IP 和全站请求速率限流。Nginx 覆盖 `x-quote-forward-secret`，其值与 Edge Secret `QUOTE_REQUEST_FORWARD_SECRET` 一致。函数校验失败返回 403。数据库另有每小时同联系方式和全站收件占位上限。棕地环境先确认已有 Storage 策略不会宽泛授权新桶。附件先检查大小、文件头和摘要，以附件方式下载，不在线渲染；处理外部附件时仍需按公司要求做安全检查。
3. 为 `quote-request/cleanup` 配置每 15 分钟的私有定时 POST：用计划器或 Supabase Cron/Vault 以 `x-quote-cleanup-secret` 请求头提供与 Edge Secret `QUOTE_REQUEST_CLEANUP_SECRET` 一致的高强度随机值。清理只处理超过 3 小时、从未提交成功的记录和对应对象，每批最多 100 条。用 Storage API 删除对象；不要直接删除 `storage.objects` 元数据。检查最近执行结果和积压。上线前明确已提交图纸的访问责任和留存期限；清理不会触及已提交的询价。
4. 最后发布前端。测试库用无痕窗口测试纯文字提交、真实 PDF/DWG 附件、20 MiB 附件可提交并下载、20 MiB + 1 字节被拒绝、失败重试与重复提交，然后由真实接单账号认领、下载并记录报价。验证未登记账号及访客无法读取，内部自动报价和原资料访问边界不变。检查通知或人工值班流程。

## 运维检查

- Nginx 仅转发三个公开动作，并校验到 Supabase 的 TLS 证书。接口按 IP 每分钟 30 个请求、全站每分钟 120 个请求限流，允许短时突发。询价代理的 `client_max_body_size` 为 `20m`，其他代理层和 Storage 全局限制也需要允许 20 MiB。直接向 Supabase 三个动作发 POST 应返回 403；通过站点代理发送空 JSON 应返回 400。
- 生产清理由 `designer-quote-request.timer` 每 15 分钟执行。使用 `systemctl status designer-quote-request.timer` 和 `journalctl -u designer-quote-request.service` 查看清理结果及错误告警。告警统计最近 15 分钟的 HTTP 429 和 5xx，访问统计只含时间和状态码。生产的转发及清理凭据分别由 Edge Secrets 和服务器受限配置保护。
- 本地连接测试项目时，在 `.env.local` 配置该测试项目的 `VITE_SUPABASE_URL` 和 `QUOTE_REQUEST_FORWARD_SECRET`。Vite 只在服务端向函数添加转发密钥。

## 回退

出现问题时先撤回前端入口并停用独立 `quote-request` 函数的公开入口，保留询价表、私有桶和已提交资料。恢复时复用原数据，核对后台队列与附件对应关系；不删表、不清库。尚未上线时不需要向生产发送测试询价。
