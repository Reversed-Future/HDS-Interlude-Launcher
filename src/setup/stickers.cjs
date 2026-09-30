const fs = require("node:fs");
const path = require("node:path");

function stickerDirectory(koishiDir) {
  if (typeof koishiDir !== "string" || !path.isAbsolute(koishiDir))
    throw new Error("请先在设置中选择 Koishi 的完整目录。");
  if (
    !fs.statSync(koishiDir).isDirectory() ||
    !fs.existsSync(path.join(koishiDir, "package.json"))
  )
    throw new Error("所选目录不是 Koishi 项目目录，请检查设置。");
  const directory = path.join(koishiDir, "data", "hds-interlude", "stickers");
  const exists = fs.existsSync(directory);
  if (exists && !fs.statSync(directory).isDirectory())
    throw new Error("表情包目录路径已被同名文件占用：" + directory);
  return { directory, exists };
}

function createStickerDirectory(koishiDir) {
  const status = stickerDirectory(koishiDir);
  fs.mkdirSync(status.directory, { recursive: true });
  return { ...status, exists: true };
}

module.exports = { stickerDirectory, createStickerDirectory };
