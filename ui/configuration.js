import { $, $$, api, store, action, notice, element } from "./shared.js";
import { DEFAULTS, MODES, newProvider, generateYaml } from "./config-model.js";
import { field, grid, card } from "./config-fields.js";
import { providerEditor, responseFormats } from "./config-providers.js";
import { issuesFor, allIssues } from "./config-validation.js";
import { stickerPanel } from "./config-stickers.js";

const DRAFT_KEY = "hdsLauncherConfigurationV1";
const steps = [
  ["连接程序", "让 QQ、SnowLuma 与 Koishi 相互连接"],
  ["模型连接", "选择服务商，分配叙事与后台任务"],
  ["角色与白名单", "定义角色，以及可以和 TA 聊天的人"],
  ["世界与发言", "设置生活背景、回复节奏与互动方式"],
  ["检查并保存", "核对配置，保存后开始运行"],
];
let data = { ...DEFAULTS, providers: [newProvider(true)] };
let currentStep = 0;
let showErrors = false;
function restore() {
  try {
    const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
    if (!draft) return;
    for (const key of Object.keys(DEFAULTS))
      if (typeof draft[key] === typeof DEFAULTS[key]) data[key] = draft[key];
    if (Array.isArray(draft.providers))
      data.providers = draft.providers
        .filter((p) => Object.hasOwn(MODES, p.mode))
        .map((p) => {
          const provider = newProvider(false);
          for (const key of Object.keys(provider))
            if (typeof p[key] === typeof provider[key]) provider[key] = p[key];
          provider.apiKey = "";
          return provider;
        });
    data.wsToken = "";
  } catch {
    notice("配置草稿无法读取，已使用教程默认值。", true);
  }
}
function changed() {
  const draft = structuredClone(data);
  draft.wsToken = "";
  draft.providers.forEach((p) => {
    p.apiKey = "";
  });
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  refreshStepStates();
  if (showErrors) renderIssues();
}
function f(key, label, options = {}) {
  return field({ key, label, data, change: changed, ...options });
}
function button(label, run, primary = false) {
  const node = element("button", "button" + (primary ? " primary" : ""), label);
  node.type = "button";
  node.onclick = () => action(node, run);
  return node;
}
function route(name, service) {
  document.dispatchEvent(
    new CustomEvent("launcher:navigate", { detail: { route: name, service } }),
  );
}
function actions(...buttons) {
  const row = element("div", "wizard-actions");
  row.append(...buttons);
  return row;
}
function connectionStep() {
  const section = card(
    "连接参数",
    "在 QQ 中登录机器人账号。SnowLuma WebUI 的初始密码可以在启动日志中查看。",
  );
  section.append(
    grid([
      f("botQQ", "机器人 QQ 号", { placeholder: "填写 QQ 中登录的机器人账号" }),
      f("wsPort", "WebSocket 端口", {
        type: "number",
        min: 1,
        max: 65535,
        hint: "教程默认 3001；两端必须一致。",
      }),
      f("wsToken", "连接 Token", {
        type: "password",
        wide: true,
        hint: "粘贴 SnowLuma 的授权 Token，或在这里生成后复制到 SnowLuma。",
      }),
    ]),
  );
  const generate = button("生成随机 Token", () => {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    data.wsToken = btoa(String.fromCharCode(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    $('[data-config-key="wsToken"]').value = data.wsToken;
    changed();
    notice("Token 已生成。请复制到 SnowLuma 的授权 Token 字段。");
  });
  generate.id = "generate-token";
  section.append(
    actions(
      button("打开 QQ 登录", () => api.start("qq")),
      button("启动 SnowLuma", () => api.start("snowluma")),
      generate,
      button("复制 Token", async () => {
        if (!data.wsToken) throw new Error("请先填写或生成 Token。");
        await navigator.clipboard.writeText(data.wsToken);
        notice("Token 已复制。");
      }),
      button("打开 SnowLuma WebUI", () => route("webui", "snowluma")),
    ),
  );
  const help = card(
    "在 SnowLuma 中完成这些设置",
    "进入“进程注入”选择 QQ 进程；再在“节点配置”中新建“WS 服务端”。",
  );
  const table = element("table", "wizard-table");
  const body = document.createElement("tbody");
  for (const [label, value] of [
    ["启用", "开启"],
    ["名称", "ws-default"],
    ["主机", "127.0.0.1"],
    ["端口 / 授权 Token", "与上方填写的内容一致"],
    ["路径", "/"],
    ["消息格式", "数组"],
    ["角色", "Universal"],
    ["上报自身消息", "关闭"],
  ]) {
    const row = document.createElement("tr");
    row.append(element("th", "", label), element("td", "", value));
    body.append(row);
  }
  table.append(body);
  help.append(
    table,
    element(
      "p",
      "wizard-field-hint",
      "保存修改后，Koishi 将作为 WebSocket 客户端连接到 SnowLuma。这里生成的是 Koishi 配置，SnowLuma 的节点需在其 WebUI 中保存。",
    ),
  );
  return [section, help];
}
function modelStep() {
  const section = card(
    "填写模型服务信息",
    "先在服务商处取得 API Key 和模型名称，再粘贴到下方。首次使用填好一条连接即可，其他用途可保留默认值。",
  );
  section.append(providerEditor(data, changed));
  const formats = card(
    "输出与图片理解",
    "模型名称和 API Key 需要在所选服务商处取得。图片功能需要模型支持识图。",
  );
  formats.append(
    grid([
      f("mainResponseFormat", "主叙事输出格式", { options: responseFormats }),
      f("mainStreamingMode", "流式输出", {
        options: [
          ["off", "关闭（教程默认）"],
          ["experimental", "实验性开启"],
        ],
      }),
      f("vision", "开启图片理解", { type: "checkbox", wide: true }),
      f("visionMode", "图片理解方式", {
        options: [
          ["native", "主叙事模型直接识图"],
          ["sidecar", "独立视觉模型描述图片"],
        ],
      }),
      f("visionDetail", "图片细节", {
        options: [
          ["auto", "自动"],
          ["low", "较低"],
          ["high", "较高"],
        ],
      }),
    ]),
  );
  return [section, formats];
}
function characterStep() {
  const role = card(
    "角色设定",
    "写下年龄、身份、性格和说话习惯。教程示例可以直接修改。",
  );
  role.append(
    grid([
      f("charName", "角色名", { placeholder: "TA 的名字" }),
      f("timezone", "角色时区", {
        options: [
          "Asia/Shanghai",
          "Asia/Tokyo",
          "Asia/Hong_Kong",
          "Asia/Singapore",
        ].map((zone) => [zone, zone]),
      }),
      f("charProfile", "角色设定", { type: "textarea", wide: true }),
    ]),
  );
  const user = card(
    "聊天白名单",
    "只有白名单中的 QQ 号可以和角色私聊。按教程先配置一个用户。",
  );
  user.append(
    grid([
      f("userQQ", "你的 QQ 号", { placeholder: "允许与角色聊天的账号" }),
      f("userLabel", "你的称呼", { placeholder: "可选" }),
      f("userProfile", "你的身份设定", {
        type: "textarea",
        hint: "例如兴趣、作息，以及角色对你的了解。",
      }),
      f("userRelationship", "你与角色的关系", {
        type: "textarea",
        hint: "例如刚认识的网友、同学或朋友。",
      }),
    ]),
  );
  return [role, user];
}
function worldStep() {
  const stickers = stickerPanel(data.stickers);
  const world = card("世界与生活", "这些信息会用于持续推进角色的日常。");
  world.append(
    grid([
      f("world", "世界背景", { type: "textarea", wide: true }),
      f("location", "主要活动地点", { wide: true }),
      f("cast", "重要配角", { type: "textarea", wide: true }),
    ]),
  );
  const rhythm = card(
    "发言节奏",
    "沿用教程的时间范围，角色可以分条回复，并在无对话时推进生活。",
  );
  rhythm.append(
    grid([
      f("debounce", "消息合并等待（秒）", {
        type: "number",
        min: 0,
        max: 15,
        step: 0.5,
      }),
      f("typing", "打字速度（字 / 秒）", {
        type: "number",
        min: 1,
        max: 60,
        step: 1,
      }),
      f("autoMin", "自动推进间隔（分钟）", {
        type: "number",
        min: 5,
        max: 240,
        step: 5,
      }),
      f("stickerFormat", "表情包描述格式", { options: responseFormats }),
      ...[
        ["quoteReply", "允许引用回复"],
        ["messageReactions", "允许贴表情回应"],
        ["nativeFaces", "允许 QQ 原生小表情"],
        ["stickers", "启用本地表情包库"],
      ].map(([key, label]) =>
        f(key, label, {
          type: "checkbox",
          ...(key === "stickers"
            ? {
                change: () => {
                  changed();
                  stickers.setEnabled(data.stickers);
                },
              }
            : {}),
        }),
      ),
    ]),
  );
  rhythm.append(
    element(
      "p",
      "wizard-field-hint",
      "开启表情包库时，需要在模型连接中勾选“表情包描述”，并将素材放到 data/hds-interlude/stickers。",
    ),
  );
  if (data.stickers) stickers.refresh();
  return [world, rhythm, stickers.element];
}
function reviewStep() {
  const summary = card(
    "核对配置",
    "按 rc28 教程生成完整配置。写入时自动备份为根目录下的 koishi.yml.bak，再替换原配置。",
  );
  const table = element("table", "wizard-table");
  const body = document.createElement("tbody");
  for (const [label, value] of [
    ["Koishi 目录", store.config.koishiDir || "尚未设置"],
    ["机器人 QQ", data.botQQ || "待填写"],
    ["WebSocket", `ws://127.0.0.1:${data.wsPort}`],
    [
      "模型连接",
      data.providers
        .map(
          (p) => `${p.label || MODES[p.mode].label} / ${p.model || "待填写"}`,
        )
        .join("\n"),
    ],
    ["角色", data.charName || "待填写"],
    ["白名单 QQ", data.userQQ || "待填写"],
    ["保存内容", "完整 koishi.yml；不会合并已有插件配置"],
  ]) {
    const row = document.createElement("tr");
    row.append(element("th", "", label), element("td", "", value));
    body.append(row);
  }
  table.append(body);
  summary.append(table);
  const issues = allIssues(data);
  const checks = element("div", "wizard-review-checks");
  checks.append(
    element(
      "strong",
      "",
      issues.length ? `还有 ${issues.length} 项需要填写` : "填写检查通过",
    ),
  );
  if (issues.length) {
    const list = document.createElement("ul");
    issues.forEach((message) => list.append(element("li", "", message)));
    checks.append(list);
  } else
    checks.append(
      element(
        "p",
        "wizard-description",
        "保存后先打开 QQ，再启动 SnowLuma 与 Koishi。在聊天中运行 interlude.doctor 检查。填写检查不代表服务商 API 已连通。",
      ),
    );
  summary.append(
    checks,
    actions(
      button("预览生成配置", preview, true),
      button("打开 Koishi WebUI", () => route("webui", "koishi")),
    ),
  );
  return [summary];
}
function refreshStepStates() {
  $$("[data-config-step]").forEach((node, index) => {
    node.classList.toggle("active", index === currentStep);
    node.classList.toggle(
      "complete",
      index < 4 && issuesFor(data, index).length === 0,
    );
    node.setAttribute("aria-current", index === currentStep ? "step" : "false");
  });
}
function renderIssues() {
  const issues = issuesFor(data, currentStep);
  $("#wizard-errors").textContent =
    showErrors && issues.length ? "请先完成：" + issues.join("；") : "";
  $("#wizard-errors").hidden = !showErrors || !issues.length;
}
function render() {
  const builders = [
    connectionStep,
    modelStep,
    characterStep,
    worldStep,
    reviewStep,
  ];
  $("#wizard-content").replaceChildren(...builders[currentStep]());
  $("#wizard-step-title").textContent = steps[currentStep][0];
  $("#wizard-step-description").textContent = steps[currentStep][1];
  $("#wizard-position").textContent = `${currentStep + 1} / ${steps.length}`;
  $("#wizard-prev").disabled = currentStep === 0;
  $("#wizard-next").textContent = currentStep === 4 ? "预览并保存" : "下一步";
  refreshStepStates();
  renderIssues();
}
function preview() {
  const issues = allIssues(data);
  $("#yaml-preview").value = generateYaml(data);
  $("#yaml-issues").textContent = issues.length
    ? "请先补全：" + issues.join("；")
    : "必填项已填写。请核对配置后保存。";
  $("#write-yaml").disabled = issues.length > 0;
  $("#export-yaml").disabled = issues.length > 0;
  $("#yaml-dialog").showModal();
}
export function initGuide() {
  restore();
  const nav = $("#wizard-steps");
  steps.forEach(([title], index) => {
    const node = element("button", "wizard-step");
    node.dataset.configStep = index;
    node.append(element("span", "", title));
    node.onclick = () => {
      currentStep = index;
      showErrors = false;
      render();
    };
    nav.append(node);
  });
  $("#wizard-prev").onclick = () => {
    if (currentStep > 0) {
      currentStep--;
      showErrors = false;
      render();
    }
  };
  $("#wizard-next").onclick = () => {
    if (currentStep === 4) return preview();
    showErrors = true;
    if (issuesFor(data, currentStep).length) return renderIssues();
    currentStep++;
    showErrors = false;
    render();
    window.scrollTo(0, 0);
  };
  $("#preview-yaml").onclick = preview;
  $("#close-yaml").onclick = () => $("#yaml-dialog").close();
  $("#export-yaml").onclick = (event) =>
    action(event.currentTarget, async () => {
      if (allIssues(data).length) throw new Error("请先补全必填项。");
      const file = await api.exportYaml($("#yaml-preview").value);
      if (file) notice("配置已导出：" + file);
    });
  $("#write-yaml").onclick = (event) =>
    action(event.currentTarget, async () => {
      if (allIssues(data).length) throw new Error("请先补全必填项。");
      const result = await api.writeYaml($("#yaml-preview").value);
      if (result) {
        $("#yaml-dialog").close();
        route("dashboard");
        notice(
          result.bak
            ? "配置已写入 Koishi 根目录，原配置已备份为 koishi.yml.bak。"
            : "已在 Koishi 根目录创建 koishi.yml。",
        );
      }
    });
  render();
}
