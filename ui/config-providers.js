import { element } from "./shared.js";
import { field, grid } from "./config-fields.js";
import { MODES, newProvider } from "./config-model.js";
const responseFormats = [
  ["json-object", "JSON Object"],
  ["prompt-only", "Prompt only"],
];
export function providerEditor(data, changed) {
  const container = element("div", "provider-editor");
  function render() {
    container.replaceChildren();
    data.providers.forEach((provider, index) => {
      const panel = element("section", "provider-panel");
      panel.dataset.providerIndex = index;
      const heading = element("div", "provider-heading");
      heading.append(element("strong", "", `连接 ${index + 1}`));
      const remove = element("button", "button small", "移除此连接");
      remove.type = "button";
      remove.onclick = () => {
        data.providers.splice(index, 1);
        changed();
        render();
      };
      heading.append(remove);
      panel.append(heading);
      const change = (key) => {
        if (key === "mode")
          provider.model = provider.useEmbedding
            ? ""
            : MODES[provider.mode].model;
        if (key === "useEmbedding" && provider.useEmbedding)
          for (const k of [
            "useMain",
            "useCompaction",
            "useAlter",
            "useStickers",
            "useVision",
          ])
            provider[k] = false;
        if (
          [
            "useMain",
            "useCompaction",
            "useAlter",
            "useStickers",
            "useVision",
          ].includes(key) &&
          provider[key]
        )
          provider.useEmbedding = false;
        changed();
        if (
          [
            "mode",
            "deepseekThinking",
            "useEmbedding",
            "useMain",
            "useCompaction",
            "useAlter",
            "useStickers",
            "useVision",
          ].includes(key)
        )
          render();
      };
      const f = (key, label, options = {}) =>
        field({ key, label, data: provider, change, ...options });
      panel.append(
        grid([
          f("label", "连接名称", { placeholder: "例如：主力模型" }),
          f("mode", "服务商", {
            options: Object.entries(MODES).map(([value, mode]) => [
              value,
              mode.label,
            ]),
          }),
          f("apiKey", "API Key", {
            type: "password",
            hint: MODES[provider.mode].reg,
          }),
          f(
            "model",
            provider.useEmbedding ? "专用 Embedding 模型名称" : "模型名称",
            {
              placeholder: provider.useEmbedding
                ? "填写服务商提供的文本向量模型名称"
                : "填写实际可用的模型名称",
              hint: provider.useEmbedding
                ? "必须是专用 embedding（文本向量）模型，普通聊天模型不能用于此功能。"
                : undefined,
            },
          ),
          ...(provider.mode === "openai-compatible"
            ? [
                f("endpoint", "接口地址", {
                  wide: true,
                  placeholder: "https://…/v1/chat/completions",
                  hint: provider.useEmbedding
                    ? "按插件要求填写 /chat/completions 地址；HDSI 会自动转换为 /embeddings 调用，服务商必须支持该向量接口。"
                    : "填写完整的 Chat Completions 地址。",
                }),
              ]
            : []),
        ]),
      );
      const roles = element("div", "provider-roles");
      for (const [key, label] of [
        ["useMain", "主叙事"],
        ["useCompaction", "后台压缩"],
        ["useAlter", "Alter 分析"],
        ["useEmbedding", "Embedding（仅向量检索）"],
        ["useStickers", "表情包描述"],
        ["useVision", "侧端识图"],
      ]) {
        const role = f(key, label, { type: "checkbox" });
        if (provider.useEmbedding && key !== "useEmbedding")
          role.querySelector("input").disabled = true;
        roles.append(role);
      }
      panel.append(
        element(
          "p",
          "wizard-field-hint",
          "这条连接负责哪些任务？第一条默认承担主叙事、压缩与 Alter。",
        ),
        roles,
        element(
          "p",
          "embedding-notice",
          provider.useEmbedding
            ? "此连接仅用于 Embedding。必须填写专用的 embedding 模型；主叙事、压缩、Alter、表情包描述与识图已关闭。需要其他功能请另建模型连接。"
            : "Embedding 必须使用专用的 embedding（文本向量）模型，并独占一条连接；普通聊天模型不能勾选此用途。",
        ),
      );
      const advanced = element("details", "provider-advanced");
      advanced.append(element("summary", "", "高级模型参数"));
      const fields = [
        f("responseFormat", "后台输出格式", { options: responseFormats }),
      ];
      if (provider.mode === "zhipu-official")
        fields.push(
          f("reasoning", "推理强度", {
            options: [
              ["low", "low"],
              ["high", "high"],
              ["max", "max"],
            ],
          }),
        );
      if (provider.mode === "deepseek-official") {
        fields.push(
          f("deepseekThinking", "思考模式", {
            options: [
              ["disabled", "关闭"],
              ["enabled", "开启"],
            ],
          }),
        );
        if (provider.deepseekThinking === "enabled")
          fields.push(
            f("deepseekReasoning", "思考强度", {
              options: [
                ["low", "low"],
                ["high", "high"],
                ["max", "max"],
              ],
            }),
          );
      }
      if (provider.mode === "dashscope-official")
        fields.push(
          f("region", "服务地域", {
            options: [
              ["beijing", "北京"],
              ["singapore", "新加坡"],
              ["us", "美国"],
            ],
          }),
        );
      if (provider.mode === "openai-compatible" && provider.useMain)
        fields.push(
          f("temperature", "主叙事 Temperature"),
          f("topP", "主叙事 Top P"),
        );
      if (provider.useCompaction)
        fields.push(
          f("compTemperature", "压缩 Temperature"),
          f("compTopP", "压缩 Top P"),
        );
      if (provider.useAlter)
        fields.push(
          f("alterTemperature", "Alter Temperature"),
          f("alterTopP", "Alter Top P"),
        );
      advanced.append(grid(fields));
      if (!provider.useEmbedding) panel.append(advanced);
      container.append(panel);
    });
    const add = element("button", "button", "＋ 添加模型连接");
    add.id = "add-provider";
    add.type = "button";
    add.onclick = () => {
      data.providers.push(newProvider(data.providers.length === 0));
      changed();
      render();
    };
    container.append(add);
  }
  render();
  return container;
}
export { responseFormats };
