import { $, $$, api, store, notice, selectButtons } from "./shared.js";
let selected = "koishi";
let request = 0;
function rect() {
  const bounds = $("#web-surface").getBoundingClientRect();
  return {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
  };
}
function showStatus(state) {
  $("#web-state-title").textContent = state.error
    ? "暂时无法连接"
    : state.loading
      ? "正在连接服务"
      : "网页已连接";
  $("#web-state-detail").textContent =
    state.error || "请确保对应程序已启动，再重新连接。";
}
export async function openWebUI(id) {
  if (id) selected = id;
  if (store.route !== "webui") return;
  const current = ++request;
  selectButtons("[data-web-tab]", "data-web-tab", selected);
  $("#web-address").textContent =
    (selected === "koishi"
      ? store.config.koishiUrl
      : store.config.snowlumaUrl) || "尚未配置地址";
  showStatus({ loading: true });
  try {
    const state = await api.showWebUI({ id: selected, rect: rect() });
    if (current === request) showStatus(state);
  } catch (error) {
    if (current === request) showStatus({ error: error.message });
  }
}
export async function hideWebUI() {
  request++;
  await api.hideWebUI();
}
export function initBrowser() {
  $$("[data-web-tab]").forEach((button) =>
    button.addEventListener("click", () => openWebUI(button.dataset.webTab)),
  );
  const reload = async () => {
    try {
      await openWebUI();
      await api.reloadWebUI();
    } catch (error) {
      notice(error.message, true);
    }
  };
  $("#web-reload").addEventListener("click", reload);
  $("#web-retry").addEventListener("click", reload);
  new ResizeObserver(() => {
    if (store.route === "webui")
      api.resizeWebUI(rect()).catch((error) => notice(error.message, true));
  }).observe($("#web-surface"));
  api.onWebUI((state) => {
    if (state.id === selected && store.route === "webui") showStatus(state);
  });
}
