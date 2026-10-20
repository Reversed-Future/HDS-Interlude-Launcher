import { $, $$, api, element } from "./shared.js";
import { button, group, fields, rowsEditor } from "./management-fields.js";
let koishi = null,
  snow = null,
  initialized = false;
let pluginDirty = false,
  snowDirty = false;
let working = false;
function selectTab(id) {
  $$("[data-manage-panel]").forEach((node) => {
    node.hidden = node.dataset.managePanel !== id;
  });
  $$("[data-manage-tab]").forEach((node) => {
    const selected = node.dataset.manageTab === id;
    node.classList.toggle("selected", selected);
    node.setAttribute("aria-pressed", String(selected));
  });
}
function message(text, error = false) {
  $("#manage-message").textContent = text;
  $("#manage-message").dataset.error = String(error);
}
async function run(action) {
  if (working) return;
  working = true;
  $("#manage-content").setAttribute("aria-busy", "true");
  $("#manage-content")
    .querySelectorAll("button,input,select,textarea")
    .forEach((node) => {
      node.dataset.wasDisabled = String(node.disabled);
      node.disabled = true;
    });
  message("正在处理…");
  try {
    const result = await action();
    message(result?.message || "已完成。");
    return result;
  } catch (error) {
    message(error.message, true);
  } finally {
    working = false;
    $("#manage-content").setAttribute("aria-busy", "false");
    $("#manage-content")
      .querySelectorAll("[data-was-disabled]")
      .forEach((node) => {
        node.disabled = node.dataset.wasDisabled === "true";
        delete node.dataset.wasDisabled;
      });
  }
}
function advanced(service) {
  document.dispatchEvent(
    new CustomEvent("launcher:navigate", {
      detail: {
        route: "webui",
        service: service === "snow" ? "snowluma" : service,
      },
    }),
  );
}
function requireClean() {
  if (pluginDirty || snowDirty)
    throw new Error("有尚未保存的修改。请先保存，或点击对应的“放弃修改”。");
}
function login(service) {
  const node = group(
    service === "koishi" ? "登录 Koishi 管理员账号" : "登录 SnowLuma 管理",
    "管理密码只用于本次登录，不写入启动器设置。",
  );
  const input = {};
  const specs =
    service === "koishi"
      ? [
          { key: "username", label: "用户名", type: "text" },
          { key: "password", label: "管理密码", type: "password" },
        ]
      : [
          { key: "password", label: "管理密码", type: "password" },
          { key: "totp", label: "两步验证码（未启用可留空）", type: "text" },
        ];
  node.append(fields(specs, {}, input, () => {}));
  const actions = element("div", "manage-actions");
  actions.append(
    button(
      "登录",
      () =>
        run(async () => {
          try {
            const value = await api.manage(service + "-login", input);
            if (service === "koishi") {
              koishi = value;
              renderKoishi();
            } else {
              snow = value;
              renderSnow();
            }
            return { message: "登录成功。" };
          } finally {
            input.password = "";
            node.querySelector('[data-field="password"]').value = "";
          }
        }),
      true,
    ),
    button("打开高级管理", () => advanced(service)),
  );
  node.append(actions);
  return node;
}
async function readKoishi() {
  koishi = await api.manage("koishi-status");
  renderKoishi();
}
async function readSnow() {
  snow = await api.manage("snow-status");
  renderSnow();
}
function renderKoishi() {
  const target = $("#manage-koishi");
  target.replaceChildren();
  if (koishi.loginRequired) {
    target.append(login("koishi"));
    renderPluginSelect();
    return;
  }
  const plugins = group(
    "插件开关",
    "启用或停用会立即提交给 Koishi。管理连接所需的插件保留在高级管理中操作。",
  );
  const search = element("input");
  search.type = "search";
  search.placeholder = "搜索插件名称";
  search.setAttribute("aria-label", "搜索插件名称");
  plugins.append(search);
  const list = element("div", "manage-plugin-list");
  const draw = () => {
    list.replaceChildren();
    for (const row of koishi.plugins.filter((row) =>
      row.name.includes(search.value),
    )) {
      const line = element("div", "manage-plugin");
      const body = element("div");
      body.append(
        element("strong", "", row.name),
        element(
          "small",
          "",
          row.blocked
            ? "所在分组已停用"
            : row.enabled
              ? "配置已启用"
              : "配置已停用",
        ),
      );
      const toggle = button(row.enabled ? "停用" : "启用", () =>
        run(async () => {
          requireClean();
          const result = await api.manage("plugin-toggle", {
            id: row.id,
            revision: row.revision,
            enabled: !row.enabled,
          });
          await readKoishi();
          return result;
        }),
      );
      toggle.disabled = row.protected || row.blocked;
      line.append(body, toggle);
      if (["hds-interlude", "adapter-onebot"].includes(row.name))
        line.append(
          button("修改配置", () =>
            run(async () => {
              requireClean();
              await openEditor(row.id);
            }),
          ),
        );
      list.append(line);
    }
  };
  search.addEventListener("input", draw);
  draw();
  plugins.append(list);
  target.append(plugins);
  renderPluginSelect();
}
function renderPluginSelect() {
  const select = $("#manage-plugin-select");
  const selected = select.value;
  select.replaceChildren(element("option", "", "选择 HDSI 或 OneBot 配置"));
  select.firstChild.value = "";
  for (const row of koishi?.plugins || []) {
    if (!["hds-interlude", "adapter-onebot"].includes(row.name)) continue;
    const option = element(
      "option",
      "",
      `${row.key} · ${row.enabled ? "已启用" : "已停用"}`,
    );
    option.value = row.id;
    select.append(option);
  }
  if ([...select.options].some((option) => option.value === selected))
    select.value = selected;
}
async function openEditor(id) {
  const data = await api.manage("plugin-editor", { id });
  pluginDirty = false;
  selectTab("config");
  $("#manage-plugin-select").value = id;
  const target = $("#manage-editor");
  target.replaceChildren();
  const changes = {},
    arrays = [];
  const changed = () => {
    pluginDirty = true;
    message("配置已修改，点击“备份并保存”后生效。");
  };
  for (const spec of data.groups) {
    const node = group(spec.title, spec.hint);
    node.append(fields(spec.fields, data.values, changes, changed));
    if (spec.fields.some((field) => field.key === "stickers.enabled"))
      node.append(
        button("创建并打开表情包目录", () =>
          run(async () => {
            await api.createStickerDirectory();
            await api.openStickerDirectory();
            return { message: "表情包目录已准备并打开。" };
          }),
        ),
      );
    target.append(node);
  }
  for (const spec of data.arrays) {
    const rows = rowsEditor(spec, spec.rows, changed);
    arrays.push([spec.key, rows]);
    target.append(rows.node);
  }
  const actions = element("div", "manage-save");
  actions.append(
    button(
      "备份并保存",
      () =>
        run(async () => {
          if (!pluginDirty) return { message: "配置没有变化。" };
          const result = await api.manage("plugin-save", {
            id: data.id,
            revision: data.revision,
            changes,
            arrays: Object.fromEntries(
              arrays
                .filter(([, rows]) => rows.dirty())
                .map(([key, rows]) => [key, rows.value()]),
            ),
          });
          pluginDirty = false;
          await readKoishi();
          await openEditor(data.id);
          return result;
        }),
      true,
    ),
    button("放弃修改", () =>
      run(async () => {
        pluginDirty = false;
        await openEditor(data.id);
      }),
    ),
  );
  target.append(actions);
  $("#manage-editor").scrollIntoView({ block: "start" });
}
function renderSnow() {
  const target = $("#manage-snow");
  target.replaceChildren();
  if (snow.loginRequired) {
    target.append(login("snow"));
    return;
  }
  const section = group(
    "QQ 连接状态",
    "一键启动已启用自动加载。这里可查看状态，或在加载失败后重试。",
  );
  const labels = {
    available: "等待加载",
    loading: "加载中",
    connecting: "等待连接",
    loaded: "等待 QQ 登录",
    online: "已登录",
    error: "加载失败",
    disconnected: "已断开",
  };
  if (!snow.processes.length)
    section.append(
      element("p", "manage-hint", "没有发现 QQ 进程，请先在启动台打开 QQ。"),
    );
  for (const row of snow.processes) {
    const line = element("div", "manage-plugin");
    const text = element("div");
    text.append(
      element(
        "strong",
        "",
        `QQ · PID ${row.pid}${row.uin ? " · " + row.uin : ""}`,
      ),
      element(
        "small",
        "",
        (labels[row.status] || row.status) +
          (row.error ? " · " + row.error : ""),
      ),
    );
    const load = button("重新加载", () =>
      run(async () => {
        const result = await api.manage("snow-load", { pid: row.pid });
        await readSnow();
        return result;
      }),
    );
    load.disabled = ["loading", "online"].includes(row.status);
    line.append(text, load);
    section.append(line);
  }
  target.append(section);
  const account = group(
    "OneBot 连接设置",
    "先选择 QQ 账号，再读取它的 WS 服务端。保存后可直接同步到 Koishi。",
  );
  const select = element("select");
  select.id = "manage-account";
  select.setAttribute("aria-label", "QQ 账号");
  const placeholder = element("option", "", "选择已登录的 QQ 账号");
  placeholder.value = "";
  select.append(placeholder);
  for (const row of snow.accounts) {
    const option = element(
      "option",
      "",
      `${row.nickname || "QQ"} · ${row.uin}`,
    );
    option.value = row.uin;
    select.append(option);
  }
  if (snow.accounts.length === 1) select.value = snow.accounts[0].uin;
  account.append(
    select,
    button("读取 OneBot 节点", () =>
      run(async () => {
        if (snowDirty) throw new Error("请先保存节点修改，或放弃修改。");
        await openSnowEditor(select.value);
      }),
    ),
  );
  target.append(account);
}
async function openSnowEditor(uin) {
  const data = await api.manage("snow-editor", { uin });
  snowDirty = false;
  const target = $("#manage-snow-editor");
  target.replaceChildren();
  const rows = rowsEditor(
    {
      title: "WS 服务端",
      hint: "推荐监听 127.0.0.1，端口 3001，路径 /，角色 Universal。其他网络节点保持不变。",
      fields: data.fields,
    },
    data.rows,
    () => {
      snowDirty = true;
      message("节点已修改，保存后再同步到 Koishi。");
    },
  );
  target.append(rows.node);
  const actions = element("div", "manage-actions");
  actions.append(
    button(
      "备份并保存节点",
      () =>
        run(async () => {
          if (!snowDirty) return { message: "节点没有变化。" };
          const result = await api.manage("snow-save", {
            uin,
            revision: data.revision,
            rows: rows.value(),
          });
          snowDirty = false;
          await openSnowEditor(uin);
          return result;
        }),
      true,
    ),
    button("放弃修改", () => run(() => openSnowEditor(uin))),
  );
  target.append(actions);
  const sync = group(
    "同步到 Koishi",
    "把已保存节点的 QQ 号、地址和密钥填入选中的 Koishi 适配器。不会修改其他插件。",
  );
  if (!koishi || koishi.loginRequired)
    sync.append(button("先连接或登录 Koishi", () => selectTab("plugins")));
  const nodeSelect = element("select");
  nodeSelect.setAttribute("aria-label", "SnowLuma WS 节点");
  for (const row of data.rows) {
    const option = element(
      "option",
      "",
      `${row.values.name || "WS"} · ${row.values.port || "默认端口"}`,
    );
    option.value = String(row.index);
    nodeSelect.append(option);
  }
  const adapter = element("select");
  adapter.setAttribute("aria-label", "Koishi OneBot 适配器");
  for (const row of koishi?.plugins || [])
    if (row.name === "adapter-onebot") {
      const option = element("option", "", row.key);
      option.value = row.id;
      adapter.append(option);
    }
  sync.append(
    nodeSelect,
    adapter,
    button(
      "同步到 Koishi",
      () =>
        run(async () => {
          requireClean();
          const row = koishi?.plugins.find((row) => row.id === adapter.value);
          if (!row || nodeSelect.value === "")
            throw new Error(
              "请先连接 Koishi，并选择 OneBot 适配器和 WS 节点。",
            );
          const result = await api.manage("sync-connection", {
            uin,
            revision: data.revision,
            index: Number(nodeSelect.value),
            id: row.id,
            koishiRevision: row.revision,
          });
          await readKoishi();
          await openSnowEditor(uin);
          return result;
        }),
      true,
    ),
  );
  target.append(sync);
}
export function initManagement() {
  $$("[data-manage-tab]").forEach(
    (node) =>
      (node.onclick = () => {
        if (!working) selectTab(node.dataset.manageTab);
      }),
  );
  $$("[data-manage-connect]").forEach(
    (node) => (node.onclick = () => selectTab("plugins")),
  );
  $("#manage-refresh").onclick = () =>
    run(async () => {
      requireClean();
      const results = await Promise.allSettled([readKoishi(), readSnow()]);
      const errors = results.filter((result) => result.status === "rejected");
      if (errors.length)
        throw new Error(
          errors.map((result) => result.reason.message).join("；"),
        );
    });
  $("#manage-koishi-refresh").onclick = () =>
    run(async () => {
      requireClean();
      await readKoishi();
    });
  $("#manage-snow-refresh").onclick = () =>
    run(async () => {
      requireClean();
      await readSnow();
    });
  $("#manage-read-plugin").onclick = () =>
    run(async () => {
      requireClean();
      if (!$("#manage-plugin-select").value)
        throw new Error("请先选择一个配置。");
      await openEditor($("#manage-plugin-select").value);
    });
  $$("[data-manage-web]").forEach(
    (node) => (node.onclick = () => advanced(node.dataset.manageWeb)),
  );
  $$("[data-manage-logout]").forEach(
    (node) =>
      (node.onclick = () =>
        run(async () => {
          requireClean();
          const service = node.dataset.manageLogout;
          await api.manage(service + "-logout");
          if (service === "snow") {
            snow = { loginRequired: true };
            $("#manage-snow-editor").replaceChildren();
            renderSnow();
          } else {
            koishi = { loginRequired: true };
            $("#manage-editor").replaceChildren();
            renderKoishi();
          }
          return { message: "已退出管理登录。" };
        })),
  );
}
export async function openManagement() {
  if (initialized) return;
  initialized = true;
  await run(async () => {
    const results = await Promise.allSettled([readKoishi(), readSnow()]);
    const errors = results.filter((result) => result.status === "rejected");
    if (errors.length)
      throw new Error(errors.map((result) => result.reason.message).join("；"));
  });
}
