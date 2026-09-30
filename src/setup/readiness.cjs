const fs = require("node:fs");
const path = require("node:path");
const semver = require("semver");
const { NAME } = require("./packages.cjs");
function isFile(file) {
  try {
    return path.isAbsolute(file) && fs.statSync(file).isFile();
  } catch {
    return false;
  }
}
function installedPackage(dir, name) {
  try {
    if (!path.isAbsolute(dir)) return false;
    const pkg = JSON.parse(
      fs.readFileSync(
        path.join(dir, "node_modules", name, "package.json"),
        "utf8",
      ),
    );
    return pkg.name === name && !!semver.valid(pkg.version);
  } catch {
    return false;
  }
}
function checkInstallation(config, node, basePackages) {
  let koishi = false;
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(config.koishiDir, "package.json"), "utf8"),
    );
    koishi =
      typeof pkg.scripts?.start === "string" &&
      !!pkg.scripts.start.trim() &&
      installedPackage(config.koishiDir, "koishi");
  } catch {
    /* Missing or incomplete project is reported below. */
  }
  const consoleMissing = basePackages.filter(
    (name) => !installedPackage(config.koishiDir, name),
  );
  const checks = [
    {
      id: "node",
      label: "Node.js / npm",
      ready: !node.error,
      detail: node.error || node.version,
    },
    {
      id: "qq",
      label: "QQ",
      ready: isFile(config.qqExe),
      detail: "安装后在设置中选择 QQ.exe。",
    },
    {
      id: "snowluma",
      label: "SnowLuma",
      ready: ["launcher.bat", "index.mjs", "check-node-version.cjs"].every(
        (file) => isFile(path.join(config.snowlumaDir, file)),
      ),
      detail: "需要完整的程序文件和已保存的目录。",
    },
    {
      id: "koishi",
      label: "Koishi",
      ready: koishi,
      detail: "需要可启动的项目和已安装的 koishi 依赖。",
    },
    {
      id: "console",
      label: "Console 管理模块",
      ready: !consoleMissing.length,
      detail: consoleMissing.join("、"),
    },
    {
      id: "onebot",
      label: "OneBot 适配器",
      ready: installedPackage(config.koishiDir, "koishi-plugin-adapter-onebot"),
      detail: "koishi-plugin-adapter-onebot",
    },
    {
      id: "sqlite",
      label: "SQLite 数据库模块",
      ready: installedPackage(
        config.koishiDir,
        "@koishijs/plugin-database-sqlite",
      ),
      detail: "@koishijs/plugin-database-sqlite",
    },
    {
      id: "hdsi",
      label: "HDSI 插件",
      ready: installedPackage(config.koishiDir, NAME),
      detail: NAME,
    },
  ];
  return {
    ready: checks.every((item) => item.ready),
    checks,
    missing: checks.filter((item) => !item.ready),
  };
}
module.exports = { checkInstallation, installedPackage };
