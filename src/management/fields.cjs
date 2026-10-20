const text = (key, label, type = "text", extra = {}) => ({
  key,
  label,
  type,
  ...extra,
});
const bool = (key, label) => text(key, label, "boolean");
const purposes = [
  "useForMain",
  "useForCompaction",
  "useForAlter",
  "useForStickers",
  "useForVision",
];
// Keys and limits are taken from HDSI's Config schema and configuration guide.
const hdsi = [
  {
    title: "角色与世界",
    hint: "这些默认设定用于新故事，不会自动改写已经存在的故事。",
    fields: [
      text("storyDefaults.characterName", "角色名称"),
      text("storyDefaults.characterProfile", "角色设定", "textarea"),
      text("storyDefaults.world", "世界背景", "textarea"),
      text("storyDefaults.location", "常驻地点"),
      text("storyDefaults.supportingCast", "配角设定", "textarea"),
      text("storyDefaults.timezone", "时区"),
    ],
  },
  {
    title: "回复节奏",
    fields: [
      bool("runtime.autoCreate", "首次私聊自动创建故事"),
      bool("runtime.splitReplyMessages", "按 <sep/> 分条发送"),
      text(
        "runtime.userMessageDebounceSeconds",
        "短消息合并等待（秒）",
        "number",
        { min: 0, max: 15 },
      ),
      text(
        "runtime.typingCharactersPerSecond",
        "打字速度（每秒字符）",
        "number",
        { min: 1, max: 100 },
      ),
      bool("runtime.autoAdvanceEnabled", "没有消息时继续推进生活"),
      text(
        "runtime.autoAdvanceIntervalMinutes",
        "自动推进间隔（分钟）",
        "number",
        {
          min: 5,
          max: 1440,
          integer: true,
          hint: "启用 Urge 弹性调度时此间隔不生效。",
        },
      ),
    ],
  },
  {
    title: "聊天功能",
    fields: [
      bool("onebot.enabled", "启用 QQ 接入"),
      bool("chatActions.enabled", "启用聊天互动"),
      bool("chatActions.quoteReply", "引用回复"),
      bool("chatActions.messageReactions", "消息贴表情"),
      bool("chatActions.nativeFaces", "QQ 小表情"),
      bool("stickers.enabled", "使用本地表情包库"),
    ],
  },
];
const arrays = [
  {
    key: "model.providers",
    title: "模型连接",
    hint: "Embedding 必须使用专用向量模型，且只能勾选 Embedding 用途。官方模式通常无需填写接口地址。",
    fields: [
      text("label", "连接名称"),
      bool("enabled", "启用"),
      text("mode", "服务类型", "select", {
        options: [
          "openai-compatible",
          "zhipu-official",
          "openai-official",
          "deepseek-official",
          "moonshot-official",
          "dashscope-official",
          "siliconflow-official",
          "openrouter",
          "gemini-openai",
        ],
      }),
      text("endpoint", "完整接口地址"),
      text("apiKey", "API Key", "password"),
      text("model", "模型名称"),
      bool("useForMain", "主叙事"),
      bool("useForCompaction", "后台压缩"),
      bool("useForAlter", "Alter 分析"),
      bool("useForEmbedding", "Embedding（专用向量模型）"),
      bool("useForStickers", "表情包描述"),
      bool("useForVision", "图片理解"),
    ],
  },
  {
    key: "onebot.botAccounts",
    title: "机器人账号",
    hint: "填写登录在 QQ 中的机器人账号。",
    fields: [
      text("qq", "QQ 号", "text", { qq: true }),
      bool("enabled", "启用"),
    ],
  },
  {
    key: "onebot.userAccounts",
    title: "允许私聊的用户",
    hint: "只有白名单中已启用的用户可以与角色私聊。",
    fields: [
      text("qq", "QQ 号", "text", { qq: true }),
      text("label", "称呼"),
      bool("enabled", "启用"),
      text("profile", "用户资料", "textarea"),
      text("relationship", "初始关系", "textarea"),
    ],
  },
];
const onebot = [
  text("selfId", "机器人 QQ 号", "text", { qq: true }),
  text("endpoint", "连接地址（ws://127.0.0.1:3001）"),
  text("token", "连接密钥", "password"),
];
const snow = [
  text("name", "节点名称"),
  bool("enabled", "启用"),
  text("host", "监听地址"),
  text("port", "端口", "number", { min: 1, max: 65535, integer: true }),
  text("path", "路径"),
  text("accessToken", "连接密钥", "password"),
  text("role", "角色", "select", { options: ["Universal", "Api", "Event"] }),
  text("messageFormat", "消息格式", "select", { options: ["array", "string"] }),
  bool("reportSelfMessage", "上报自身消息"),
];

function get(object, key) {
  return key.split(".").reduce((value, part) => value?.[part], object);
}
function set(object, key, value) {
  const parts = key.split(".");
  for (const part of parts.slice(0, -1)) {
    if (
      !object[part] ||
      typeof object[part] !== "object" ||
      Array.isArray(object[part])
    )
      object[part] = {};
    object = object[part];
  }
  if (value === null) delete object[parts.at(-1)];
  else object[parts.at(-1)] = value;
}
function project(config, fields) {
  return Object.fromEntries(
    fields.map((field) => [field.key, get(config, field.key) ?? null]),
  );
}
function patch(config, changes, fields) {
  if (!changes || typeof changes !== "object" || Array.isArray(changes))
    throw new Error("修改内容格式错误。");
  for (const [key, value] of Object.entries(changes)) {
    const field = fields.find((item) => item.key === key);
    if (!field) throw new Error("包含不支持的配置字段。");
    if (value !== null) {
      if (field.type === "number") {
        if (
          !Number.isFinite(value) ||
          value < field.min ||
          value > field.max ||
          (field.integer && !Number.isInteger(value))
        )
          throw new Error(`${field.label} 超出允许范围。`);
      } else if (field.type === "boolean") {
        if (typeof value !== "boolean")
          throw new Error(`${field.label} 必须是开关值。`);
      } else if (
        typeof value !== "string" ||
        value.length > 60000 ||
        (field.options && !field.options.includes(value)) ||
        (field.qq && !/^[1-9]\d{4,10}$/.test(value))
      )
        throw new Error(`${field.label} 格式不正确。`);
    }
    set(config, key, value);
  }
  return config;
}
function patchRows(previous, rows, fields, make = () => ({})) {
  if (!Array.isArray(rows) || rows.length > 100)
    throw new Error("列表最多支持 100 项。");
  const used = new Set();
  return rows.map((row) => {
    if (
      row.index !== null &&
      (!Number.isInteger(row.index) ||
        !previous[row.index] ||
        used.has(row.index))
    )
      throw new Error("列表已经变化，请重新读取。");
    if (row.index !== null) used.add(row.index);
    return patch(
      row.index === null ? make() : structuredClone(previous[row.index]),
      row.changes,
      fields,
    );
  });
}
function validateEmbedding(config) {
  for (const provider of config.model?.providers || []) {
    if (
      provider.useForEmbedding === true &&
      purposes.some((key) =>
        key === "useForMain" ? provider[key] !== false : provider[key] === true,
      )
    )
      throw new Error(
        "Embedding 必须使用专用向量模型，并且只能开启 Embedding 用途。请关闭这条连接的其他用途。",
      );
  }
}
module.exports = {
  hdsi,
  arrays,
  onebot,
  snow,
  get,
  set,
  project,
  patch,
  patchRows,
  validateEmbedding,
};
