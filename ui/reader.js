import {
  $,
  $$,
  api,
  notice,
  action,
  element,
  selectButtons,
  dateTime,
} from "./shared.js";
let stories = [];
let selected = null;
let mode = "script";
let offset = 0;
let total = 0;
let initialized = false;
let entryRequest = 0;
let storyRequest = 0;
let searchTimer;
function empty(title, description) {
  $("#reader-empty").hidden = false;
  $("#reader-empty h2").textContent = title;
  $("#reader-empty p").textContent = description;
  $("#story-article").hidden = true;
  $("#previous-page").disabled = true;
  $("#next-page").disabled = true;
  $("#entry-summary").textContent = title;
  $("#page-number").textContent = "—";
}
function renderStories() {
  $("#story-count").textContent = String(stories.length);
  const nodes = stories.map((story) => {
    const button = element("button", "story-choice");
    button.classList.toggle("selected", story.id === selected?.id);
    button.setAttribute("aria-pressed", String(story.id === selected?.id));
    button.append(
      element("strong", "", story.name),
      element(
        "p",
        "",
        `${story.scriptCount} 段剧本 · ${story.entryCount} 条记录`,
      ),
      element("small", "", story.id),
    );
    button.addEventListener("click", () => {
      selected = story;
      offset = 0;
      renderStories();
      loadEntries();
    });
    return button;
  });
  $("#story-list").replaceChildren(...nodes);
}
function renderSetting(story) {
  const setting = story.setting;
  const rows = [
    ["角色", setting?.character?.profile],
    ["世界", setting?.world],
    ["关系", setting?.relationship],
    ["地点", setting?.location],
    ["配角", setting?.supportingCast],
    ["风格", setting?.style],
  ];
  const fragment = document.createDocumentFragment();
  for (const [label, content] of rows) {
    if (typeof content !== "string" || !content) continue;
    const section = element("section", "setting-item");
    section.append(element("h3", "", label), element("p", "", content));
    fragment.append(section);
  }
  $("#story-setting").replaceChildren(fragment);
}
async function loadEntries() {
  const current = ++entryRequest;
  if (!selected) return;
  empty("正在读取剧本", "内容按故事时间顺序排列。");
  try {
    const data = await api.entries({
      storyId: selected.id,
      mode,
      query: $("#story-search").value,
      offset,
    });
    if (current !== entryRequest) return;
    total = data.total;
    $("#reader-empty").hidden = true;
    $("#story-article").hidden = false;
    $("#story-name").textContent = selected.name;
    $("#story-meta").textContent =
      `${mode === "script" ? "剧本正文" : "完整记录"} · ${total} 段 · 更新于 ${dateTime(selected.updatedAt)}`;
    renderSetting(selected);
    const fragment = document.createDocumentFragment();
    for (const row of data.entries) {
      const section = element("section", "entry");
      const header = element("div", "entry-header");
      header.append(
        element("time", "", dateTime(row.occurredAt)),
        element("span", "kind", row.kind),
      );
      if (mode === "all") header.append(element("span", "", row.actor));
      // HDS Interlude uses this exact marker between separately sent messages.
      // Render the boundary as a paragraph break without interpreting HTML.
      const displayContent = row.content.replaceAll("<sep/>", "\n\n");
      section.append(header, element("div", "entry-content", displayContent));
      fragment.append(section);
    }
    if (!data.entries.length)
      fragment.append(
        element(
          "p",
          "subtle",
          $("#story-search").value
            ? "没有匹配的内容，试试其他关键词。"
            : "这个剧本暂时没有对应记录。",
        ),
      );
    $("#story-entries").replaceChildren(fragment);
    $("#entry-summary").textContent = total
      ? `第 ${offset + 1}–${Math.min(offset + 30, total)} 段，共 ${total} 段`
      : "0 段记录";
    $("#page-number").textContent = total
      ? `${Math.floor(offset / 30) + 1} / ${Math.ceil(total / 30)}`
      : "0 / 0";
    $("#previous-page").disabled = offset === 0;
    $("#next-page").disabled = offset + 30 >= total;
    $("#reading-scroll").scrollTop = 0;
  } catch (error) {
    if (current === entryRequest) empty("暂时无法读取", error.message);
  }
}
export async function openReader(force = false) {
  if (initialized && !force) return;
  const current = ++storyRequest;
  entryRequest++;
  empty("正在打开书架", "以只读模式连接 koishi.db。");
  try {
    const result = await api.stories();
    if (current !== storyRequest) return;
    stories = result;
    initialized = true;
    selected =
      stories.find((story) => story.id === selected?.id) || stories[0] || null;
    offset = 0;
    renderStories();
    if (!selected)
      empty(
        "书架还是空的",
        "数据库已连接，尚未找到剧本。开始故事后可刷新书架。",
      );
    else await loadEntries();
  } catch (error) {
    if (current === storyRequest) {
      initialized = false;
      stories = [];
      selected = null;
      renderStories();
      empty("暂时无法打开书架", error.message);
    }
  }
}
export function invalidateReader() {
  initialized = false;
  storyRequest++;
  entryRequest++;
}
export function initReader() {
  $("#refresh-stories").addEventListener("click", (event) =>
    action(event.currentTarget, () => openReader(true)),
  );
  $$("[data-read-mode]").forEach((button) =>
    button.addEventListener("click", () => {
      mode = button.dataset.readMode;
      offset = 0;
      selectButtons("[data-read-mode]", "data-read-mode", mode);
      loadEntries();
    }),
  );
  $("#story-search").addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      offset = 0;
      loadEntries();
    }, 250);
  });
  $("#previous-page").addEventListener("click", () => {
    offset = Math.max(0, offset - 30);
    loadEntries();
  });
  $("#next-page").addEventListener("click", () => {
    if (offset + 30 < total) {
      offset += 30;
      loadEntries();
    }
  });
  $("#reader-font").addEventListener("click", () => {
    const large = $("#reading-scroll").classList.toggle("large-font");
    $("#reader-font").setAttribute("aria-pressed", String(large));
  });
}
