# 欢迎参与

感谢使用 HDS-Interlude Launcher。欢迎 Star 本项目及相关上游项目，也欢迎提交 Issue 和 Pull Request。

## 反馈问题

请在 https://github.com/Reversed-Future/HDS-Interlude-Launcher/issues 提供：启动器版本、Windows 版本、复现步骤、预期与实际结果，以及相关日志。截图与日志请移除 QQ 号、Token、API Key、个人路径和私人剧本内容。无需提交整个 koishi.db。

## 提交代码

1. Fork 仓库并从 main 创建自己的分支。
2. 安装 Node.js 22.13 或更高版本，在 Windows 上执行 `npm ci`。
3. `npm start` 运行；`npm test` 执行核心测试；`npm run test:desktop` 执行桌面测试。
4. 提交 PR，说明解决的问题、实现方式和验证结果。UI 改动请附演示数据截图。

桌面测试使用临时演示数据，不依赖维护者的本机配置；安装测试会访问 npm/GitHub，创建测试用 Koishi 项目。测试资料保留在 test-results 或临时目录，不自动删除。

保持模块职责清晰，读取实际配置和协议，不根据近似名称猜测。不要提交 local-settings.json、数据库、密钥、安装器或测试输出。提交贡献即表示同意按本仓库 AGPL-3.0-only 许可发布该贡献。

## 发布

更新 package.json、package-lock.json 与 CHANGELOG.md 的版本；完成验证后执行 `npm run package`、`npm run release:assets`、`npm run test:updater`。最后运行 `node scripts/privacy-check.cjs --package` 并逐张检查文档截图。发布 `v版本号` 标签，Release 标题使用 `HDS-Interlude-Launcher-版本号`，上传 ZIP、launcher-update.json、SHA256SUMS.txt 三个文件。附件齐全后再把草稿发布，应用内更新读取 latest Release。
