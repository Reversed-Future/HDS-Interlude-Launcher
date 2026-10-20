function registerManagementIPC(handle, service) {
  const operations = {
    "koishi-status": () => service.koishiStatus(),
    "koishi-login": (input) => service.mutate(() => service.koishiLogin(input)),
    "koishi-logout": () => service.mutate(() => service.koishiLogout()),
    "plugin-toggle": (input) => service.toggle(input),
    "plugin-editor": (input) => service.editor(input.id),
    "plugin-save": (input) => service.saveEditor(input),
    "snow-status": () => service.snowStatus(),
    "snow-login": (input) => service.mutate(() => service.snowLogin(input)),
    "snow-logout": () => service.mutate(() => service.snowLogout()),
    "snow-load": (input) => service.loadProcess(input),
    "snow-editor": (input) => service.snowEditor(input.uin),
    "snow-save": (input) => service.saveSnow(input),
    "sync-connection": (input) => service.syncConnection(input),
  };
  for (const [name, action] of Object.entries(operations))
    handle("management:" + name, action);
}
module.exports = { registerManagementIPC };
