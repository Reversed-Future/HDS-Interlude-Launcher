# 第三方项目与来源

HDS-Interlude Launcher 由 Reversed-Future 维护，采用 AGPL-3.0-only，完整文本见 LICENSE。

- 配置默认值和 YAML 生成逻辑（`ui/config-model.js`）源于 MomoiCore / HDS-Interlude 的 `新人上手一条龙配置服务v1.0.1-rc28.html`，经拆分与界面适配。来源：https://github.com/ISEKAI-MomoiCore/HDS-Interlude （备用：https://gitee.com/MomoiCore/HDS-Interlude） 。上游 package.json 声明 AGPL-3.0；保留上游许可要求。其余向导、桌面管理、安装与更新功能在本项目中实现。
- Koishi：https://github.com/koishijs/koishi 。通过官方脚手架与 npm 安装，不随本发行包附带。
- OneBot Adapter：https://github.com/koishijs/koishi-plugin-adapter-onebot 。MIT，通过 npm 安装。
- SnowLuma：https://github.com/SnowLuma/SnowLuma 。源码可见非商业许可，非 OSI 开源许可；下载官方未修改的发行包，不随本项目再分发。请阅读上游 LICENSE、EULA.md 与 PRIVACY.md。
- QQ：https://im.qq.com/pc/ 。腾讯专有软件，不是开源项目。启动器只获取官方安装器，不重新打包 QQ。
- Electron：https://github.com/electron/electron 。MIT；其 Chromium、Node.js 及其他组件的许可随发行版的 LICENSE、LICENSES.chromium.html 和组件文件提供。

运行依赖包括 cheerio、semver、tar、yaml、yauzl 及其传递依赖。发行包保留各依赖目录中的原许可文件；具体版本由 package-lock.json 固定。上述项目的名称及商标归其各自权利人所有，本项目独立维护。

欢迎访问并 Star 本项目以及上游仓库，向各自维护者反馈问题与贡献代码。
