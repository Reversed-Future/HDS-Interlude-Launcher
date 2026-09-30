import { $, $$, api, store, action, element, selectButtons } from "./shared.js";
let logService = "koishi";
let logFrame = null;
const phases = {
  stopped: "未运行",
  starting: "启动中",
  running: "运行中",
  stopping: "停止中",
  error: "需处理",
  opened: "已打开",
};

export function updateDashboard() {
  for (const [id, state] of Object.entries(store.states)) {
    const badge = $(`[data-status="${id}"]`);
    badge.dataset.phase = state.phase;
    badge.replaceChildren(
      element("i"),
      document.createTextNode(
        id === "qq" && state.phase === "stopped"
          ? "未检查"
          : phases[state.phase],
      ),
    );
    badge.title = state.message || "";
    const button = $(`[data-start="${id}"]`);
    const running =
      state.phase === "running" || (state.phase === "error" && state.pid);
    button.disabled = ["starting", "stopping"].includes(state.phase);
    button.replaceChildren(
      document.createTextNode(
        id === "qq"
          ? state.phase === "opened"
            ? "再次检查"
            : "打开"
          : running
            ? "停止"
            : state.phase === "starting"
              ? "启动中…"
              : "启动",
      ),
    );
    button.dataset.operation = running ? "stop" : "start";
    button.title = state.pid
      ? `PID ${state.pid} · ${state.message}`
      : state.message || "";
  }
  const running = ["koishi", "snowluma"].filter(
    (id) => store.states[id]?.phase === "running",
  ).length;
  $("#service-summary").textContent = `${running} / 2 后台服务运行中`;
  $("#stop-all").disabled =
    !Object.values(store.states).some((state) => state.pid) ||
    Object.values(store.states).some((state) =>
      ["starting", "stopping"].includes(state.phase),
    );
  const config = store.config;
  if (!config) return;
  for (const [id, value] of [
    ["koishi", config.koishiDir],
    ["snowluma", config.snowlumaDir],
    ["qq", config.qqExe],
  ]) {
    $(`#path-${id}`).textContent = value || "尚未配置路径";
    $(`#path-${id}`).title = value || "";
  }
  $("#config-summary").textContent = [
    config.koishiDir,
    config.snowlumaDir,
    config.qqExe,
  ].every(Boolean)
    ? "启动路径已配置 · 设置保存在本机"
    : "首次使用，请先在设置中配置程序路径";
}

function renderLogs() {
  logFrame = null;
  if (store.route !== "dashboard") return;
  const query = $("#log-search").value;
  const source = store.logs[logService];
  const filtered = query
    ? source.filter((row) => row.text.includes(query))
    : source;
  const visible = filtered.slice(-600);
  const body = $("#log-body");
  const scrollTop = body.scrollTop;
  const fragment = document.createDocumentFragment();
  for (const row of visible) {
    const node = element("div", `log-row ${row.stream}`);
    node.append(
      element(
        "span",
        "log-time",
        new Date(row.time).toLocaleTimeString("zh-CN", { hour12: false }),
      ),
      element(
        "span",
        "log-stream",
        { stdout: "OUT", stderr: "ERR", system: "SYS" }[row.stream],
      ),
      element("span", "log-content", row.text),
    );
    fragment.append(node);
  }
  $("#log-lines").replaceChildren(fragment);
  $("#log-lines").hidden = !visible.length;
  $("#log-empty").hidden = visible.length > 0;
  $("#log-empty strong").textContent = query
    ? "没有匹配的日志"
    : "等待第一条日志";
  $("#log-count").textContent = query
    ? `${filtered.length} 条匹配 · 共 ${source.length} 条`
    : `${source.length} 条日志`;
  $(".console-hint").textContent =
    filtered.length > 600
      ? "显示最新 600 条 · 复制可获取保留的全部日志"
      : "仅保留最近 3,000 条";
  body.scrollTop = $("#auto-scroll").checked ? body.scrollHeight : scrollTop;
}
export function refreshLogs() {
  if (!logFrame) logFrame = setTimeout(renderLogs, 100);
}
export function initDashboard(openWeb) {
  $("#start-all").addEventListener("click", (event) =>
    action(
      event.currentTarget,
      async () => {
        await api.startAll();
        updateDashboard();
      },
      "启动请求已完成，服务就绪情况请查看日志。",
    ),
  );
  $("#stop-all").addEventListener("click", async (event) => {
    await action(
      event.currentTarget,
      () => api.stopAll(),
      "后台服务已停止，QQ 保持打开。",
    );
    updateDashboard();
  });
  $$("[data-start]").forEach((button) =>
    button.addEventListener("click", async () => {
      await action(button, () =>
        button.dataset.operation === "stop"
          ? api.stop(button.dataset.start)
          : api.start(button.dataset.start),
      );
      updateDashboard();
    }),
  );
  $$("[data-open-web]").forEach((button) =>
    button.addEventListener("click", () => openWeb(button.dataset.openWeb)),
  );
  $$("[data-log-tab]").forEach((button) =>
    button.addEventListener("click", () => {
      logService = button.dataset.logTab;
      selectButtons("[data-log-tab]", "data-log-tab", logService);
      renderLogs();
    }),
  );
  $("#log-search").addEventListener("input", refreshLogs);
  $("#auto-scroll").addEventListener("change", refreshLogs);
  $("#log-body").addEventListener(
    "wheel",
    (event) => {
      if (event.deltaY < 0) $("#auto-scroll").checked = false;
    },
    { passive: true },
  );
  $("#copy-logs").addEventListener("click", (event) =>
    action(
      event.currentTarget,
      () => api.copyLogs(logService),
      "当前程序保留的日志已复制。",
    ),
  );
  $("#clear-logs").addEventListener("click", (event) =>
    action(event.currentTarget, async () => {
      const selected = logService;
      await api.clearLogs(selected);
      store.logs[selected] = [];
      renderLogs();
    }),
  );
  api.onState((states) => {
    store.states = states;
    updateDashboard();
  });
  api.onLog(({ service, entry }) => {
    const rows = store.logs[service];
    rows.push(entry);
    if (rows.length > 3000) rows.splice(0, rows.length - 3000);
    refreshLogs();
  });
}
