const path = require("node:path");
const crypto = require("node:crypto");
const { EventEmitter } = require("node:events");
const { checkRelease } = require("./manifest.cjs");
const { extractUpdate } = require("./files.cjs");
const { download } = require("../setup/download.cjs");
class UpdateService extends EventEmitter {
  constructor(setup, { profile, version, fetcher }) {
    super();
    Object.assign(this, { setup, profile, version, fetcher });
    this.state = {
      phase: "idle",
      current: version,
      message: "启动时自动检查更新",
    };
    this.plan = null;
    this.staged = null;
    this.controller = null;
  }
  set(state) {
    this.state = { current: this.version, ...state };
    this.emit("state", this.state);
  }
  async check() {
    if (this.controller || this.state.phase === "checking" || this.setup.busy)
      return this.state;
    if (this.staged) return this.state;
    this.set({ phase: "checking", message: "正在检查 GitHub Release…" });
    try {
      this.plan = await checkRelease(this.fetcher, this.version);
      this.set({
        phase: this.plan.available ? "available" : "latest",
        latest: this.plan.version,
        message: this.plan.available
          ? `发现新版本 v${this.plan.version}`
          : "当前已是最新版本",
        notes: this.plan.notes,
      });
    } catch (error) {
      this.plan = null;
      this.set({ phase: "error", message: error.message });
    }
    return this.state;
  }
  install() {
    return this.setup.job("更新启动器", async () => {
      if (!this.plan?.available) throw new Error("请先检查到更新版本。");
      const plan = this.plan;
      this.controller = new AbortController();
      this.set({
        phase: "downloading",
        latest: plan.version,
        message: "正在下载启动器更新…",
        received: 0,
        total: plan.size,
      });
      try {
        const result = await download(
          this.fetcher,
          plan,
          path.join(this.profile, "updates"),
          this.controller.signal,
          (progress) =>
            this.set({
              phase: "downloading",
              latest: plan.version,
              message: "正在下载启动器更新…",
              ...progress,
            }),
        );
        this.set({
          phase: "extracting",
          latest: plan.version,
          message: "校验通过，正在准备新版本…",
        });
        const directory = path.join(
          this.profile,
          "versions",
          `${plan.version}-${crypto.randomUUID()}`,
        );
        await extractUpdate(result.file, directory, plan.version);
        this.staged = { directory, version: plan.version };
        this.set({
          phase: "ready",
          latest: plan.version,
          message: "新版本已准备好，停止后台服务后可重启更新。",
        });
        return this.state;
      } catch (error) {
        this.set({ phase: "error", message: error.message });
        throw error;
      } finally {
        this.controller = null;
      }
    });
  }
  cancel() {
    if (this.state.phase === "downloading") this.controller?.abort();
    return true;
  }
}
module.exports = { UpdateService };
