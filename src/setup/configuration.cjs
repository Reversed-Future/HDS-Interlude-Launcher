const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const YAML = require("yaml");
const { backupProject } = require("./packages.cjs");
const { createStickerDirectory } = require("./stickers.cjs");
function validateYaml(text) {
  if (typeof text !== "string" || text.length > 1024 * 1024)
    throw new Error("配置文本无效或过大。");
  const doc = YAML.parseDocument(text, { uniqueKeys: true });
  if (doc.errors.length)
    throw new Error("YAML 格式错误：" + doc.errors[0].message);
  const data = doc.toJS({ maxAliasCount: 100 });
  if (!data?.plugins?.["group:hdsi"]?.["hds-interlude"])
    throw new Error(
      "配置缺少教程定义的 plugins → group:hdsi → hds-interlude。",
    );
  const providers =
    data.plugins["group:hdsi"]["hds-interlude"].model?.providers;
  if (Array.isArray(providers)) {
    for (const provider of providers) {
      if (
        provider?.useForEmbedding === true &&
        [
          "useForMain",
          "useForCompaction",
          "useForAlter",
          "useForStickers",
          "useForVision",
        ].some((key) => provider[key] === true)
      )
        throw new Error(
          "Embedding 连接只能用于向量功能，不能同时承担其他用途。",
        );
    }
  }
  return data;
}
function writeConfiguration(dir, text) {
  const config = validateYaml(text);
  if (!fs.statSync(dir).isDirectory()) throw new Error("Koishi 目录不存在。");
  const backup = backupProject(dir);
  const target = path.join(dir, "koishi.yml");
  const bak = fs.existsSync(target) ? target + ".bak" : null;
  const temporary = target + "." + crypto.randomUUID() + ".tmp";
  fs.writeFileSync(temporary, text, { encoding: "utf8", flag: "wx" });
  let stickers = null;
  if (config.plugins["group:hdsi"]["hds-interlude"].stickers?.enabled === true)
    stickers = createStickerDirectory(dir).directory;
  if (bak) {
    const temporaryBackup = bak + "." + crypto.randomUUID() + ".tmp";
    fs.copyFileSync(target, temporaryBackup, fs.constants.COPYFILE_EXCL);
    fs.renameSync(temporaryBackup, bak);
  }
  fs.renameSync(temporary, target);
  return { target, backup, bak, stickers };
}
module.exports = { validateYaml, writeConfiguration };
