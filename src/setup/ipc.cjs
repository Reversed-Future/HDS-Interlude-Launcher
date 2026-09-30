const path = require("node:path");
const fs = require("node:fs");
const { app, dialog, shell, clipboard, net } = require("electron");
const { OfficialInstaller } = require("./official-installer.cjs");
const { fetchOfficial } = require("./electron-fetch.cjs");
const { installNode, refreshPath } = require("./node-installer.cjs");
const { LINKS, releases } = require("./releases.cjs");
const { validateYaml } = require("./configuration.cjs");
const { stickerDirectory, createStickerDirectory } = require("./stickers.cjs");

function registerSetupIPC(handle, { window, setup }) {
  handle("setup:install-node", () => installNode(setup));
  handle("setup:refresh-environment", () =>
    setup.job("刷新环境变量", async () => {
      await refreshPath();
      return setup.inspectEnvironment();
    }),
  );
  const official = new OfficialInstaller(setup, {
    fetcher: fetchOfficial,
    directory: path.join(app.getPath("userData"), "downloads"),
    open: (file) => shell.openPath(file),
  });
  handle("setup:official-snow", (input) => official.snow(input));
  handle("setup:official-qq", () => official.qq());
  handle("setup:cancel-download", () => official.cancel());
  handle("setup:stickers-status", () =>
    stickerDirectory(setup.configStore.load().koishiDir),
  );
  handle("setup:stickers-create", () =>
    setup.job("创建表情包目录", () => {
      const status = createStickerDirectory(setup.configStore.load().koishiDir);
      setup.log("表情包目录：" + status.directory);
      return status;
    }),
  );
  handle("setup:stickers-open", async () => {
    const status = stickerDirectory(setup.configStore.load().koishiDir);
    if (!status.exists) throw new Error("请先创建表情包目录。");
    const error = await shell.openPath(status.directory);
    if (error) throw new Error(error);
    return status;
  });
  handle("setup:state", () => setup.snapshot());
  handle("setup:environment", () => setup.inspectEnvironment());
  handle("setup:inspect", (file) => setup.inspect(file));
  handle("setup:beta", () => setup.checkBeta());
  handle("setup:install", async (id) => {
    const plan = setup.plans.get(id);
    if (!plan) throw new Error("请重新检查安装包。");
    if (plan.comparison === "所选版本较旧") {
      const { response } = await dialog.showMessageBox(window, {
        type: "warning",
        message: `从 ${plan.installed} 降级到 ${plan.version}？`,
        detail:
          "旧版插件可能不兼容当前配置或数据。安装前会备份配置与依赖清单。",
        buttons: ["取消", "确认降级"],
        defaultId: 0,
        cancelId: 0,
      });
      if (response !== 1) return null;
    }
    return setup.install(id);
  });
  handle("setup:dependencies", () => setup.installDependencies());
  handle("setup:create-koishi", (input) => setup.createKoishi(input));
  handle("setup:install-snow", (input) => setup.installSnow(input));
  handle("setup:releases", () => releases(net.fetch));
  handle("setup:open-link", (id) => {
    if (!Object.hasOwn(LINKS, id)) throw new Error("未知下载页面。");
    return shell.openExternal(LINKS[id]);
  });
  handle("setup:pick", async (kind) => {
    const extensions = {
      tgz: ["tgz"],
      zip: ["zip"],
      node: ["msi"],
      qq: ["exe"],
    };
    if (!Object.hasOwn(extensions, kind)) throw new Error("未知安装文件类型。");
    const result = await dialog.showOpenDialog(window, {
      properties: ["openFile"],
      filters: [{ name: "安装文件", extensions: extensions[kind] }],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  handle("setup:open-installer", async ({ kind, file }) => {
    if (setup.busy) throw new Error("请等待当前安装操作完成。");
    const extension = { node: ".msi", qq: ".exe" }[kind];
    if (
      !extension ||
      typeof file !== "string" ||
      !path.isAbsolute(file) ||
      path.extname(file) !== extension ||
      !fs.statSync(file).isFile()
    )
      throw new Error("安装文件不正确。");
    const error = await shell.openPath(file);
    if (error) throw new Error(error);
    setup.log("已打开安装器：" + file + "。请在安装窗口完成操作。");
    return true;
  });
  handle("setup:copy-logs", () => {
    clipboard.writeText(setup.lines.map((line) => line.text).join("\n"));
    return true;
  });
  handle("setup:export-yaml", (text) =>
    setup.job("导出 Koishi 配置", async () => {
      await setup.assertReady();
      validateYaml(text);
      const result = await dialog.showSaveDialog(window, {
        defaultPath: "koishi.generated.yml",
        filters: [{ name: "YAML 配置", extensions: ["yml"] }],
      });
      if (result.canceled) return null;
      fs.writeFileSync(result.filePath, text, "utf8");
      return result.filePath;
    }),
  );
  handle("setup:write-yaml", async (text) => {
    if (setup.busy) throw new Error("请等待当前安装操作完成。");
    await setup.assertReady();
    validateYaml(text);
    const { response } = await dialog.showMessageBox(window, {
      type: "question",
      message: "备份并写入完整 Koishi 配置？",
      detail: `目标：${path.join(setup.configStore.load().koishiDir, "koishi.yml")}\n自动将原文件备份为根目录下的 koishi.yml.bak，再写入生成的完整配置。已有 .bak 会保留到 .hds-launcher-backups 历史目录。不会合并已有插件设置；首次创建配置时无需备份。`,
      buttons: ["取消", "备份并写入"],
      defaultId: 0,
      cancelId: 0,
    });
    return response === 1 ? setup.writeConfig(text) : null;
  });
}
module.exports = { registerSetupIPC };
