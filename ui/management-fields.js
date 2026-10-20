import { element } from "./shared.js";
let sequence = 0;
const modes = {
  "openai-compatible": "OpenAI 兼容接口",
  "zhipu-official": "智谱官方",
  "openai-official": "OpenAI 官方",
  "deepseek-official": "DeepSeek 官方",
  "moonshot-official": "Kimi 官方",
  "dashscope-official": "阿里云百炼",
  "siliconflow-official": "硅基流动",
  openrouter: "OpenRouter",
  "gemini-openai": "Gemini 兼容接口",
  Universal: "收发消息与接口（Universal）",
  Api: "仅接口（Api）",
  Event: "仅事件（Event）",
  array: "数组",
  string: "字符串",
};
export function button(label, run, primary = false) {
  const node = element("button", primary ? "button primary" : "button", label);
  node.type = "button";
  node.addEventListener("click", run);
  return node;
}
export function group(title, hint) {
  const node = element("section", "manage-card");
  node.append(element("h2", "", title));
  if (hint) node.append(element("p", "manage-hint", hint));
  return node;
}
export function field(spec, value, change) {
  const wrap = element("div", "manage-field");
  const label = element("label", "", spec.label);
  const control = document.createElement(
    ["select", "boolean"].includes(spec.type)
      ? "select"
      : spec.type === "textarea"
        ? "textarea"
        : "input",
  );
  control.id = "manage-field-" + ++sequence;
  control.dataset.field = spec.key;
  label.htmlFor = control.id;
  if (spec.type === "boolean" || spec.type === "select") {
    const choices =
      spec.type === "boolean"
        ? [
            ["", "使用程序默认值"],
            ["true", "开启"],
            ["false", "关闭"],
          ]
        : [
            ["", "未设置"],
            ...spec.options.map((item) => [item, modes[item] || item]),
          ];
    if (
      value !== null &&
      value !== undefined &&
      !choices.some(([key]) => key === String(value))
    )
      choices.push([String(value), String(value)]);
    for (const [key, text] of choices) {
      const option = element("option", "", text);
      option.value = key;
      control.append(option);
    }
    control.value = value === null || value === undefined ? "" : String(value);
  } else {
    if (spec.type !== "textarea") control.type = spec.type || "text";
    if (spec.type === "number") {
      control.min = spec.min;
      control.max = spec.max;
      control.step = spec.integer ? "1" : "any";
    }
    if (spec.type === "password") {
      control.autocomplete = "off";
      control.spellcheck = false;
    }
    control.value = value ?? "";
    control.placeholder = "未设置时保留程序默认值";
  }
  control.addEventListener("input", () => {
    const value =
      spec.type === "boolean"
        ? control.value === ""
          ? null
          : control.value === "true"
        : spec.type === "number"
          ? control.value === ""
            ? null
            : Number(control.value)
          : spec.type === "select" && control.value === ""
            ? null
            : control.value;
    change(value);
  });
  wrap.append(label, control);
  if (spec.hint) wrap.append(element("small", "", spec.hint));
  if (["token", "accessToken"].includes(spec.key)) {
    wrap.append(
      button("生成随机密钥", () => {
        const value = [...crypto.getRandomValues(new Uint8Array(32))]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        control.value = value;
        change(value);
      }),
    );
  }
  return wrap;
}
export function fields(specs, values, changes, changed) {
  const node = element("div", "manage-fields");
  for (const spec of specs)
    node.append(
      field(spec, values[spec.key], (value) => {
        changes[spec.key] = value;
        changed(spec.key);
      }),
    );
  return node;
}
export function rowsEditor(spec, initialRows, changed) {
  const node = group(spec.title, spec.hint);
  const list = element("div", "manage-rows");
  let dirty = false;
  const rows = initialRows.map((row) => ({ ...row, changes: {} }));
  const mark = () => {
    dirty = true;
    changed();
  };
  function render() {
    list.replaceChildren();
    rows.forEach((row, index) => {
      const detail = element("details", "manage-row");
      detail.open = rows.length === 1 || row.index === null;
      const summary = element(
        "summary",
        "",
        `${spec.title} ${index + 1} · ${row.values.label || row.values.name || row.values.qq || "新建项目"}`,
      );
      detail.append(
        summary,
        fields(
          spec.fields,
          { ...row.values, ...row.changes },
          row.changes,
          (key) => {
            if (
              spec.key === "model.providers" &&
              key === "useForEmbedding" &&
              row.changes.useForEmbedding === true
            ) {
              for (const purpose of [
                "useForMain",
                "useForCompaction",
                "useForAlter",
                "useForStickers",
                "useForVision",
              ]) {
                row.changes[purpose] = false;
                detail.querySelector(`[data-field="${purpose}"]`).value =
                  "false";
              }
            }
            mark();
          },
        ),
      );
      detail.append(
        button("移除此项", () => {
          rows.splice(index, 1);
          mark();
          render();
        }),
      );
      list.append(detail);
    });
  }
  node.append(
    list,
    button("添加一项", () => {
      rows.push({ index: null, values: {}, changes: {} });
      mark();
      render();
    }),
  );
  render();
  return {
    node,
    dirty: () => dirty,
    value: () =>
      rows.map((row) => ({ index: row.index, changes: row.changes })),
  };
}
