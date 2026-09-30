const { DatabaseSync } = require("node:sqlite");
const fs = require("node:fs");

// Exact schema read from the user's koishi.db. No name inference or column remapping.
const schema = {
  interlude_story: ["id", "status", "setting", "createdAt", "updatedAt"],
  interlude_script_entry: [
    "id",
    "storyId",
    "kind",
    "actor",
    "content",
    "occurredAt",
  ],
};
function openDatabase(file) {
  if (!file || !fs.existsSync(file))
    throw new Error("请在设置中选择存在的 koishi.db 文件。");
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    db.exec("PRAGMA query_only = ON; PRAGMA busy_timeout = 2000;");
    for (const [table, columns] of Object.entries(schema)) {
      const actual = db
        .prepare(`PRAGMA table_info("${table}")`)
        .all()
        .map((row) => row.name);
      const missing = columns.filter((column) => !actual.includes(column));
      if (missing.length)
        throw new Error(
          `数据库结构不兼容：${table} 缺少 ${missing.join("、")}。请提供实际表结构。`,
        );
    }
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
function useDatabase(file, action) {
  const db = openDatabase(file);
  try {
    return action(db);
  } finally {
    db.close();
  }
}
function parseSetting(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
function listStories(file) {
  return useDatabase(file, (db) =>
    db
      .prepare(
        `SELECT s.id, s.status, s.setting, s.createdAt, s.updatedAt,
    (SELECT COUNT(*) FROM interlude_script_entry e WHERE e.storyId=s.id AND e.kind='script') AS scriptCount,
    (SELECT COUNT(*) FROM interlude_script_entry e WHERE e.storyId=s.id) AS entryCount
    FROM interlude_story s ORDER BY s.updatedAt DESC, s.id ASC`,
      )
      .all()
      .map((row) => {
        const setting = parseSetting(row.setting);
        return {
          ...row,
          setting,
          name:
            typeof setting?.character?.name === "string"
              ? setting.character.name
              : row.id,
        };
      }),
  );
}
function readEntries(file, options) {
  if (!options || typeof options.storyId !== "string")
    throw new Error("请选择剧本。");
  const { storyId, mode, query = "", offset = 0 } = options;
  if (
    !["script", "all"].includes(mode) ||
    !Number.isSafeInteger(offset) ||
    offset < 0 ||
    typeof query !== "string" ||
    query.length > 500
  )
    throw new Error("阅读参数不正确。");
  return useDatabase(file, (db) => {
    const conditions = ["storyId = ?"];
    const args = [storyId];
    if (mode === "script") {
      conditions.push("kind = ?");
      args.push("script");
    }
    if (query) {
      conditions.push("instr(content, ?) > 0");
      args.push(query);
    }
    const where = conditions.join(" AND ");
    const total = db
      .prepare(
        `SELECT COUNT(*) AS total FROM interlude_script_entry WHERE ${where}`,
      )
      .get(...args).total;
    const entries = db
      .prepare(
        `SELECT id,storyId,kind,actor,content,occurredAt FROM interlude_script_entry WHERE ${where} ORDER BY occurredAt ASC,id ASC LIMIT 30 OFFSET ?`,
      )
      .all(...args, offset);
    return { total, entries, offset, pageSize: 30 };
  });
}
module.exports = { openDatabase, listStories, readEntries };
