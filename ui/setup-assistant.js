import { $, api, store, action, notice } from "./shared.js";
const navigate = (route) =>
  document.dispatchEvent(
    new CustomEvent("launcher:navigate", { detail: { route } }),
  );
let environment, operation, refresh, changed;
let working = false;
let qqOpened = false;
function nextStep(env) {
  const missing = new Set(env.readiness.missing.map((item) => item.id));
  if (env.readiness.ready)
    return env.configured
      ? [
          "程序已准备好",
          "检测到已有 koishi.yml，可以直接回到启动台。需要重新填写时再打开配置向导。",
          "前往启动台",
          () => navigate("dashboard"),
        ]
      : [
          "安装完成，接下来填写配置",
          "填写机器人账号、模型连接和角色信息，完成后自动备份并保存配置。",
          "开始填写配置",
          () => navigate("guide"),
        ];
  if (missing.has("node"))
    return [
      "先安装运行环境",
      "点击安装 Node.js。出现系统安装窗口时按提示完成；安装后自动重新检测。",
      "安装 Node.js",
      async () => {
        const result = await api.installNode();
        if (!result.ready)
          throw new Error(
            "安装已结束，但运行环境尚未可用。请重新打开启动器再检查。",
          );
      },
    ];
  if (missing.has("qq"))
    return [
      qqOpened ? "完成 QQ 安装后，点击继续" : "接下来准备 QQ",
      qqOpened
        ? "在 QQ 安装窗口完成安装，再点击下方按钮识别 QQ。找不到时可以在设置中选择 QQ.exe。"
        : "QQ 安装窗口打开后，按提示完成安装，再回到这里继续。已有 QQ 可直接识别。",
      qqOpened ? "已安装 QQ，重新识别" : "下载并安装 QQ",
      async () => {
        if (qqOpened) await detect();
        else {
          await api.installOfficialQQ();
          qqOpened = true;
        }
      },
    ];
  if (missing.has("snowluma"))
    return [
      "接下来安装 SnowLuma",
      "它负责连接 QQ。自动从官方获取完整安装包，安装后保存路径。",
      "安装 SnowLuma",
      async () =>
        apply(
          await api.installOfficialSnow({
            parent: $("#snow-parent").value,
            name: $("#snow-name").value,
          }),
        ),
    ];
  if (missing.has("koishi"))
    return [
      "接下来安装 Koishi",
      "它负责运行 HDSI 插件。自动创建项目并安装依赖，已有文件夹不会被覆盖。",
      "安装 Koishi",
      async () =>
        apply(
          await api.createKoishi({
            parent: $("#koishi-parent").value,
            name: $("#koishi-name").value,
          }),
        ),
    ];
  if (missing.has("hdsi"))
    return [
      "最后安装 HDSI 插件",
      "点击后查询 npm beta 版本，再显示版本和安装按钮。所需基础插件会一并补齐。也可以在下方导入 .tgz。",
      "选择 HDSI 安装版本",
      () => {
        reveal($("#check-beta"));
        $("#check-beta").click();
      },
    ];
  return [
    "补齐缺少的基础插件",
    "自动安装管理页面、QQ 连接和数据库所需插件。已有 HDSI 版本保持不变。",
    "补齐基础插件",
    () => api.installDependencies(),
  ];
}
export function reveal(node) {
  for (let parent = node.parentElement; parent; parent = parent.parentElement)
    if (parent.tagName === "DETAILS") parent.open = true;
  node.scrollIntoView({ block: "center" });
  node.focus({ preventScroll: true });
}
async function apply(config) {
  store.config = config;
  changed();
}
async function detect(root) {
  $("#assistant-result").textContent = "正在查找已有程序…";
  const found = await api.detectPaths(root);
  const config = { ...store.config };
  const selected = [],
    ambiguous = [];
  for (const [key, label] of [
    ["koishiDir", "Koishi"],
    ["snowlumaDir", "SnowLuma"],
    ["qqExe", "QQ"],
    ["databasePath", "剧本数据库"],
  ]) {
    if (config[key]) continue;
    if (found[key].length === 1) {
      config[key] = found[key][0];
      selected.push(label);
    } else if (found[key].length > 1) ambiguous.push(label);
  }
  if (selected.length) await apply(await api.saveConfig(config));
  $("#assistant-result").textContent = [
    selected.length
      ? `已识别并保存：${selected.join("、")}。`
      : "没有新增可自动保存的路径。",
    ambiguous.length
      ? `${ambiguous.join("、")} 有多个位置，请在设置中选择。`
      : "",
    "已保存的路径不会被覆盖。其他位置可点“选择已有程序文件夹”，仍未找到可在设置中手动选择。",
    found.qqError,
  ]
    .filter(Boolean)
    .join(" ");
}
export function updateAssistant(env, busy = false) {
  environment = env;
  const [title, description, label, run] = nextStep(env);
  $("#assistant-title").textContent = title;
  $("#assistant-description").textContent = description;
  $("#assistant-next").textContent = label;
  $("#assistant-next").disabled = busy || working;
  operation = run;
  $("#assistant-path-help").hidden = Object.values(env.paths).every(Boolean);
}
export function assistantBusy(busy) {
  if (environment) updateAssistant(environment, busy);
}
export function initAssistant(onChange, inspect) {
  changed = onChange;
  refresh = inspect;
  for (const [id, pick] of [
    ["assistant-detect", false],
    ["assistant-folder", true],
  ])
    $("#" + id).onclick = (event) =>
      action(event.currentTarget, async () => {
        let root;
        if (pick) {
          root = await api.choosePath("directory");
          if (!root) return;
        }
        await detect(root);
        await refresh();
      });
  $("#assistant-next").onclick = (event) =>
    action(event.currentTarget, async () => {
      if (working) return;
      working = true;
      $("#assistant-error").hidden = true;
      try {
        await operation();
      } catch (error) {
        $("#assistant-error").textContent = error.message;
        $("#assistant-error").hidden = false;
        notice(error.message, true);
      } finally {
        working = false;
        await refresh();
      }
    });
  $("#assistant-location").onclick = () => reveal($("#snow-parent"));
}
