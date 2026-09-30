const { execFile, spawn } = require("node:child_process");
const { promisify } = require("node:util");
const { captureLines } = require("../logs.cjs");
const { runtime } = require("./runner.cjs");
const execute = promisify(execFile);
const inheritedPath = process.env.Path || "";
const WINGET_ARGS = [
  "install",
  "-e",
  "--id",
  "OpenJS.NodeJS.LTS",
  "--accept-package-agreements",
  "--accept-source-agreements",
  "--disable-interactivity",
];
async function runWinget(args, log) {
  let executable;
  try {
    const { stdout } = await execute("where.exe", ["winget.exe"], {
      windowsHide: true,
      timeout: 10000,
    });
    executable = stdout.trim().split(/\r?\n/)[0];
  } catch {
    throw new Error("未找到 winget。请通过下方 Node.js 官网下载 MSI 安装包。");
  }
  log("命令：winget " + args.join(" "));
  log("安装过程可能显示 Windows 权限确认或安装窗口，请完成提示。");
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    captureLines(child.stdout, "utf-8", log);
    captureLines(child.stderr, "utf-8", log);
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              `winget 退出代码：${code}。请查看日志；若提示已安装，可点击“刷新环境并检测”。`,
            ),
          ),
    );
  });
}
async function refreshPath() {
  const { stdout } = await execute(
    "powershell.exe",
    [
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "[Console]::OutputEncoding = [Text.Encoding]::UTF8; $p = @([Environment]::GetEnvironmentVariable('Path', 'Machine'), [Environment]::GetEnvironmentVariable('Path', 'User')) -join ';'; [Console]::Write([Environment]::ExpandEnvironmentVariables($p))",
    ],
    { windowsHide: true, timeout: 15000 },
  );
  const refreshed = stdout.trim();
  if (!refreshed || refreshed === ";")
    throw new Error("系统 PATH 读取失败，请重新打开启动器。");
  // Windows environment names are case-insensitive; this is the observed Path key.
  process.env.Path = refreshed + ";" + inheritedPath;
}
async function installNode(setup, options = {}) {
  const command = options.command || runWinget;
  const refresh = options.refresh || refreshPath;
  const inspect = options.inspect || runtime;
  return setup.job("安装 Node.js LTS", async () => {
    await command(WINGET_ARGS, (line) => setup.log(line));
    try {
      await refresh();
      const node = await inspect();
      setup.log(
        `环境已刷新：${node.version}，Node.js 与 npm 可用，可以继续安装 Koishi。`,
      );
      return { ready: true, node };
    } catch (error) {
      setup.log("Node.js 安装命令已完成，但自动检测未通过：" + error.message);
      setup.log(
        "请关闭并重新打开启动器后检测；只有安装器明确要求时才需要重启电脑。",
      );
      return { ready: false };
    }
  });
}
module.exports = { installNode, refreshPath, WINGET_ARGS };
