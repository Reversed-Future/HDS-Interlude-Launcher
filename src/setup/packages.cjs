const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const tar = require("tar");
const semver = require("semver");
const NAME = "koishi-plugin-hds-interlude";

async function digest(file) {
  const hash = crypto.createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
function installedVersion(dir) {
  const file = path.join(dir, "node_modules", NAME, "package.json");
  if (!fs.existsSync(file)) return null;
  const pkg = JSON.parse(fs.readFileSync(file, "utf8"));
  if (pkg.name !== NAME || !semver.valid(pkg.version))
    throw new Error("已安装插件的 package.json 名称或版本不正确。");
  return pkg.version;
}
function comparison(installed, version) {
  if (!installed) return "尚未安装";
  return semver.eq(installed, version)
    ? "版本一致"
    : semver.gt(version, installed)
      ? "有新版本"
      : "所选版本较旧";
}
async function inspectPackage(file) {
  if (
    typeof file !== "string" ||
    !path.isAbsolute(file) ||
    path.extname(file) !== ".tgz"
  )
    throw new Error("请选择 .tgz 安装包的完整路径。");
  const stat = fs.statSync(file);
  if (!stat.isFile() || stat.size > 512 * 1024 * 1024)
    throw new Error("安装包无效或超过 512 MB。");
  let metadata = null;
  let count = 0;
  let total = 0;
  let failure = null;
  await tar.t({
    file,
    strict: true,
    onReadEntry(entry) {
      total += entry.size;
      if (++count > 100000 || total > 1024 * 1024 * 1024)
        failure = new Error("安装包解压体积过大。");
      if (entry.path === "package/package.json") {
        if (
          metadata !== null ||
          entry.size > 1024 * 1024 ||
          entry.type !== "File"
        ) {
          failure = new Error("安装包内的 package/package.json 无效。");
          entry.resume();
          return;
        }
        metadata = [];
        entry.on("data", (chunk) => {
          metadata.push(Buffer.from(chunk));
        });
      }
    },
  });
  if (failure) throw failure;
  if (metadata === null) throw new Error("安装包缺少 package/package.json。");
  const pkg = JSON.parse(Buffer.concat(metadata).toString("utf8"));
  if (pkg.name !== NAME)
    throw new Error(`包名必须为 ${NAME}，当前为 ${pkg.name || "未定义"}。`);
  if (!semver.valid(pkg.version))
    throw new Error("插件版本不符合 npm 版本格式。");
  return {
    file,
    name: pkg.name,
    version: pkg.version,
    size: stat.size,
    sha256: await digest(file),
  };
}
function backupProject(dir) {
  const destination = path.join(
    dir,
    ".hds-launcher-backups",
    new Date().toISOString().replaceAll(":", "-") + "-" + crypto.randomUUID(),
  );
  fs.mkdirSync(destination, { recursive: true });
  for (const name of [
    "package.json",
    "package-lock.json",
    "npm-shrinkwrap.json",
    "yarn.lock",
    "koishi.yml",
    "koishi.yml.bak",
  ]) {
    const source = path.join(dir, name);
    if (fs.existsSync(source))
      fs.copyFileSync(
        source,
        path.join(destination, name),
        fs.constants.COPYFILE_EXCL,
      );
  }
  return destination;
}
module.exports = {
  NAME,
  digest,
  inspectPackage,
  installedVersion,
  comparison,
  backupProject,
};
