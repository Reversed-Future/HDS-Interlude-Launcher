export const $ = (selector) => document.querySelector(selector);
export const $$ = (selector) => [...document.querySelectorAll(selector)];
export const api = window.launcher;
export const store = {
  config: null,
  states: {},
  logs: { koishi: [], snowluma: [] },
  route: "dashboard",
};
let noticeTimer;
export function notice(message, error = false) {
  clearTimeout(noticeTimer);
  $("#notice-text").textContent = message;
  $("#notice").dataset.error = String(error);
  $("#notice").hidden = false;
  if (!error)
    noticeTimer = setTimeout(() => {
      $("#notice").hidden = true;
    }, 4500);
}
export async function action(button, run, success) {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  try {
    const value = await run();
    if (success) notice(success);
    return value;
  } catch (error) {
    notice(error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}
export function element(tag, className, content) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (content !== undefined) node.textContent = content;
  return node;
}
export function selectButtons(selector, attribute, value) {
  $$(selector).forEach((button) => {
    const selected = button.getAttribute(attribute) === value;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}
export const dateTime = (value) =>
  value === null || value === undefined
    ? "时间未记录"
    : new Date(value).toLocaleString("zh-CN", { hour12: false });
