# 账号密码管理

## 使用方式

- 新建账号：`npm run user:create -- username "显示名"`，也支持完整邮箱。默认密码 `888888`；不再接收命令行密码参数。
- 用户点击右上角账户 → 修改密码按钮，输入原密码、新密码和确认密码。成功后关闭账户弹窗并显示 toast。新密码 8–128 位，不能与原密码或初始密码相同。
- 管理员在账户弹窗加载账号列表，选择其他账号并确认重置为 `888888`。不允许用重置入口重置自己。
- 新建或重置的账号必须修改密码才能进入业务页面。退出、刷新或直接访问业务 API 不能取消此限制。
- 已有账号密码不变。管理员重置不会改账号角色、项目或业务数据。

## 部署顺序与数据保护

本功能需要前端、SQL、`account-password` 与 `quote` 云函数共同部署。仅发布前端不会完成启用。

1. 确认目标 Supabase 项目，备份数据库（包括 `auth.users` 和现有函数、策略定义），记录恢复点，并验证备份可恢复到隔离实例。禁止重置数据库。
2. 在该项目执行 `supabase/updates/20261013_password_change_required.sql`。脚本在事务中执行，可重复运行，不修改已有账号记录，不删除业务数据。新建库也在原有 schema、安全策略创建后执行此文件。
   随后执行 `supabase/updates/20261013_initial_password_accounts.sql`，为当前 bcrypt 密码为 `888888` 的历史账号补齐强制改密标记，并阻止后续初始密码账号清除标记。只更新账号标记，保留密码哈希、其他 metadata 与业务数据；执行前备份 `auth.users`。此项目使用 Supabase bcrypt 密码；若改用加密哈希或其他算法，必须先调整识别方案。
3. 部署两个函数（`PROJECT_REF` 替换为准确项目 ID）：

   ```powershell
   npx supabase functions deploy account-password --project-ref PROJECT_REF
   npx supabase functions deploy quote --project-ref PROJECT_REF
   ```

4. 发布前端，并用专用测试账号完成以下验收。Supabase Auth 密码策略必须允许创建六位初始密码；用户修改密码时由应用服务强制至少八位。邮箱确认、禁止公开注册等现有项目配置保持不变。

迁移失败会整体回滚。若上线后异常，先停止新账号创建/密码操作并回退前端和函数，保留限制性策略防止初始密码账号继续访问。根据备份中的原始函数、策略和触发器定义进行定向恢复；不要恢复整库覆盖上线后的业务数据，也不要清空账号。保留已成功更改的密码与服务器标记，复核受影响账号后再开放访问。

## 权限与会话边界

`must_change_password`、`password_version` 位于服务端拥有的 `app_metadata`，不能由用户 `user_metadata` 修改。新账号触发器确保所有新增 Auth 账号都必须改密；默认密码只由受信任创建脚本设定。

两个云函数均在 handler 内用 `auth.getUser(token)` 校验真实登录身份，`supabase/config.toml` 关闭旧网关 JWT 校验以适配项目签名密钥。未携带或无效 token 仍返回 401，重置还会查询实时管理员角色。

应用改密入口在隔离的 Supabase 客户端验证原密码，再调用 Auth Admin API。账号密码与强制改密标记由 Auth 同一事务提交；数据库触发器核对验证时的密码版本，阻止在途旧请求覆盖并发重置。触发器同时支持单次写入和 GoTrue 先更新密码、后更新 metadata 的事务顺序。

数据库实时检查 Auth 标记，为现有启用 RLS 的业务表与存储对象增加限制性策略；管理员 RPC 与成品视图也受限。以后新增业务表、绕过 RLS 的视图或函数时必须继续应用该检查。已签发的存储 URL 在原有效期内仍可能有效；已经下载的文件无法收回。管理员重置后页面在角色轮询或恢复焦点时切换到改密界面，数据库权限立即收紧。

Supabase 原生 Auth 密码更新 API 遵循平台会话策略，不由本应用替换；它不能清除服务端强制改密标记或取得管理员权限。

## 验收

用新建的专用测试账号验证 `888888` 登录只显示改密页面；原密码错误、确认密码不一致和原密码复用失败；正确改密后可以进入业务页面，旧密码不能登录。管理员重置后重复此流程，确认业务数据不变。普通用户调用重置 API 应返回 403。验证断网、刷新、直接业务 API 请求和并发重置不会放开强制改密。

执行 `npm test`、`npx tsc -b`、修改文件 ESLint，以及 `npx deno check supabase/functions/account-password/index.ts supabase/functions/quote/index.ts`。本地模拟验证不替代部署后的真实 Auth 联调。
