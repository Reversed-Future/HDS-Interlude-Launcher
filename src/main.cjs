const { app, BrowserWindow, Menu, dialog } = require("electron");
const path = require("node:path");
const { ConfigStore, defaults } = require("./config.cjs");
const { LogStore } = require("./logs.cjs");
const { ProcessManager } = require("./processes.cjs");
const { WebUIManager } = require("./webviews.cjs");
const { registerIPC } = require("./ipc.cjs");
const { readUpdateTarget } = require("./update/bootstrap.cjs");
const { UpdateService } = require("./update/service.cjs");
const { fetchOfficial } = require("./setup/electron-fetch.cjs");

app.setName("HDS-Interlude Launcher");
if (process.platform === "win32")
  app.setAppUserModelId("ReversedFuture.HDSInterludeLauncher");
// Preserve the existing profile after the visible product rename.
app.setPath("userData", path.join(app.getPath("appData"), "InterludeLauncher"));
// An explicit isolated profile is used by the desktop integration tests.
if (process.env.INTERLUDE_TEST_PROFILE)
  app.setPath("userData", process.env.INTERLUDE_TEST_PROFILE);
const updateTarget =
  app.isPackaged && readUpdateTarget(app.getPath("userData"), app.getVersion());
if (updateTarget) {
  app.relaunch({ execPath: updateTarget, args: [] });
  app.exit(0);
}
const ownsLock = !updateTarget && app.requestSingleInstanceLock();
let window;
if (!ownsLock) app.quit();
else {
  app.on("second-instance", () => {
    if (window) {
      if (window.isMinimized()) window.restore();
      window.show();
      window.focus();
    }
  });
  app
    .whenReady()
    .then(() => {
      Menu.setApplicationMenu(null);
      const htmlPath = path.join(__dirname, "../ui/index.html");
      const configStore = new ConfigStore(
        path.join(app.getPath("userData"), "settings.json"),
        path.join(__dirname, "../local-settings.json"),
      );
      let initialError = "";
      try {
        configStore.load();
      } catch (error) {
        initialError = "设置文件读取失败，请重新保存设置：" + error.message;
        // Keep the unreadable file untouched until the user explicitly saves a replacement.
        const originalLoad = configStore.load.bind(configStore);
        configStore.load = () => {
          try {
            return originalLoad();
          } catch {
            return { ...defaults };
          }
        };
      }
      const logs = new LogStore();
      const processes = new ProcessManager(logs);
      const setup = new (require("./setup/service.cjs").SetupService)(
        configStore,
        processes,
      );
      const updater = new UpdateService(setup, {
        profile: app.getPath("userData"),
        version: app.getVersion(),
        fetcher: fetchOfficial,
      });
      window = new BrowserWindow({
        width: 1260,
        height: 850,
        minWidth: 980,
        minHeight: 690,
        title: "HDS-Interlude Launcher",
        icon: path.join(__dirname, "../assets/icon.ico"),
        backgroundColor: "#f8f9fb",
        show: false,
        webPreferences: {
          preload: path.join(__dirname, "preload.cjs"),
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      const send = (channel, value) => {
        if (!window.isDestroyed()) window.webContents.send(channel, value);
      };
      const webui = new WebUIManager(window, (value) =>
        send("app:webui", value),
      );
      processes.on("state", (value) => send("app:state", value));
      processes.on("log", (value) => send("app:log", value));
      setup.on("log", (value) => send("setup:log", value));
      setup.on("state", (value) => send("setup:state", value));
      updater.on("state", (value) => send("updater:state", value));
      registerIPC({
        window,
        configStore,
        processes,
        logs,
        webui,
        htmlPath,
        initialError,
        setup,
        updater,
      });
      window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      window.webContents.on("will-navigate", (event) => event.preventDefault());
      window.once("ready-to-show", () => window.show());
      window.loadFile(htmlPath);
      if (!process.env.INTERLUDE_TEST_PROFILE)
        setTimeout(() => updater.check(), 3000);
      let exiting = false;
      let prompting = false;
      window.on("close", async (event) => {
        if (
          exiting ||
          (!processes.children.size &&
            !setup.busy &&
            !processes.busy.size &&
            !processes.batchStarting)
        )
          return;
        event.preventDefault();
        if (prompting) return;
        prompting = true;
        const activeWebUI = webui.active;
        const activeView = webui.views.get(activeWebUI);
        const restoreWebUI = () => {
          if (activeView && !window.isDestroyed())
            webui.show(
              activeWebUI,
              activeView.url,
              activeView.view.getBounds(),
            );
        };
        webui.hide();
        if (setup.busy || processes.busy.size || processes.batchStarting) {
          await dialog.showMessageBox(window, {
            type: "info",
            message: "请等待当前安装、配置或进程操作完成后再退出。",
          });
          prompting = false;
          restoreWebUI();
          return;
        }
        const { response } = await dialog.showMessageBox(window, {
          type: "question",
          title: "退出 HDS-Interlude Launcher",
          message: "停止后台服务并退出？",
          detail:
            "将结束由启动器启动的 Koishi 和 SnowLuma 进程树。QQ 保持打开。",
          buttons: ["返回软件", "停止服务并退出"],
          defaultId: 0,
          cancelId: 0,
        });
        if (response === 1) {
          try {
            await processes.stopAll();
            exiting = true;
            window.close();
          } catch (error) {
            await dialog.showMessageBox(window, {
              type: "error",
              message: "服务停止失败",
              detail: error.message,
            });
          }
        }
        prompting = false;
        if (!exiting) restoreWebUI();
      });
      window.on("closed", () => {
        webui.destroy();
      });
    })
    .catch((error) => {
      dialog.showErrorBox(
        "HDS-Interlude Launcher 启动失败",
        error.stack || error.message,
      );
      app.quit();
    });
}
app.on("window-all-closed", () => app.quit());
