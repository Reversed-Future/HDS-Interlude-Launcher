const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const { spawn, execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { EventEmitter } = require("node:events");
const { captureLines } = require("./logs.cjs");
const execFileAsync = promisify(execFile);
const serviceIds = ["koishi", "snowluma", "qq"];

function assertService(id) {
  if (!serviceIds.includes(id)) throw new Error("未知程序。");
}
function assertPath(value, directory, label) {
  if (!value || !path.isAbsolute(value))
    throw new Error(`请设置 ${label} 的完整路径。`);
  let stat;
  try {
    stat = fs.statSync(value);
  } catch {
    throw new Error(`${label} 不存在：${value}`);
  }
  if (directory ? !stat.isDirectory() : !stat.isFile())
    throw new Error(`${label} 路径类型不正确。`);
}
async function validateLaunch(id, config) {
  assertService(id);
  if (id === "koishi") {
    assertPath(config.koishiDir, true, "Koishi 目录");
    const pkg = JSON.parse(
      fs.readFileSync(path.join(config.koishiDir, "package.json"), "utf8"),
    );
    if (!pkg.scripts || typeof pkg.scripts.start !== "string")
      throw new Error("Koishi package.json 未定义 scripts.start。");
    try {
      await execFileAsync("where.exe", ["npm.cmd"], { windowsHide: true });
    } catch {
      throw new Error("未找到 npm.cmd，请安装 Node.js 并重启启动器。");
    }
  } else if (id === "snowluma") {
    assertPath(config.snowlumaDir, true, "SnowLuma 目录");
    assertPath(
      path.join(config.snowlumaDir, "launcher.bat"),
      false,
      "launcher.bat",
    );
  } else {
    assertPath(config.qqExe, false, "QQ 可执行文件");
    if (path.extname(config.qqExe) !== ".exe")
      throw new Error("请选择实际的 QQ 可执行文件（.exe）。");
  }
}

function portInUse(address) {
  if (!address) return Promise.resolve(false);
  const url = new URL(address);
  // Only preflight loopback services; a remote WebUI is independent of this machine.
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))
    return Promise.resolve(false);
  return new Promise((resolve) => {
    const socket = net.createConnection({
      host: url.hostname === "[::1]" ? "::1" : url.hostname,
      port: Number(url.port || (url.protocol === "https:" ? 443 : 80)),
    });
    const done = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
    socket.setTimeout(600, () => done(false));
  });
}

async function qqAlreadyRunning(exe) {
  const script =
    "@(Get-CimInstance Win32_Process -Filter \"Name = 'QQ.exe'\" | Where-Object { $_.ExecutablePath -ceq $env:INTERLUDE_QQ_EXE }).Count";
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    {
      windowsHide: true,
      timeout: 10000,
      env: { ...process.env, INTERLUDE_QQ_EXE: exe },
    },
  );
  return Number(stdout.trim()) > 0;
}

class ProcessManager extends EventEmitter {
  constructor(logs) {
    super();
    this.logs = logs;
    this.children = new Map();
    this.busy = new Set();
    this.batchStarting = false;
    this.states = Object.fromEntries(
      serviceIds.map((id) => [
        id,
        { phase: "stopped", pid: null, since: null, message: "" },
      ]),
    );
  }
  snapshot() {
    return structuredClone(this.states);
  }
  state(id, value) {
    this.states[id] = { ...this.states[id], ...value };
    this.emit("state", this.snapshot());
  }
  log(id, stream, text) {
    const row = this.logs.append(id, stream, text);
    if (row) this.emit("log", { service: id, entry: row });
  }
  async preflight(id, config) {
    await validateLaunch(id, config);
    const url =
      id === "koishi"
        ? config.koishiUrl
        : id === "snowluma"
          ? config.snowlumaUrl
          : "";
    if (await portInUse(url))
      throw new Error(
        `${id} 的 WebUI 端口已被占用。请先确认已有进程；可直接在 WebUI 中访问。`,
      );
  }
  async start(id, config) {
    assertService(id);
    if (this.busy.has(id) || this.children.has(id)) return this.snapshot();
    this.busy.add(id);
    this.state(id, { phase: "starting", message: "", pid: null });
    try {
      await this.preflight(id, config);
      if (id === "qq" && (await qqAlreadyRunning(config.qqExe))) {
        this.state(id, {
          phase: "opened",
          message: "QQ 已在运行",
          since: Date.now(),
        });
        return this.snapshot();
      }
      const cwd =
        id === "koishi"
          ? config.koishiDir
          : id === "snowluma"
            ? config.snowlumaDir
            : path.dirname(config.qqExe);
      // Only these constant commands enter cmd.exe. Paths are passed through cwd, never shell interpolation.
      const command = id === "koishi" ? "npm run start" : "launcher.bat";
      const child =
        id === "qq"
          ? spawn(config.qqExe, [], {
              cwd,
              shell: false,
              detached: true,
              stdio: "ignore",
              windowsHide: false,
            })
          : spawn("cmd.exe", ["/d", "/s", "/c", command], {
              cwd,
              shell: false,
              windowsHide: true,
              stdio: ["ignore", "pipe", "pipe"],
              env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
            });
      if (id !== "qq") {
        this.children.set(id, child);
        this.log(id, "system", `工作目录：${cwd}\n启动命令：${command}`);
        captureLines(child.stdout, config.logEncoding, (line) =>
          this.log(id, "stdout", line),
        );
        captureLines(child.stderr, config.logEncoding, (line) =>
          this.log(id, "stderr", line),
        );
        child.once("exit", (code, signal) => {
          this.children.delete(id);
          const stopping = this.states[id].phase === "stopping";
          this.state(id, {
            phase: stopping || code === 0 ? "stopped" : "error",
            pid: null,
            since: null,
            message: stopping ? "已停止" : `进程已退出（${code ?? signal}）`,
          });
          this.log(id, "system", `进程已退出（${code ?? signal}）`);
        });
      }
      await new Promise((resolve, reject) => {
        child.once("spawn", resolve);
        child.once("error", reject);
      });
      if (id === "qq") {
        child.unref();
        this.state(id, {
          phase: "opened",
          since: Date.now(),
          message: "已发送启动请求",
        });
      } else
        this.state(id, {
          phase: "running",
          pid: child.pid,
          since: Date.now(),
          message: "进程运行中；服务就绪状态请查看日志",
        });
      return this.snapshot();
    } catch (error) {
      this.children.delete(id);
      this.state(id, { phase: "error", message: error.message, pid: null });
      this.log(id, "system", error.message);
      throw error;
    } finally {
      this.busy.delete(id);
    }
  }
  async startAll(config) {
    if (this.batchStarting) throw new Error("一键启动正在进行，请稍候。");
    this.batchStarting = true;
    try {
      // Validate all paths before launching any program; errors remain independently visible.
      for (const id of serviceIds) await validateLaunch(id, config);
      const errors = [];
      for (const id of ["qq", "snowluma", "koishi"]) {
        try {
          await this.start(id, config);
        } catch (error) {
          errors.push(error.message);
        }
      }
      if (errors.length) throw new Error(errors.join("\n"));
      return this.snapshot();
    } finally {
      this.batchStarting = false;
    }
  }
  async stop(id) {
    if (!["koishi", "snowluma"].includes(id))
      throw new Error("QQ 请在其自身窗口中退出。");
    if (this.busy.has(id))
      throw new Error("程序正在处理上一个操作，请稍后重试。");
    const child = this.children.get(id);
    if (!child) return this.snapshot();
    this.busy.add(id);
    this.state(id, { phase: "stopping" });
    try {
      // Limit termination to the process tree started and still owned by this launcher.
      await execFileAsync(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true, timeout: 12000 },
      );
      await new Promise((resolve, reject) => {
        if (!this.children.has(id)) return resolve();
        const timer = setTimeout(
          () => reject(new Error("等待进程退出超时。")),
          5000,
        );
        child.once("exit", () => {
          clearTimeout(timer);
          resolve();
        });
      });
    } catch (error) {
      if (this.children.has(id)) {
        this.state(id, {
          phase: "error",
          message: "停止失败：" + error.message,
        });
        throw error;
      }
    } finally {
      this.busy.delete(id);
    }
    return this.snapshot();
  }
  async stopAll() {
    if (this.batchStarting) throw new Error("请等待一键启动完成后再停止服务。");
    const results = await Promise.allSettled(
      ["koishi", "snowluma"].map((id) => this.stop(id)),
    );
    const errors = results.filter((item) => item.status === "rejected");
    if (errors.length)
      throw new Error(errors.map((item) => item.reason.message).join("\n"));
    return this.snapshot();
  }
}

module.exports = { ProcessManager, validateLaunch, portInUse };
