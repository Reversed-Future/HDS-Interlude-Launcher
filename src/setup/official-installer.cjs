const fs = require("node:fs");
const path = require("node:path");
const { resolveSnow, resolveQQ } = require("./official-sources.cjs");
const { download } = require("./download.cjs");
const { verifySignature } = require("./signature.cjs");
class OfficialInstaller {
  constructor(setup, { fetcher, directory, open, verify = verifySignature }) {
    Object.assign(this, { setup, fetcher, directory, open, verify });
    this.controller = null;
  }
  cancel() {
    if (!this.controller) return false;
    this.controller.abort();
    return true;
  }
  update(downloadState) {
    this.setup.status.download = downloadState;
    this.setup.emit("state", { ...this.setup.status, busy: this.setup.busy });
  }
  async fetchAsset(resolve) {
    this.controller = new AbortController();
    const signal = this.controller.signal;
    this.update({
      label: "正在读取官方版本…",
      received: 0,
      total: 0,
      cancelable: true,
    });
    try {
      const asset = await resolve(this.fetcher, signal);
      this.setup.log(`官方版本：${asset.version} · ${asset.name}`);
      const result = await download(
        this.fetcher,
        asset,
        this.directory,
        signal,
        (state) =>
          this.update({ ...state, label: asset.name, cancelable: true }),
      );
      signal.throwIfAborted();
      this.setup.log("下载完成：" + result.file);
      this.setup.log("SHA-256：" + result.sha256);
      return result.file;
    } catch (error) {
      if (signal.aborted) throw new Error("下载已取消，可以重新点击下载安装。");
      throw error;
    } finally {
      this.controller = null;
      this.update(null);
    }
  }
  snow(input) {
    return this.setup.job("从官方安装 SnowLuma", async () => {
      this.setup.snowTarget(input); // Validate destination before downloading anything.
      const file = await this.fetchAsset(resolveSnow);
      this.setup.log("官方 SHA-256 校验通过，正在解压完整包。");
      return this.setup.extractSnow({ ...input, file });
    });
  }
  qq() {
    return this.setup.job("下载并打开 QQ 官方安装器", async () => {
      const file = await this.fetchAsset(resolveQQ);
      this.setup.log("正在验证 QQ 安装包数字签名…");
      const handle = fs.openSync(file, "r");
      const magic = Buffer.alloc(2);
      try {
        fs.readSync(handle, magic, 0, 2, 0);
      } finally {
        fs.closeSync(handle);
      }
      if (magic.toString("ascii") !== "MZ" || path.extname(file) !== ".exe")
        throw new Error("下载内容不是 Windows 安装程序。");
      await this.verify(file);
      const error = await this.open(file);
      if (error) throw new Error(error);
      this.setup.log(
        "数字签名验证通过，QQ 安装器已打开。完成安装后，在设置中选择 QQ.exe。",
      );
      return { file };
    });
  }
}
module.exports = { OfficialInstaller };
