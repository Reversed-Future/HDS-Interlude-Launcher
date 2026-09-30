const fs = require("node:fs");
const path = require("node:path");
const yauzl = require("yauzl");
const { pipeline } = require("node:stream/promises");

function validateEntry(root, entry) {
  const name = entry.fileName;
  if (
    name.includes("\\") ||
    name.includes(":") ||
    name.split("/").some((part) => part === ".." || /[. ]$/.test(part))
  )
    throw new Error("压缩包包含不安全的路径。");
  const target = path.resolve(root, name);
  if (!target.startsWith(path.resolve(root) + path.sep))
    throw new Error("压缩包路径越界。");
  if (((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000)
    throw new Error("不支持压缩包中的符号链接。");
  return target;
}
async function extractSnow(file, target, log) {
  if (path.extname(file) !== ".zip")
    throw new Error("请选择 SnowLuma Windows 完整版 ZIP。");
  if (!path.isAbsolute(target) || fs.existsSync(target))
    throw new Error("请选择一个尚不存在的新安装目录。已有目录不会被覆盖。");
  // yauzl's documented Windows ZIP handling normalizes separators before traversal validation.
  const zip = await yauzl.openPromise(file, { strictFileNames: false });
  const launchers = [];
  let total = 0,
    count = 0;
  try {
    fs.mkdirSync(target);
    for await (const entry of zip.eachEntry()) {
      const destination = validateEntry(target, entry);
      total += entry.uncompressedSize;
      if (++count > 100000 || total > 4 * 1024 ** 3)
        throw new Error("ZIP 解压体积超过限制。");
      if (entry.fileName.endsWith("/")) {
        fs.mkdirSync(destination, { recursive: true });
        continue;
      }
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      await pipeline(
        await zip.openReadStreamPromise(entry),
        fs.createWriteStream(destination, { flags: "wx" }),
      );
      if (path.basename(destination) === "launcher.bat")
        launchers.push(path.dirname(destination));
      if (count % 200 === 0) log(`已解压 ${count} 个文件`);
    }
  } finally {
    zip.close();
  }
  if (launchers.length !== 1)
    throw new Error(
      `解压完成，但找到 ${launchers.length} 个 launcher.bat。请在设置中手动选择实际目录：${target}`,
    );
  log("解压完成：" + launchers[0]);
  return launchers[0];
}
module.exports = { extractSnow, validateEntry };
