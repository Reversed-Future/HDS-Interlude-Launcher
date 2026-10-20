import { $, $$, api, store, action, element, notice } from "./shared.js";
export function fillSettings() {
  for (const [key, value] of Object.entries(store.config))
    document.getElementById(key).value = value;
}
export function initSettings(onSave) {
  api
    .projects()
    .then((projects) => {
      for (const project of projects) {
        const row = element("div", "about-project");
        const body = element("div", "");
        body.append(
          element("strong", "", project.name),
          element("p", "", project.description),
        );
        const open = element("button", "button small star-button");
        open.append(element("span", "", "☆ Star"));
        const stars = element("span", "star-count", "—");
        stars.dataset.projectStars = project.id;
        open.append(stars);
        open.type = "button";
        open.onclick = () => action(open, () => api.openProject(project.id));
        row.append(body, open);
        if (project.backupUrl) {
          const backup = element("button", "text-button", "Gitee 备用仓库");
          backup.type = "button";
          backup.onclick = () =>
            action(backup, () => api.openDownload("interludeBackup"));
          body.append(backup);
        }
        $("#about-projects").append(row);
      }
      return api.projectStars().then((counts) => {
        for (const project of projects) {
          const value = counts[project.id];
          const span = document.querySelector(
            `[data-project-stars="${project.id}"]`,
          );
          if (value?.count !== null && Number.isSafeInteger(value?.count)) {
            span.textContent = value.count.toLocaleString();
            span.title = `${value.stale ? "上次获取" : "获取时间"}：${new Date(value.checkedAt).toLocaleString()}`;
          } else span.title = "星数暂不可用，点击可访问仓库";
        }
      });
    })
    .catch((error) => notice(error.message, true));
  async function detect(root) {
    const result = await api.detectPaths(root);
    const box = $("#detected-paths");
    box.replaceChildren();
    for (const [key, title] of [
      ["koishiDir", "Koishi"],
      ["snowlumaDir", "SnowLuma"],
      ["qqExe", "QQ"],
      ["databasePath", "剧本数据库"],
    ]) {
      const paths = result[key];
      const label = element("label", "", `${title} · 找到 ${paths.length} 处`);
      if (paths.length) {
        const select = element("select", "");
        select.setAttribute("aria-label", `识别到的 ${title} 路径`);
        const placeholder = element("option", "", "选择要填入的位置");
        placeholder.value = "";
        select.append(placeholder);
        for (const value of paths) {
          const option = element("option", "", value);
          option.value = value;
          select.append(option);
        }
        select.onchange = () => {
          if (select.value) $("#" + key).value = select.value;
        };
        if (paths.length === 1 && !$("#" + key).value) {
          select.value = paths[0];
          $("#" + key).value = paths[0];
        }
        label.append(select);
      }
      box.append(label);
    }
    box.hidden = false;
    notice(
      result.qqError ||
        "检测完成。核对路径后点击保存；未找到的项目可选择父目录扫描或手动填写。",
      !!result.qqError,
    );
  }
  $("#detect-paths").onclick = (event) =>
    action(event.currentTarget, () => detect());
  $("#scan-parent").onclick = (event) =>
    action(event.currentTarget, async () => {
      const root = await api.choosePath("directory");
      if (root) await detect(root);
    });
  $("#settings-form").addEventListener("submit", (event) =>
    event.preventDefault(),
  );
  $$("[data-pick]").forEach((button) =>
    button.addEventListener("click", () =>
      action(button, async () => {
        const path = await api.choosePath(button.dataset.kind);
        if (path) document.getElementById(button.dataset.pick).value = path;
      }),
    ),
  );
  $("#save-settings").addEventListener("click", (event) =>
    action(
      event.currentTarget,
      async () => {
        const config = Object.fromEntries(new FormData($("#settings-form")));
        store.config = await api.saveConfig(config);
        onSave();
      },
      "设置已保存。新的程序路径将在下次启动时使用。",
    ),
  );
}
