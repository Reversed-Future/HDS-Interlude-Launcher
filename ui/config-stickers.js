import { api, action, notice, element } from "./shared.js";
import { card } from "./config-fields.js";

export function stickerPanel(enabled) {
  const panel = card(
    "表情包文件夹",
    "创建目录后，在文件管理器中将表情包放进去。保存启用表情包库的配置时，也会自动创建此目录。",
  );
  panel.id = "sticker-directory-panel";
  panel.hidden = !enabled;
  const directory = element("code", "sticker-directory-path");
  directory.id = "sticker-directory-path";
  const status = element("p", "wizard-field-hint", "正在检查目录…");
  status.id = "sticker-directory-status";
  status.setAttribute("role", "status");
  const actions = element("div", "wizard-actions");
  const create = element("button", "button primary", "创建表情包目录");
  create.id = "create-sticker-directory";
  const open = element("button", "button", "打开文件夹");
  open.id = "open-sticker-directory";
  create.disabled = true;
  open.disabled = true;
  function display(result) {
    directory.textContent = result.directory;
    status.textContent = result.exists
      ? "目录已准备好，可打开文件夹放入表情包。"
      : "目录尚未创建。可以现在创建，或在保存配置时自动创建。";
    create.textContent = result.exists ? "检查目录" : "创建表情包目录";
    create.disabled = false;
    open.disabled = !result.exists;
  }
  async function refresh() {
    create.disabled = true;
    open.disabled = true;
    try {
      display(await api.stickerDirectory());
    } catch (error) {
      status.textContent = error.message;
      create.textContent = "重新检查";
      create.disabled = false;
    }
  }
  create.onclick = () =>
    action(create, async () => {
      display(await api.createStickerDirectory());
      notice("表情包目录已准备好。");
    });
  open.onclick = () => action(open, () => api.openStickerDirectory());
  actions.append(create, open);
  panel.append(
    directory,
    status,
    actions,
    element(
      "p",
      "wizard-field-hint",
      "还需在“模型连接”中为一条支持识图的模型勾选“表情包描述”。",
    ),
  );
  return {
    element: panel,
    refresh,
    setEnabled(value) {
      panel.hidden = !value;
      if (value) refresh();
    },
  };
}
