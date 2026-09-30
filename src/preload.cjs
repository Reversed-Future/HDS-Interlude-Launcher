const { contextBridge, ipcRenderer, webUtils } = require("electron");
const invoke = async (channel, input) => {
  const result = await ipcRenderer.invoke(channel, input);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
const subscribe = (channel, callback) => {
  const listener = (_event, value) => callback(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};
contextBridge.exposeInMainWorld("launcher", {
  detectPaths: (root) => invoke("paths:discover", root),
  projects: () => invoke("about:projects"),
  projectStars: () => invoke("about:stars"),
  openProject: (id) => invoke("about:open", id),
  installRoot: () => invoke("setup:install-root"),
  updateState: () => invoke("updater:state"),
  checkLauncherUpdate: () => invoke("updater:check"),
  installLauncherUpdate: () => invoke("updater:install"),
  cancelLauncherUpdate: () => invoke("updater:cancel"),
  restartUpdatedLauncher: () => invoke("updater:restart"),
  openRepository: () => invoke("updater:repository"),
  onLauncherUpdate: (callback) => subscribe("updater:state", callback),
  filePath: (file) => webUtils.getPathForFile(file),
  setupState: () => invoke("setup:state"),
  environment: () => invoke("setup:environment"),
  inspectPackage: (file) => invoke("setup:inspect", file),
  checkBeta: () => invoke("setup:beta"),
  installPackage: (id) => invoke("setup:install", id),
  installDependencies: () => invoke("setup:dependencies"),
  createKoishi: (input) => invoke("setup:create-koishi", input),
  installSnow: (input) => invoke("setup:install-snow", input),
  installOfficialSnow: (input) => invoke("setup:official-snow", input),
  installOfficialQQ: () => invoke("setup:official-qq"),
  installNode: () => invoke("setup:install-node"),
  refreshEnvironment: () => invoke("setup:refresh-environment"),
  cancelDownload: () => invoke("setup:cancel-download"),
  releases: () => invoke("setup:releases"),
  openDownload: (id) => invoke("setup:open-link", id),
  pickInstaller: (kind) => invoke("setup:pick", kind),
  openInstaller: (input) => invoke("setup:open-installer", input),
  copySetupLogs: () => invoke("setup:copy-logs"),
  exportYaml: (text) => invoke("setup:export-yaml", text),
  writeYaml: (text) => invoke("setup:write-yaml", text),
  stickerDirectory: () => invoke("setup:stickers-status"),
  createStickerDirectory: () => invoke("setup:stickers-create"),
  openStickerDirectory: () => invoke("setup:stickers-open"),
  onSetupLog: (callback) => subscribe("setup:log", callback),
  onSetupState: (callback) => subscribe("setup:state", callback),
  load: () => invoke("app:load"),
  saveConfig: (value) => invoke("config:save", value),
  choosePath: (kind) => invoke("path:choose", kind),
  start: (id) => invoke("process:start", id),
  startAll: () => invoke("process:all"),
  stop: (id) => invoke("process:stop", id),
  stopAll: () => invoke("process:stop-all"),
  clearLogs: (id) => invoke("logs:clear", id),
  copyLogs: (id) => invoke("logs:copy", id),
  stories: () => invoke("database:stories"),
  entries: (options) => invoke("database:entries", options),
  showWebUI: (input) => invoke("webui:show", input),
  hideWebUI: () => invoke("webui:hide"),
  resizeWebUI: (rect) => invoke("webui:resize", rect),
  reloadWebUI: () => invoke("webui:reload"),
  onState: (callback) => subscribe("app:state", callback),
  onLog: (callback) => subscribe("app:log", callback),
  onWebUI: (callback) => subscribe("app:webui", callback),
});
