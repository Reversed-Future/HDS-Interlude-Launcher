const fs = require("node:fs");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { installedPackage } = require("./setup/readiness.cjs");
const execute = promisify(execFile);
const file = (p) => {
  try {
    return path.isAbsolute(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
};
async function detectQQ() {
  if (process.platform !== "win32") return [];
  const script =
    "[Console]::OutputEncoding = [Text.Encoding]::UTF8; $running = @(Get-CimInstance Win32_Process -Filter \"Name = 'QQ.exe'\" -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ExecutablePath); $icons = @(Get-ChildItem -Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall','HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall' -ErrorAction SilentlyContinue | Get-ItemProperty -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName -eq 'QQ' } | Select-Object -ExpandProperty DisplayIcon); @{running=$running;icons=$icons} | ConvertTo-Json -Compress";
  const env = { ...process.env };
  delete env.PSModulePath;
  const { stdout } = await execute(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, timeout: 20000, env },
  );
  const data = JSON.parse(stdout);
  return [
    ...new Set([
      ...data.running,
      ...data.icons.map((icon) =>
        typeof icon === "string"
          ? icon.replace(/,[-\d]+$/, "").replace(/^"(.*)"$/, "$1")
          : "",
      ),
    ]),
  ].filter(
    (p) => typeof p === "string" && path.basename(p) === "QQ.exe" && file(p),
  );
}
function scanPrograms(roots) {
  const result = { koishiDir: [], snowlumaDir: [], databasePath: [] };
  const seen = new Set();
  let inspected = 0;
  function visit(dir, depth) {
    if (!path.isAbsolute(dir) || seen.has(dir) || inspected++ >= 400) return;
    seen.add(dir);
    if (installedPackage(dir, "koishi")) {
      try {
        const pkg = JSON.parse(
          fs.readFileSync(path.join(dir, "package.json"), "utf8"),
        );
        if (typeof pkg.scripts?.start === "string") result.koishiDir.push(dir);
      } catch {
        /* Not a Koishi project root. */
      }
    }
    if (
      ["launcher.bat", "index.mjs", "check-node-version.cjs"].every((name) =>
        file(path.join(dir, name)),
      )
    )
      result.snowlumaDir.push(dir);
    const db = path.join(dir, "data", "koishi.db");
    if (result.koishiDir.includes(dir) && file(db))
      result.databasePath.push(db);
    if (
      depth === 0 ||
      result.koishiDir.includes(dir) ||
      result.snowlumaDir.includes(dir)
    )
      return;
    try {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (
          entry.isDirectory() &&
          !entry.isSymbolicLink() &&
          ![
            "node_modules",
            ".git",
            "data",
            "logs",
            "release",
            "test-results",
          ].includes(entry.name)
        )
          visit(path.join(dir, entry.name), depth - 1);
      }
    } catch {
      /* Inaccessible directories are not searched. */
    }
  }
  roots.forEach((root) => visit(root, 2));
  return result;
}
async function discover(config, roots, qq = detectQQ) {
  let qqExe = [],
    qqError = "";
  try {
    qqExe = await qq();
  } catch (error) {
    qqError = "QQ 自动检测未完成，可手动选择 QQ.exe。";
  }
  return { ...scanPrograms(roots), qqExe, qqError };
}
module.exports = { detectQQ, scanPrograms, discover };
