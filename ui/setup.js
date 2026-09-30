import { $, $$, api, store, action, notice, element } from "./shared.js";
let selectedPlan = null;
let snowFile = "";
let busy = false;
let ready = false;
let logLines = [];
let renderTimer;
function renderLogs() {
  clearTimeout(renderTimer);
  renderTimer = null;
  const box = $("#setup-log");
  const bottom = box.scrollHeight - box.clientHeight - box.scrollTop < 40;
  box.textContent =
    logLines
      .map(
        (line) => `${new Date(line.time).toLocaleTimeString()}  ${line.text}`,
      )
      .join("\n") || "安装进度、npm 输出与错误会显示在这里。";
  if (bottom) box.scrollTop = box.scrollHeight;
}
function stateChanged(state) {
  busy = state.busy;
  $("#setup-status").textContent = state.label;
  $("#setup-status").dataset.phase = state.phase;
  $("#download-panel").hidden = !state.download;
  if (state.download) {
    const { label, received, total, cancelable } = state.download;
    $("#download-label").textContent = label;
    const progress = $("#download-progress");
    if (total) {
      progress.max = total;
      progress.value = received;
    } else progress.removeAttribute("value");
    const mb = (value) => (value / 1024 / 1024).toFixed(1) + " MB";
    $("#download-size").textContent = total
      ? `${mb(received)} / ${mb(total)}`
      : mb(received);
    $("#cancel-download").disabled = !cancelable;
  }
  $$("[data-setup-mutation]").forEach((button) => {
    button.disabled = busy;
  });
  $$("[data-requires-ready]").forEach((button) => {
    button.disabled = busy || !ready;
  });
  if (state.lines) {
    logLines = state.lines;
    renderLogs();
  }
}
export async function inspectEnvironment() {
  const env = await api.environment();
  ready = env.readiness.ready;
  $("#installation-readiness").dataset.ready = String(ready);
  $("#readiness-title").textContent = ready
    ? "安装已完成，可以开始配置"
    : "请先完成全部安装";
  $("#readiness-list").replaceChildren(
    ...env.readiness.checks.map((item) => {
      const row = element("li", item.ready ? "ready" : "missing");
      row.append(
        element("strong", "", `${item.ready ? "✓" : "○"} ${item.label}`),
      );
      if (!item.ready) row.append(element("span", "", item.detail));
      return row;
    }),
  );
  $$("[data-requires-ready]").forEach((button) => {
    button.disabled = busy || !ready;
  });
  $("#installed-version").textContent =
    `已安装版本：${env.installed || "未检测到 HDSI"}`;
  for (const id of ["node", "qq", "snowluma", "koishi"]) {
    const card = $(`[data-env="${id}"]`);
    const ready = id === "node" ? !env.node.error : env[id];
    card.dataset.ready = String(ready);
    card.querySelector("span").textContent =
      id === "node"
        ? env.node.version || "请安装并重启"
        : ready
          ? id === "koishi"
            ? env.installed || "项目已配置"
            : "路径已配置"
          : "请安装或设置路径";
    card.title = id === "node" ? env.node.error || env.node.node : "";
  }
  return env;
}
function showPlan(plan) {
  selectedPlan = plan;
  $("#package-plan").hidden = false;
  $("#plan-version").textContent =
    `${plan.installed || "未安装"} → ${plan.version}`;
  $("#plan-detail").textContent =
    `${plan.comparison} · ${plan.source === "npm" ? "npm beta · " + new Date(plan.checkedAt).toLocaleString() : "本地 .tgz · " + (plan.size / 1024 / 1024).toFixed(2) + " MB"}`;
  $("#plan-command").textContent =
    `自动补齐 Console → OneBot → SQLite，然后执行：\nnpm install --save-exact ${plan.source === "tgz" ? JSON.stringify(plan.file) : `${plan.name}@${plan.version}`}`;
  $("#plan-target").textContent =
    `目标目录：${plan.dir || "请先在设置中选择 Koishi 目录"}${plan.sha256 ? "\nSHA-256：" + plan.sha256 : ""}`;
  $("#install-package").textContent =
    plan.comparison === "版本一致"
      ? "重新安装此版本"
      : plan.comparison === "所选版本较旧"
        ? "安装旧版本…"
        : "安装所选版本";
}
async function inspectFile(file) {
  if (busy) throw new Error("请等待当前操作完成。");
  selectedPlan = null;
  $("#package-plan").hidden = true;
  showPlan(await api.inspectPackage(file));
}
export async function initSetup(onConfig) {
  api.onSetupState(stateChanged);
  api.onSetupLog((line) => {
    logLines.push(line);
    if (logLines.length > 2500) logLines.shift();
    if (!renderTimer)
      renderTimer = setTimeout(() => {
        renderTimer = null;
        renderLogs();
      }, 100);
  });
  stateChanged(await api.setupState());
  const parent = await api.installRoot();
  $("#snow-parent").value = parent;
  $("#koishi-parent").value = parent;
  $("#install-node").onclick = (event) =>
    action(event.currentTarget, async () => {
      const result = await api.installNode();
      await inspectEnvironment();
      notice(
        result.ready
          ? "Node.js 与 npm 已就绪，可以继续安装 Koishi。"
          : "安装命令已完成，请关闭并重新打开启动器后检测。",
        !result.ready,
      );
    });
  $("#refresh-environment").onclick = (event) =>
    action(event.currentTarget, async () => {
      const env = await api.refreshEnvironment();
      await inspectEnvironment();
      if (env.node.error) throw new Error(env.node.error);
      notice("环境已刷新，Node.js 与 npm 可用。");
    });
  $("#inspect-environment").onclick = (event) =>
    action(event.currentTarget, inspectEnvironment);
  $("#check-beta").onclick = (event) =>
    action(event.currentTarget, async () => {
      selectedPlan = null;
      $("#package-plan").hidden = true;
      showPlan(await api.checkBeta());
    });
  $("#pick-tgz").onclick = (event) =>
    action(event.currentTarget, async () => {
      const file = await api.pickInstaller("tgz");
      if (file) await inspectFile(file);
    });
  $("#tgz-file").onchange = (event) =>
    action(null, () => inspectFile(api.filePath(event.target.files[0])));
  const drop = $("#tgz-drop");
  drop.ondragover = (event) => {
    event.preventDefault();
    drop.dataset.over = "true";
  };
  drop.ondragleave = () => {
    drop.dataset.over = "false";
  };
  drop.ondrop = (event) => {
    event.preventDefault();
    drop.dataset.over = "false";
    if (event.dataTransfer.files.length !== 1)
      return notice("请一次拖入一个 .tgz 安装包。", true);
    action(null, () => inspectFile(api.filePath(event.dataTransfer.files[0])));
  };
  document.addEventListener("dragover", (event) => event.preventDefault());
  document.addEventListener("drop", (event) => event.preventDefault());
  $("#install-package").onclick = (event) =>
    action(event.currentTarget, async () => {
      if (!selectedPlan) throw new Error("请先检查更新或导入安装包。");
      const result = await api.installPackage(selectedPlan.id);
      if (result) {
        selectedPlan = null;
        $("#package-plan").hidden = true;
        await inspectEnvironment();
        notice("HDSI 已安装。可回到启动台启动 Koishi。");
      }
    });
  $$("[data-download]").forEach((button) => {
    button.onclick = () =>
      action(button, () => api.openDownload(button.dataset.download));
  });
  $$("[data-installer]").forEach((button) => {
    button.onclick = () =>
      action(button, async () => {
        const kind = button.dataset.installer;
        const file = await api.pickInstaller(kind);
        if (file) {
          await api.openInstaller({ kind, file });
          notice("安装器已打开，请在安装窗口完成操作。");
        }
      });
  });
  $$("[data-parent]").forEach((button) => {
    button.onclick = () =>
      action(button, async () => {
        const file = await api.choosePath("directory");
        if (file) document.getElementById(button.dataset.parent).value = file;
      });
  });
  const applyConfig = async (config) => {
    store.config = config;
    onConfig();
    await inspectEnvironment();
  };
  $("#cancel-download").onclick = (event) =>
    action(event.currentTarget, () => api.cancelDownload());
  $("#install-official-qq").onclick = (event) =>
    action(
      event.currentTarget,
      () => api.installOfficialQQ(),
      "QQ 安装器已打开，请在安装窗口完成安装，再设置 QQ.exe 路径。",
    );
  $("#install-official-snow").onclick = (event) =>
    action(
      event.currentTarget,
      async () => {
        await applyConfig(
          await api.installOfficialSnow({
            parent: $("#snow-parent").value,
            name: $("#snow-name").value,
          }),
        );
      },
      "SnowLuma 已安装，目录已保存。",
    );
  $("#create-koishi").onclick = (event) =>
    action(
      event.currentTarget,
      async () => {
        await applyConfig(
          await api.createKoishi({
            parent: $("#koishi-parent").value,
            name: $("#koishi-name").value,
          }),
        );
      },
      "Koishi 项目已创建，目录已保存。",
    );
  $("#pick-snow").onclick = (event) =>
    action(event.currentTarget, async () => {
      const file = await api.pickInstaller("zip");
      if (file) {
        snowFile = file;
        $("#snow-file").textContent = file;
      }
    });
  $("#install-snow").onclick = (event) =>
    action(
      event.currentTarget,
      async () => {
        if (!snowFile) throw new Error("请先选择 SnowLuma ZIP。");
        await applyConfig(
          await api.installSnow({
            file: snowFile,
            parent: $("#snow-parent").value,
            name: $("#snow-name").value,
          }),
        );
      },
      "SnowLuma 已解压，目录已保存。",
    );
  $("#install-dependencies").onclick = (event) =>
    action(
      event.currentTarget,
      async () => {
        await api.installDependencies();
        await inspectEnvironment();
      },
      "基础插件安装完成。",
    );
  $("#copy-setup-logs").onclick = (event) =>
    action(event.currentTarget, () => api.copySetupLogs(), "操作日志已复制。");
  $("#check-gitee").onclick = (event) =>
    action(event.currentTarget, async () => {
      const list = $("#release-list");
      list.hidden = false;
      list.textContent = "正在读取发布页…";
      try {
        const rows = await api.releases();
        list.replaceChildren(
          ...rows.map((row) => element("div", "", `${row.tag} · ${row.name}`)),
        );
        list.append(
          element(
            "p",
            "setup-hint",
            "请在 Gitee 发布页下载所需附件，再拖入上方区域。实际版本以安装包内容为准。",
          ),
        );
      } catch (error) {
        list.textContent = error.message;
        throw error;
      }
    });
}
