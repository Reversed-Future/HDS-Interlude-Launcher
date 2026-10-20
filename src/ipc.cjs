const { app, ipcMain, dialog, clipboard, shell } = require("electron");
const { discover } = require("./discovery.cjs");
const { activateVersion } = require("./update/bootstrap.cjs");
const path = require("node:path");
const fs = require("node:fs");
const { Worker } = require("node:worker_threads");
const { pathToFileURL } = require("node:url");

function readDatabase(operation, file, options) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, "database-worker.cjs"), {
      workerData: { operation, file, options },
    });
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("数据库读取超时，请稍后刷新。"));
    }, 15000);
    worker.once("message", (result) => {
      clearTimeout(timer);
      result.ok ? resolve(result.value) : reject(new Error(result.error));
    });
    worker.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    worker.once("exit", (code) => {
      clearTimeout(timer);
      if (code !== 0) reject(new Error(`数据库读取进程退出（${code}）。`));
    });
  });
}

function registerIPC({
  window,
  configStore,
  processes,
  logs,
  webui,
  htmlPath,
  initialError,
  setup,
  updater,
}) {
  const trustedURL = pathToFileURL(htmlPath).href;
  const handle = (channel, action) =>
    ipcMain.handle(channel, async (event, input) => {
      if (
        event.sender !== window.webContents ||
        event.senderFrame !== window.webContents.mainFrame ||
        event.senderFrame.url !== trustedURL
      )
        throw new Error("不允许的调用来源。");
      try {
        return { ok: true, value: await action(input) };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    });
  handle("app:load", () => ({
    version: require("../package.json").version,
    config: configStore.load(),
    states: processes.snapshot(),
    startup: processes.startup,
    logs: { koishi: logs.get("koishi"), snowluma: logs.get("snowluma") },
    initialError,
  }));
  handle("about:projects", () => require("./about.cjs"));
  const stars = new (require("./stars.cjs").StarCounts)(
    app.getPath("userData"),
    require("./update/network.cjs").fetchUpdate,
  );
  handle("about:stars", () => stars.load());
  handle("about:open", (id) => {
    const project = require("./about.cjs").find((item) => item.id === id);
    if (!project) throw new Error("未知项目。");
    return shell.openExternal(project.url);
  });
  const installRoot = path.join(app.getPath("documents"), "HDS-Interlude");
  handle("setup:install-root", () => {
    fs.mkdirSync(installRoot, { recursive: true });
    return installRoot;
  });
  handle("paths:discover", async (root) => {
    if (
      root &&
      (typeof root !== "string" ||
        !path.isAbsolute(root) ||
        !fs.statSync(root).isDirectory())
    )
      throw new Error("请选择实际存在的父目录。");
    const config = configStore.load();
    const roots = [
      ...new Set(
        [
          root,
          installRoot,
          path.dirname(process.execPath),
          config.koishiDir,
          config.snowlumaDir,
          config.koishiDir && path.dirname(config.koishiDir),
          config.snowlumaDir && path.dirname(config.snowlumaDir),
        ].filter(Boolean),
      ),
    ];
    return discover(config, roots);
  });
  handle("updater:state", () => updater.state);
  handle("updater:check", () => updater.check());
  handle("updater:install", () => updater.install());
  handle("updater:cancel", () => updater.cancel());
  handle("updater:repository", () =>
    shell.openExternal(require("./update/config.cjs").url),
  );
  handle("updater:restart", () => {
    if (!app.isPackaged)
      throw new Error("开发模式不切换版本，请使用发行包测试更新。");
    if (!updater.staged) throw new Error("请先下载更新。");
    if (
      setup.busy ||
      processes.children.size ||
      processes.busy.size ||
      processes.batchStarting
    )
      throw new Error("请先停止 Koishi 和 SnowLuma，并等待安装操作完成。");
    const executable = activateVersion(app.getPath("userData"), updater.staged);
    app.relaunch({ execPath: executable, args: [] });
    app.exit(0);
    return true;
  });
  handle("config:save", (config) => {
    if (setup.busy || processes.busy.size || processes.batchStarting)
      throw new Error("请等待启动或停止操作完成后再保存设置。");
    return configStore.save(config);
  });
  handle("path:choose", async (kind) => {
    const specs = {
      directory: { properties: ["openDirectory"] },
      "qq-directory": { properties: ["openDirectory"] },
      executable: {
        properties: ["openFile"],
        filters: [{ name: "Windows 程序", extensions: ["exe"] }],
      },
      database: {
        properties: ["openFile"],
        filters: [
          { name: "SQLite 数据库", extensions: ["db", "sqlite", "sqlite3"] },
        ],
      },
    };
    if (!Object.hasOwn(specs, kind)) throw new Error("未知路径类型。");
    const result = await dialog.showOpenDialog(window, specs[kind]);
    if (result.canceled) return null;
    if (kind === "qq-directory") {
      const exe = path.join(result.filePaths[0], "QQ.exe");
      if (!fs.existsSync(exe))
        throw new Error(
          "所选目录中不存在 QQ.exe，请使用“选择 EXE”指定实际文件。",
        );
      return exe;
    }
    return result.filePaths[0];
  });
  const canStart = () => {
    if (setup.busy) throw new Error("安装或配置操作尚未完成，请稍后启动。");
    if (processes.batchStarting)
      throw new Error("一键启动正在进行，请先取消等待。");
  };
  handle("process:start", (id) => {
    canStart();
    return processes.start(id, configStore.load());
  });
  handle("process:all", () => {
    canStart();
    return processes.startAll(configStore.load());
  });
  handle("process:cancel", () => {
    processes.cancelStartup();
    return true;
  });
  handle("process:stop", (id) => {
    if (processes.batchStarting)
      throw new Error("请先取消一键启动等待，再停止程序。");
    return processes.stop(id);
  });
  handle("process:stop-all", () => processes.stopAll());
  handle("logs:clear", (id) => {
    logs.clear(id);
    return true;
  });
  handle("logs:copy", (id) => {
    clipboard.writeText(
      logs
        .get(id)
        .map(
          (row) =>
            `${new Date(row.time).toLocaleTimeString()} [${row.stream}] ${row.text}`,
        )
        .join("\n"),
    );
    return true;
  });
  handle("database:stories", () =>
    readDatabase("stories", configStore.load().databasePath),
  );
  handle("database:entries", (options) =>
    readDatabase("entries", configStore.load().databasePath, options),
  );
  handle("webui:show", (input) => {
    if (!input || !["koishi", "snowluma"].includes(input.id))
      throw new Error("未知 WebUI。");
    const config = configStore.load();
    return webui.show(
      input.id,
      input.id === "koishi" ? config.koishiUrl : config.snowlumaUrl,
      input.rect,
    );
  });
  handle("webui:hide", () => webui.hide());
  handle("webui:resize", (rect) => webui.resize(rect));
  handle("webui:reload", () => webui.reload());
  require("./setup/ipc.cjs").registerSetupIPC(handle, { window, setup });
}
module.exports = { registerIPC };
