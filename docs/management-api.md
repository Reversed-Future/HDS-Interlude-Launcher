# 常用管理接口与兼容范围

常用管理使用启动器自己的表单，调用上游管理接口。原管理网页保留在“高级管理”。不运行网页内的脚本，不导入网页缓存中的登录凭据。

实现依据为已安装软件的源码：SnowLuma `@snowluma/runtime 1.14.20`、Koishi `@koishijs/plugin-console 5.30.11`、`@koishijs/plugin-config 2.8.7`、`@koishijs/plugin-auth 4.1.7`，以及 HDSI `1.0.1-rc56` 的 Config schema 和配置说明。

## SnowLuma

- 使用 `/api/login` 的 `password`、可选 `totp` 登录。会话 Token 只保存在主进程内存。
- `/api/processes`、`/api/qq-list` 显示 QQ 进程、加载状态与在线账号。
- `/api/processes/:pid/load` 用于手动重试加载；日常一键启动仍由自动加载机制完成。
- `/api/config/:uin` 读取和保存 OneBot。表单只编辑 `networks.wsServers`，HTTP 服务、反向 WS、历史同步等其他字段保持原值。
- 保存前重新读取并校验配置摘要，发现外部修改则要求重新读取。原配置备份到 SnowLuma 目录下 `.hds-launcher-backups`。
- 首次密码修改、协议确认、两步验证设置等继续在高级管理中完成；接口要求这些步骤时会显示说明，不跳过验证。

## Koishi

- 从管理页 HTML 中读取序列化的 `KOISHI_CONFIG.endpoint`，以同源 WebSocket 连接 Console，不猜测端口或接口路径。
- 沿用 Console 的 `data` / `patch` / `response` 协议。账号密码通过 `login/password` 登录；权限不足时要求管理员登录。
- 通过 `manager/reload` / `manager/unload` 启停插件、保存配置，保持 Koishi 自己的校验与重载机制。
- 插件名称、实例键、分组和启用状态取自实际 `config.plugins`；处理 Loader 的 `group`、`~` 停用前缀和实例 ID。不会根据显示名称猜测配置路径。
- Console、Config、Server、Auth 的启停留在高级管理中，避免切断当前管理连接。
- 写入前验证当前实例配置摘要及本地 `koishi.yml` 一致性，备份到 `.hds-launcher-backups`，并更新 `koishi.yml.bak`。

## HDSI 表单

支持角色与世界、回复节奏、聊天功能、模型连接、机器人账号与私聊白名单。字段按已核对的 schema 建模。只提交用户修改的字段；列表行按原索引保留其未显示字段，新增和移除由表单明确操作。

Embedding 必须使用专用向量模型，并且只承担 Embedding 用途。前端选择 Embedding 时关闭该连接其他用途，后端再次校验，包括主叙事的默认开启行为。

这里只编辑插件配置。角色默认档案的变化不会自动改写已有故事；群聊规则、复杂调度、故事维护等使用高级管理。

## 验证与数据保护

原生接口仅允许回环地址，拒绝外部地址、URL 用户信息及 HTTP 重定向。只有启动器本地可信页面能够调用管理 IPC；远程 WebUI 没有原生 API 权限。密码和认证 Token 不写入设置或日志。API Key 与 OneBot 密钥在表单中作为密码显示。

测试使用隔离的 HTTP/WebSocket 服务验证认证、配置保留、冲突检测、备份、Embedding 限制和两端同步；桌面测试使用相同接口协议，不操作真实 QQ 账号发送消息。
