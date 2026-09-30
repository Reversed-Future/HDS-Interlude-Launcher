const fs = require("node:fs");
const path = require("node:path");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { captureLines } = require("../logs.cjs");
const execute = promisify(execFile);

async function runtime() {
  const locate = async (name) => {
    const { stdout } = await execute("where.exe", [name], {
      windowsHide: true,
      timeout: 10000,
    });
    return stdout.trim().split(/\r?\n/)[0];
  };
  try {
    const node = await locate("node.exe");
    const npm = await locate("npm.cmd");
    // npm.cmd's official layout: read during implementation; do not send user paths to cmd.exe.
    const cli = path.join(
      path.dirname(npm),
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    );
    if (!fs.existsSync(cli)) throw new Error("npm-cli.js 不存在");
    const { stdout } = await execute(node, ["--version"], {
      windowsHide: true,
      timeout: 10000,
    });
    if (!require("semver").satisfies(stdout.trim(), ">=22"))
      throw new Error("当前 Node.js 低于教程要求的 22 版本。");
    return { node, cli, version: stdout.trim() };
  } catch (error) {
    throw new Error(
      "未找到完整的 Node.js / npm。请安装 Node.js LTS 后重启启动器。" +
        error.message,
    );
  }
}

async function runNpm(args, cwd, log, options = {}) {
  const { node, cli } = await runtime();
  log("命令：npm " + args.map((arg) => JSON.stringify(arg)).join(" "));
  log("工作目录：" + cwd);
  return new Promise((resolve, reject) => {
    const child = spawn(node, [cli, ...args], {
      cwd,
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NO_COLOR: "1",
        FORCE_COLOR: "0",
        npm_config_update_notifier: "false",
      },
    });
    let output = "";
    captureLines(child.stdout, "utf-8", (line) => {
      output = (output + line + "\n").slice(-2 * 1024 * 1024);
      log(line);
    });
    captureLines(child.stderr, "utf-8", log);
    const timer = options.timeout
      ? setTimeout(() => child.kill(), options.timeout)
      : null;
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      code === 0
        ? resolve(output)
        : reject(
            new Error(`npm 退出代码：${code}。请查看安装日志，修复后重试。`),
          );
    });
  });
}
module.exports = { runtime, runNpm };
