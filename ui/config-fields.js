import { element } from "./shared.js";
let sequence = 0;
export function field({
  key,
  label,
  data,
  change,
  type = "text",
  hint,
  options,
  wide = false,
  placeholder,
  min,
  max,
  step,
}) {
  const wrap = element("div", "wizard-field" + (wide ? " wide" : ""));
  const id = "wizard-field-" + ++sequence;
  const caption = element("label", "", label);
  caption.htmlFor = id;
  const input = document.createElement(
    options ? "select" : type === "textarea" ? "textarea" : "input",
  );
  input.id = id;
  input.dataset.configKey = key;
  if (options)
    for (const [value, text] of options) {
      const option = element("option", "", text);
      option.value = value;
      input.append(option);
    }
  else if (type !== "textarea") input.type = type;
  if (type === "textarea") input.rows = 4;
  if (placeholder) input.placeholder = placeholder;
  if (min !== undefined) input.min = min;
  if (max !== undefined) input.max = max;
  if (step !== undefined) input.step = step;
  input.autocomplete = "off";
  input.spellcheck = false;
  if (type === "checkbox") {
    input.checked = !!data[key];
    wrap.classList.add("wizard-check");
    caption.prepend(input);
    wrap.append(caption);
  } else {
    input.value = data[key] ?? "";
    wrap.append(caption, input);
  }
  if (hint) wrap.append(element("p", "wizard-field-hint", hint));
  input.addEventListener(
    options || type === "checkbox" ? "change" : "input",
    () => {
      data[key] = type === "checkbox" ? input.checked : input.value;
      change(key);
    },
  );
  return wrap;
}
export function grid(fields) {
  const node = element("div", "wizard-fields");
  node.append(...fields);
  return node;
}
export function card(title, description) {
  const node = element("section", "wizard-card");
  node.append(element("h2", "", title));
  if (description) node.append(element("p", "wizard-description", description));
  return node;
}
