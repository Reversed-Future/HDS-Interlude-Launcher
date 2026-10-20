import { $, $$, api, store, notice } from "./shared.js";
import { initDashboard, updateDashboard, refreshLogs } from "./dashboard.js";
import { initSettings, fillSettings } from "./settings.js";
import { initBrowser, openWebUI, hideWebUI } from "./browser.js";
import { initReader, openReader, invalidateReader } from "./reader.js";
import { initSetup, inspectEnvironment } from "./setup.js";
import { initGuide } from "./configuration.js";
import { initUpdates } from "./updates.js";
import { initManagement, openManagement } from "./management.js";
const routes = {
  dashboard: "启动台",
  webui: "高级管理",
  reader: "剧本书架",
  settings: "设置",
  setup: "安装与更新",
  guide: "配置向导",
  management: "常用管理",
};
let navigation = 0;
async function navigate(route, webService) {
  if (!Object.hasOwn(routes, route)) return;
  const current = ++navigation;
  if (route === "guide") {
    const env = await inspectEnvironment();
    const setup = await api.setupState();
    if (current !== navigation) return;
    if (!env.readiness.ready || setup.busy) {
      route = "setup";
      notice(
        setup.busy
          ? "请等待当前安装操作完成后再配置。"
          : "全部组件安装并通过检测后，才能进入配置向导。请查看下方缺少的项目。",
        true,
      );
    }
  }
  store.route = route;
  await hideWebUI();
  if (current !== navigation) return;
  $$(".page").forEach((page) => {
    page.hidden = page.id !== `page-${route}`;
  });
  $$("[data-route]").forEach((button) => {
    const active = button.dataset.route === route;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  $("#breadcrumb").textContent = routes[route];
  window.scrollTo(0, 0);
  if (route === "webui") await openWebUI(webService);
  if (route === "reader") await openReader();
  if (route === "dashboard") refreshLogs();
  if (route === "setup") await inspectEnvironment();
  if (route === "management") await openManagement();
}
async function init() {
  if (!api) {
    notice("请使用桌面启动器打开此界面。", true);
    return;
  }
  const data = await api.load();
  $("#app-version").textContent = `v${data.version}`;
  Object.assign(store, data);
  $("#today").textContent = new Date().toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
  });
  fillSettings();
  initDashboard((id) => navigate("webui", id));
  updateDashboard();
  initSettings(() => {
    updateDashboard();
    invalidateReader();
  });
  initBrowser();
  initManagement();
  initReader();
  await initSetup(() => {
    fillSettings();
    updateDashboard();
    invalidateReader();
  });
  initGuide();
  await initUpdates();
  document.addEventListener("launcher:navigate", (event) =>
    navigate(event.detail.route, event.detail.service).catch((error) =>
      notice(error.message, true),
    ),
  );
  $$("[data-route], [data-go]").forEach((button) =>
    button.addEventListener("click", () =>
      navigate(button.dataset.route || button.dataset.go).catch((error) =>
        notice(error.message, true),
      ),
    ),
  );
  $("#dismiss-notice").addEventListener("click", () => {
    $("#notice").hidden = true;
  });
  document.addEventListener("keydown", (event) => {
    document.body.classList.add("keyboard");
    if (event.key === "Escape") $("#notice").hidden = true;
    if (event.ctrlKey && event.key === "Enter") {
      event.preventDefault();
      $("#start-all").click();
    }
    if (event.altKey && ["1", "2", "3", "4"].includes(event.key)) {
      event.preventDefault();
      navigate(Object.keys(routes)[Number(event.key) - 1]);
    }
  });
  document.addEventListener("pointerdown", () =>
    document.body.classList.remove("keyboard"),
  );
  if (data.initialError) notice(data.initialError, true);
  if (
    ![
      store.config.koishiDir,
      store.config.snowlumaDir,
      store.config.qqExe,
    ].some(Boolean)
  )
    await navigate("setup");
  refreshLogs();
}
init().catch((error) => notice(error.message, true));
