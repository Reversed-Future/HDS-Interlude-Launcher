const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { stripVTControlCharacters } = require("node:util");
const semver = require("semver");
const { runNpm, runtime } = require("./runner.cjs");
const {
  NAME,
  inspectPackage,
  installedVersion,
  comparison,
  backupProject,
} = require("./packages.cjs");
const { portInUse } = require("../processes.cjs");
const { extractSnow } = require("./archives.cjs");
const { writeConfiguration } = require("./configuration.cjs");
const { checkInstallation } = require("./readiness.cjs");

// Exact package list in the user's rc28 beginner guide.
const BASE_PACKAGES = [
  "@koishijs/plugin-actions",
  "@koishijs/plugin-analytics",
  "@koishijs/plugin-commands",
  "@koishijs/plugin-config",
  "@koishijs/plugin-console",
  "@koishijs/plugin-explorer",
  "@koishijs/plugin-help",
  "@koishijs/plugin-http",
  "@koishijs/plugin-insight",
  "@koishijs/plugin-locales",
  "@koishijs/plugin-logger",
  "@koishijs/plugin-market",
  "@koishijs/plugin-notifier",
  "@koishijs/plugin-oobe",
  "@koishijs/plugin-proxy-agent",
  "@koishijs/plugin-sandbox",
  "@koishijs/plugin-status",
  "koishi-plugin-dataview",
  "koishi-plugin-rate-limit",
  "koishi-plugin-telemetry",
  "koishi-plugin-theme-vanilla",
];
class SetupService extends EventEmitter {
  constructor(configStore, processes, options = {}) {
    super();
    this.configStore = configStore;
    this.processes = processes;
    this.npm = options.npm || runNpm;
    this.busy = false;
    this.status = { phase: "idle", label: "等待操作" };
    this.lines = [];
    this.plans = new Map();
  }
  snapshot() {
    return { ...this.status, busy: this.busy, lines: this.lines };
  }
  log(text) {
    const line = {
      time: Date.now(),
      text: stripVTControlCharacters(String(text)).slice(0, 16000),
    };
    this.lines.push(line);
    if (this.lines.length > 2500) this.lines.shift();
    this.emit("log", line);
  }
  async job(label, action) {
    if (this.busy || this.processes.busy.size || this.processes.batchStarting)
      throw new Error("请等待当前操作完成。");
    this.busy = true;
    this.status = { phase: "running", label };
    this.emit("state", this.snapshot());
    this.log("—— " + label + " ——");
    try {
      const result = await action();
      this.status = { phase: "success", label: label + "：完成" };
      this.log(this.status.label);
      return result;
    } catch (error) {
      this.status = { phase: "error", label: label + "：失败" };
      this.log(error.message);
      throw error;
    } finally {
      this.busy = false;
      this.emit("state", this.snapshot());
    }
  }
  async assertStopped(config) {
    if (
      this.processes.children.has("koishi") ||
      this.processes.busy.has("koishi")
    )
      throw new Error("请先在启动台停止 Koishi，再执行安装或写入配置。");
    if (await portInUse(config.koishiUrl))
      throw new Error(
        "Koishi 的 WebUI 端口仍在使用。请退出已运行的 Koishi 后重试。",
      );
    const pkg = JSON.parse(
      fs.readFileSync(path.join(config.koishiDir, "package.json"), "utf8"),
    );
    if (typeof pkg.scripts?.start !== "string")
      throw new Error("所选 Koishi 项目未定义 scripts.start。");
  }
  remember(info, config) {
    const installed = installedVersion(config.koishiDir);
    const plan = {
      ...info,
      id: crypto.randomUUID(),
      dir: config.koishiDir,
      installed,
      comparison: comparison(installed, info.version),
    };
    this.plans.clear();
    this.plans.set(plan.id, plan);
    return plan;
  }
  inspect(file) {
    return this.job("校验本地插件包", async () =>
      this.remember(
        { ...(await inspectPackage(file)), source: "tgz" },
        this.configStore.load(),
      ),
    );
  }
  checkBeta() {
    return this.job("检查 npm beta 更新", async () => {
      const config = this.configStore.load();
      const output = await this.npm(
        ["view", NAME, "dist-tags", "--json"],
        config.koishiDir || process.cwd(),
        (line) => this.log(line),
        { timeout: 30000 },
      );
      const tags = JSON.parse(output);
      if (!semver.valid(tags.beta))
        throw new Error("npm 没有返回有效的 beta 标签版本。");
      return this.remember(
        {
          source: "npm",
          version: tags.beta,
          name: NAME,
          checkedAt: Date.now(),
          tags,
        },
        config,
      );
    });
  }
  install(id) {
    return this.job("安装 HDSI 插件", async () => {
      const plan = this.plans.get(id);
      if (!plan) throw new Error("请重新检查更新或导入安装包。");
      const config = this.configStore.load();
      if (
        config.koishiDir !== plan.dir ||
        installedVersion(plan.dir) !== plan.installed
      )
        throw new Error("目标目录或已安装版本已变化，请重新检查。");
      await this.assertStopped(config);
      if (plan.source === "tgz") {
        const current = await inspectPackage(plan.file);
        if (current.sha256 !== plan.sha256)
          throw new Error("安装包已变化，请重新导入。");
      }
      const backup = backupProject(plan.dir);
      this.log("安装前备份：" + backup);
      this.log(
        "保留 data 目录。npm 安装失败时可用上述备份检查配置和依赖变更。",
      );
      // Pin the checked beta version so the reviewed target cannot change during installation.
      const spec =
        plan.source === "tgz" ? plan.file : `${NAME}@${plan.version}`;
      await this.installPrerequisites(plan.dir);
      this.log("步骤 4/4：安装所选 HDSI 插件。");
      await this.npm(["install", "--save-exact", spec], plan.dir, (line) =>
        this.log(line),
      );
      const installed = installedVersion(plan.dir);
      if (installed !== plan.version)
        throw new Error(
          "npm 已退出，但已安装版本与所选版本不一致，请查看日志。",
        );
      this.plans.delete(id);
      this.log("已安装版本：" + installed + "。可回到启动台启动 Koishi。");
      return { installed, backup };
    });
  }
  installDependencies() {
    return this.job("安装 Koishi 基础插件", async () => {
      const config = this.configStore.load();
      await this.assertStopped(config);
      this.log("安装前备份：" + backupProject(config.koishiDir));
      await this.installPrerequisites(config.koishiDir);
      return true;
    });
  }
  async installPrerequisites(dir) {
    const steps = [
      ["补齐完整 Console 管理模块", BASE_PACKAGES],
      ["安装 OneBot 适配器，连接 SnowLuma", ["koishi-plugin-adapter-onebot"]],
      [
        "安装配置向导所需 SQLite 数据库模块",
        ["@koishijs/plugin-database-sqlite"],
      ],
    ];
    for (const [index, [label, packages]] of steps.entries()) {
      this.log(`步骤 ${index + 1}/4：${label}。`);
      await this.npm(["install", ...packages], dir, (line) => this.log(line));
    }
  }
  createKoishi({ parent, name }) {
    return this.job("创建 Koishi 项目", async () => {
      if (!path.isAbsolute(parent) || !fs.statSync(parent).isDirectory())
        throw new Error("请选择实际存在的父目录。");
      if (typeof name !== "string" || !/^[a-z][a-z0-9-]{0,63}$/.test(name))
        throw new Error(
          "新目录名请使用小写英文字母、数字和短横线，以字母开头。",
        );
      const dir = path.join(parent, name);
      if (fs.existsSync(dir))
        throw new Error("该目录已经存在，请使用新目录名；不会清空已有目录。");
      // The inspected create-koishi 6.4.0 --yes skips its install/start prompts.
      await this.npm(
        [
          "exec",
          "--yes",
          "--package=create-koishi@6.4.0",
          "--",
          "create-koishi",
          name,
          "--yes",
        ],
        parent,
        (line) => this.log(line),
      );
      await this.npm(["install"], dir, (line) => this.log(line));
      const config = this.configStore.load();
      const result = this.configStore.save({
        ...config,
        koishiDir: dir,
        databasePath: path.join(dir, "data", "koishi.db"),
        koishiUrl: "http://127.0.0.1:5140",
      });
      this.log("项目目录已保存。下一步安装基础插件与 HDSI，再完成配置向导。");
      return result;
    });
  }
  installSnow({ file, parent, name }) {
    return this.job("安装 SnowLuma", () =>
      this.extractSnow({ file, parent, name }),
    );
  }
  snowTarget({ parent, name }) {
    if (!path.isAbsolute(parent) || !fs.statSync(parent).isDirectory())
      throw new Error("请选择实际存在的父目录。");
    if (typeof name !== "string" || !/^[A-Za-z][A-Za-z0-9-]{0,63}$/.test(name))
      throw new Error("新目录名请使用英文字母、数字和短横线，以字母开头。");
    const target = path.join(parent, name);
    if (fs.existsSync(target))
      throw new Error("已有目录不会被覆盖，请使用新目录名称。");
    return target;
  }
  async extractSnow({ file, parent, name }) {
    const dir = await extractSnow(
      file,
      this.snowTarget({ parent, name }),
      (line) => this.log(line),
    );
    return this.configStore.save({
      ...this.configStore.load(),
      snowlumaDir: dir,
      snowlumaUrl: "http://127.0.0.1:5099",
    });
  }
  writeConfig(text) {
    return this.job("写入 Koishi 配置", async () => {
      await this.assertReady();
      const config = this.configStore.load();
      await this.assertStopped(config);
      const result = writeConfiguration(config.koishiDir, text);
      this.log("原文件备份：" + result.backup);
      if (result.bak) this.log("根目录备份：" + result.bak);
      if (result.stickers) this.log("表情包目录已准备：" + result.stickers);
      this.log("已写入：" + result.target);
      return result;
    });
  }
  async assertReady() {
    const env = await this.inspectEnvironment();
    if (!env.readiness.ready)
      throw new Error(
        "请先完成全部安装：" +
          env.readiness.missing.map((item) => item.label).join("、") +
          "。请到安装与更新页面查看缺少的项目。",
      );
    return env;
  }
  async inspectEnvironment() {
    const config = this.configStore.load();
    let node;
    try {
      node = await runtime();
    } catch (error) {
      node = { error: error.message };
    }
    const readiness = checkInstallation(config, node, BASE_PACKAGES);
    return {
      readiness,
      node,
      installed: config.koishiDir ? installedVersion(config.koishiDir) : null,
      koishi: readiness.checks.find((item) => item.id === "koishi").ready,
      snowluma: readiness.checks.find((item) => item.id === "snowluma").ready,
      qq: readiness.checks.find((item) => item.id === "qq").ready,
    };
  }
}
module.exports = { SetupService, BASE_PACKAGES };
