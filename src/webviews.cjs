const { WebContentsView } = require("electron");
const { validateUrl } = require("./config.cjs");

class WebUIManager {
  constructor(window, notify) {
    this.window = window;
    this.notify = notify;
    this.views = new Map();
    this.active = null;
  }
  hide() {
    for (const item of this.views.values()) item.view.setVisible(false);
    this.active = null;
  }
  resize(rect) {
    if (!this.active) return;
    if (
      !rect ||
      !["x", "y", "width", "height"].every((key) => Number.isFinite(rect[key]))
    )
      throw new Error("浏览区域尺寸无效。");
    const [width, height] = this.window.getContentSize();
    const x = Math.max(0, Math.min(width, Math.round(rect.x)));
    const y = Math.max(0, Math.min(height, Math.round(rect.y)));
    this.views.get(this.active).view.setBounds({
      x,
      y,
      width: Math.max(0, Math.min(width - x, Math.round(rect.width))),
      height: Math.max(0, Math.min(height - y, Math.round(rect.height))),
    });
  }
  show(id, url, rect) {
    if (!["koishi", "snowluma"].includes(id)) throw new Error("未知 WebUI。");
    if (!url) throw new Error("请先在设置中填写 WebUI 地址。");
    validateUrl(url);
    this.hide();
    let item = this.views.get(id);
    if (item && item.url !== url) {
      this.window.contentView.removeChildView(item.view);
      item.view.webContents.close();
      this.views.delete(id);
      item = null;
    }
    if (!item) {
      const view = new WebContentsView({
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          partition: `persist:webui-${id}`,
          webSecurity: true,
        },
      });
      item = { view, url, error: "", loaded: false };
      this.views.set(id, item);
      this.window.contentView.addChildView(view);
      const wc = view.webContents;
      wc.session.setPermissionRequestHandler((_wc, _permission, callback) =>
        callback(false),
      );
      wc.session.setPermissionCheckHandler(() => false);
      wc.setWindowOpenHandler(() => ({ action: "deny" }));
      const guard = (event, address) => {
        try {
          validateUrl(address);
        } catch {
          event.preventDefault();
        }
      };
      wc.on("will-navigate", guard);
      wc.on("will-redirect", guard);
      wc.on("did-start-loading", () => {
        item.error = "";
        this.notify({ id, loading: true, error: "" });
      });
      wc.on("did-finish-load", () => {
        // Chromium also finishes loading its internal network-error document.
        // Preserve the connection error instead of announcing a successful page.
        if (item.error) return;
        item.loaded = true;
        item.error = "";
        this.notify({ id, loading: false, error: "" });
      });
      wc.on("did-fail-load", (_event, code, description, _url, mainFrame) => {
        if (!mainFrame || code === -3) return;
        item.error = `网页连接失败（${code}）：${description}`;
        view.setVisible(false);
        this.notify({ id, loading: false, error: item.error });
      });
      wc.loadURL(url).catch(() => {});
    }
    this.active = id;
    this.resize(rect);
    item.view.setVisible(!item.error);
    return { id, error: item.error, loading: !item.loaded && !item.error };
  }
  reload() {
    const item = this.views.get(this.active);
    if (item) {
      item.error = "";
      item.loaded = false;
      item.view.setVisible(true);
      item.view.webContents.loadURL(item.url).catch(() => {});
    }
  }
  destroy() {
    for (const item of this.views.values()) item.view.webContents.close();
    this.views.clear();
  }
}
module.exports = { WebUIManager };
