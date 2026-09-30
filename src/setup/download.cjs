const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { Readable, Transform } = require("node:stream");
const { pipeline } = require("node:stream/promises");
const { officialUrl } = require("./official-sources.cjs");

async function download(fetcher, asset, directory, signal, progress) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]+\.(zip|exe)$/.test(asset.name))
    throw new Error("官方安装包文件名不受支持。");
  const target = path.join(directory, crypto.randomUUID(), asset.name);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const partial = target + ".part";
  const controller = new AbortController();
  const combined = AbortSignal.any([
    signal,
    controller.signal,
    AbortSignal.timeout(20 * 60 * 1000),
  ]);
  let timer;
  const heartbeat = () => {
    clearTimeout(timer);
    timer = setTimeout(
      () => controller.abort(new Error("下载超过 60 秒没有进展，请重试。")),
      60000,
    );
  };
  let response;
  try {
    heartbeat();
    let url = asset.url;
    for (let redirects = 0; redirects <= 5; redirects++) {
      officialUrl(url, asset.hosts);
      response = await fetcher(url, {
        redirect: "manual",
        headers: asset.headers,
        signal: combined,
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) break;
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location || redirects === 5) throw new Error("官方下载重定向无效。");
      url = new URL(location, url).href;
    }
    if (response.status !== 200 || !response.body)
      throw new Error(`下载安装包失败（HTTP ${response.status}），请重试。`);
    const length = Number(response.headers.get("content-length")) || 0;
    const total = asset.size || length;
    const limit = 1024 * 1024 * 1024;
    if (total > limit || (asset.size && length && asset.size !== length))
      throw new Error("安装包大小与官方信息不一致。");
    let received = 0;
    let last = 0;
    const hash = crypto.createHash("sha256");
    const meter = new Transform({
      transform(chunk, encoding, callback) {
        heartbeat();
        received += chunk.length;
        if (received > limit || (total && received > total))
          return callback(new Error("下载数据超过安装包大小。"));
        hash.update(chunk);
        if (Date.now() - last > 150) {
          progress({ received, total });
          last = Date.now();
        }
        callback(null, chunk);
      },
    });
    await pipeline(
      Readable.fromWeb(response.body),
      meter,
      fs.createWriteStream(partial, { flags: "wx" }),
      { signal: combined },
    );
    if (!received || (total && received !== total))
      throw new Error("下载不完整，请重试。");
    const sha256 = hash.digest("hex");
    if (asset.sha256 && sha256 !== asset.sha256)
      throw new Error("SHA-256 校验失败，安装已停止。请重新下载。");
    combined.throwIfAborted();
    fs.renameSync(partial, target);
    progress({ received, total: total || received });
    return { file: target, sha256, size: received };
  } catch (error) {
    if (signal.aborted) throw new Error("下载已取消，可以重新点击下载安装。");
    if (combined.aborted) throw combined.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    if (response?.body && !response.body.locked)
      await response.body.cancel().catch(() => {});
  }
}
module.exports = { download };
