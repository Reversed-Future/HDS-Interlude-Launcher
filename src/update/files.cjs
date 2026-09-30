// Electron treats .asar paths as virtual directories; extraction must write raw files.
const fs = process.versions.electron
  ? require("original-fs")
  : require("node:fs");
const path = require("node:path");
const yauzl = require("yauzl");
const { pipeline } = require("node:stream/promises");
const { validateEntry } = require("../setup/archives.cjs");
const { executable } = require("./config.cjs");
function verifyInstalled(directory, version) {
  const metadata = JSON.parse(
    fs.readFileSync(
      path.join(directory, "resources", "app", "package.json"),
      "utf8",
    ),
  );
  if (
    metadata.name !== "interlude-launcher" ||
    metadata.version !== version ||
    metadata.productName !== "HDS-Interlude Launcher"
  )
    throw new Error("更新包中的程序信息不匹配。");
  for (const file of [
    executable,
    "resources/app/src/main.cjs",
    "resources/app/src/preload.cjs",
    "resources/app/ui/index.html",
  ])
    if (!fs.statSync(path.join(directory, file)).isFile())
      throw new Error("更新包缺少程序文件。");
  return path.join(directory, executable);
}
async function extractUpdate(file, directory, version) {
  if (fs.existsSync(directory))
    throw new Error("更新目录已存在，旧文件不会被覆盖。");
  fs.mkdirSync(directory, { recursive: true });
  const zip = await yauzl.openPromise(file, { strictFileNames: false });
  let count = 0,
    size = 0;
  try {
    for await (const entry of zip.eachEntry()) {
      const target = validateEntry(directory, entry);
      size += entry.uncompressedSize;
      if (++count > 100000 || size > 2 * 1024 ** 3)
        throw new Error("更新包解压大小超过限制。");
      if (entry.fileName.endsWith("/")) {
        fs.mkdirSync(target, { recursive: true });
        continue;
      }
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await pipeline(
        await zip.openReadStreamPromise(entry),
        fs.createWriteStream(target, { flags: "wx" }),
      );
    }
  } finally {
    zip.close();
  }
  return verifyInstalled(directory, version);
}
module.exports = { extractUpdate, verifyInstalled };
