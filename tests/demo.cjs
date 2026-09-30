// Synthetic fixtures only: no personal configuration, account, or story is copied.
const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { defaults } = require("../src/config.cjs");
const { BASE_PACKAGES } = require("../src/setup/service.cjs");
function createDemo(root) {
  const base = path.join(root, "HDS-Interlude");
  const config = {
    ...defaults,
    koishiDir: path.join(base, "koishi"),
    snowlumaDir: path.join(base, "SnowLuma"),
    qqExe: path.join(base, "QQ", "QQ.exe"),
    databasePath: path.join(base, "koishi", "data", "koishi.db"),
    koishiUrl: "http://127.0.0.1:5140",
    snowlumaUrl: "http://127.0.0.1:5099",
  };
  for (const dir of [
    config.koishiDir,
    config.snowlumaDir,
    path.dirname(config.qqExe),
    path.dirname(config.databasePath),
  ])
    fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(config.koishiDir, "package.json"),
    JSON.stringify({
      name: "launcher-demo",
      version: "1.0.0",
      scripts: { start: "node demo.cjs" },
    }),
  );
  for (const name of [
    ...BASE_PACKAGES,
    "koishi",
    "koishi-plugin-adapter-onebot",
    "@koishijs/plugin-database-sqlite",
    "koishi-plugin-hds-interlude",
  ]) {
    const dir = path.join(config.koishiDir, "node_modules", name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name,
        version:
          name === "koishi-plugin-hds-interlude" ? "1.0.1-rc28" : "1.0.0",
      }),
    );
  }
  for (const file of ["launcher.bat", "index.mjs", "check-node-version.cjs"])
    fs.writeFileSync(path.join(config.snowlumaDir, file), "");
  fs.writeFileSync(config.qqExe, "demo placeholder; never execute");
  const db = new DatabaseSync(config.databasePath);
  db.exec(
    "CREATE TABLE interlude_story(id TEXT PRIMARY KEY,status TEXT,setting TEXT,createdAt INTEGER,updatedAt INTEGER); CREATE TABLE interlude_script_entry(id INTEGER PRIMARY KEY,storyId TEXT,kind TEXT,actor TEXT,content TEXT,occurredAt INTEGER);",
  );
  const time = Date.UTC(2026, 8, 30, 9);
  const stories = [
    ["暮色书店", "林小夏"],
    ["海边来信", "许知远"],
  ];
  const texts = [
    "傍晚的风掠过书店门口。小夏把最后一本书放回架上，抬头看了看窗外的天色。",
    "手机轻轻亮起。她想了一会儿，慢慢打下一行字：今天找到一本很有意思的书<sep/>等你有空，想听听你的看法",
    "雨声渐渐清晰起来。两个人隔着屏幕聊起今天的小事，故事就在这些平常的片刻中继续。",
  ];
  stories.forEach(([world, name], index) => {
    const id = `demo-${index}`;
    db.prepare("INSERT INTO interlude_story VALUES (?,?,?,?,?)").run(
      id,
      "active",
      JSON.stringify({
        character: { name, profile: "演示人物，喜欢阅读与散步。" },
        world,
        location: "街角书店",
      }),
      time,
      time + index,
    );
    for (let i = 0; i < 35; i++)
      db.prepare("INSERT INTO interlude_script_entry VALUES (?,?,?,?,?,?)").run(
        index * 100 + i,
        id,
        "script",
        "narrator",
        texts[i % texts.length] + `\n\n第 ${i + 1} 段 · 演示故事`,
        time + i * 60000,
      );
  });
  db.close();
  const profile = path.join(root, "profile");
  fs.mkdirSync(profile);
  fs.writeFileSync(
    path.join(profile, "settings.json"),
    JSON.stringify(config, null, 2),
  );
  return { config, profile };
}
module.exports = { createDemo };
