const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { PassThrough } = require("node:stream");
const { DatabaseSync } = require("node:sqlite");
const { defaults, ConfigStore, validateUrl } = require("../src/config.cjs");
const { LogStore, captureLines } = require("../src/logs.cjs");
const { listStories, readEntries } = require("../src/database.cjs");
const { ProcessManager } = require("../src/processes.cjs");

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "interlude-core-"));
// Test artifacts intentionally remain available; no batch deletion is performed.
console.log("测试材料保留于", folder);

test("settings roundtrip preserves literal paths and rejects executable URLs", () => {
  const store = new ConfigStore(path.join(folder, "settings.json"));
  const config = {
    ...defaults,
    koishiDir: "E:\\中文 空格 & 目录",
    koishiUrl: "http://127.0.0.1:5140/path?q=1",
  };
  store.save(config);
  assert.deepEqual(store.load(), config);
  assert.throws(() => validateUrl("javascript:alert(1)"));
  assert.throws(() => validateUrl("file:///C:/Windows"));
  assert.throws(() => validateUrl("http://user:secret@localhost"));
});

test("log streams preserve UTF-8 across chunks and cap retained output", async () => {
  const output = [];
  const stream = new PassThrough();
  captureLines(stream, "utf-8", (line) => output.push(line));
  const text = Buffer.from("中文日志\r\n第二行");
  stream.write(text.subarray(0, 2));
  stream.end(text.subarray(2));
  await new Promise((resolve) => stream.on("end", resolve));
  assert.deepEqual(output, ["中文日志", "第二行"]);
  const logs = new LogStore(2);
  logs.append("koishi", "stdout", "\x1b[32m绿色\x1b[0m");
  assert.equal(logs.get("koishi")[0].text, "绿色");
  logs.append("koishi", "stdout", "two");
  logs.append("koishi", "stdout", "three");
  assert.deepEqual(
    logs.get("koishi").map((row) => row.text),
    ["two", "three"],
  );
});

test("reader uses exact HDS schema, handles quotes literally, reads WAL and never writes", () => {
  const file = path.join(folder, "reader.db");
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode=WAL;
    CREATE TABLE interlude_story(id TEXT PRIMARY KEY,status TEXT,setting TEXT,createdAt INTEGER,updatedAt INTEGER);
    CREATE TABLE interlude_script_entry(id INTEGER PRIMARY KEY,storyId TEXT,kind TEXT,actor TEXT,content TEXT,occurredAt INTEGER);`);
  db.prepare("INSERT INTO interlude_story VALUES (?,?,?,?,?)").run(
    "故事",
    "active",
    JSON.stringify({ character: { name: "测试人物" }, world: "测试世界" }),
    1,
    2,
  );
  const insert = db.prepare(
    "INSERT INTO interlude_script_entry VALUES (?,?,?,?,?,?)",
  );
  for (let i = 1; i <= 35; i++)
    insert.run(
      i,
      "故事",
      "script",
      "narrator",
      i === 1 ? "百分比% 和引号'" : `正文${i}`,
      i,
    );
  insert.run(36, "故事", "user-message", "user", "对话", 36);
  const before = fs.readFileSync(file);
  const wal = fs.readFileSync(file + "-wal");
  assert.equal(listStories(file)[0].scriptCount, 35);
  assert.equal(listStories(file)[0].name, "测试人物");
  assert.equal(
    readEntries(file, { storyId: "故事", mode: "script" }).entries.length,
    30,
  );
  assert.equal(
    readEntries(file, { storyId: "故事", mode: "script", offset: 30 }).entries
      .length,
    5,
  );
  assert.equal(readEntries(file, { storyId: "故事", mode: "all" }).total, 36);
  assert.equal(
    readEntries(file, { storyId: "故事", mode: "all", query: "%" }).total,
    1,
  );
  assert.equal(
    readEntries(file, { storyId: "' OR 1=1 --", mode: "all" }).total,
    0,
  );
  assert.throws(() =>
    readEntries(file, { storyId: "故事", mode: "all", offset: -1 }),
  );
  assert.deepEqual(fs.readFileSync(file), before);
  assert.deepEqual(fs.readFileSync(file + "-wal"), wal);
  db.close();
});

test("reader reports incompatible schemas rather than inferring table names", () => {
  const file = path.join(folder, "incompatible.db");
  const db = new DatabaseSync(file);
  db.exec("CREATE TABLE unrelated(id INTEGER)");
  db.close();
  assert.throws(() => listStories(file), /数据库结构不兼容/);
});

test(
  "Windows runner executes npm and bat in exact directories, blocks duplicate starts and stops descendants",
  { skip: process.platform !== "win32", timeout: 30000 },
  async () => {
    const work = path.join(folder, "中文 & spaced");
    fs.mkdirSync(work);
    const fixture = `const fs=require('fs'); const {spawn}=require('child_process'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); fs.writeFileSync('child.pid',String(child.pid)); console.log('中文就绪 '+process.cwd()); console.error('stderr captured'); setInterval(()=>console.log('tick'),100);`;
    fs.writeFileSync(path.join(work, "fixture.cjs"), fixture);
    fs.writeFileSync(
      path.join(work, "package.json"),
      JSON.stringify({ scripts: { start: "node fixture.cjs" } }),
    );
    fs.writeFileSync(
      path.join(work, "launcher.bat"),
      "@echo off\r\nnode fixture.cjs\r\npause\r\n",
    );
    const config = { ...defaults, koishiDir: work, snowlumaDir: work };
    const logs = new LogStore();
    const manager = new ProcessManager(logs);
    try {
      for (const id of ["koishi", "snowluma"]) {
        await manager.start(id, config);
        const pid = manager.states[id].pid;
        await manager.start(id, config);
        assert.equal(manager.states[id].pid, pid);
        const end = Date.now() + 7000;
        while (
          (!logs.get(id).some((row) => row.text.includes("中文就绪")) ||
            !logs
              .get(id)
              .some((row) => row.text.includes("stderr captured"))) &&
          Date.now() < end
        )
          await new Promise((resolve) => setTimeout(resolve, 100));
        assert.ok(logs.get(id).some((row) => row.text.includes(work)));
        assert.ok(
          logs.get(id).some((row) => row.text.includes("stderr captured")),
        );
        const descendant = Number(
          fs.readFileSync(path.join(work, "child.pid"), "utf8"),
        );
        await manager.stop(id);
        assert.equal(manager.children.size, 0);
        assert.throws(() => process.kill(descendant, 0));
      }
      await assert.rejects(() =>
        manager.start("koishi", {
          ...config,
          koishiDir: path.join(folder, "missing"),
        }),
      );
      assert.equal(manager.states.koishi.phase, "error");
    } finally {
      await manager.stopAll();
    }
  },
);
