const semver = require("semver");
const config = require("./config.cjs");
const { officialUrl } = require("../setup/official-sources.cjs");
const headers = {
  "User-Agent": "HDS-Interlude-Launcher",
  Accept: "application/vnd.github+json",
};
function releaseUrl(url) {
  const checked = officialUrl(url, ["github.com"]);
  if (!checked.startsWith(config.url + "/releases/download/"))
    throw new Error("更新文件不属于本启动器仓库。");
  return checked;
}
async function json(fetcher, url) {
  const response = await fetcher(url, {
    headers,
    signal: AbortSignal.timeout(30000),
  });
  if (response.status === 404) throw new Error("仓库尚未发布可用版本。");
  if (!response.ok)
    throw new Error(`更新检查失败（HTTP ${response.status}），请稍后重试。`);
  const text = await response.text();
  if (text.length > 1024 * 1024) throw new Error("更新元数据过大。");
  return JSON.parse(text);
}
function validateManifest(manifest, release, current) {
  if (
    manifest.schemaVersion !== 1 ||
    !semver.valid(manifest.version) ||
    manifest.platform !== "win32" ||
    manifest.arch !== "x64" ||
    release.tag_name !== `v${manifest.version}` ||
    release.draft ||
    release.prerelease
  )
    throw new Error("发布版本或更新清单格式不正确。");
  if (
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    !Number.isSafeInteger(manifest.size) ||
    manifest.size <= 0
  )
    throw new Error("更新清单缺少有效校验信息。");
  const matches = release.assets.filter((item) => item.name === manifest.asset);
  if (matches.length !== 1 || matches[0].size !== manifest.size)
    throw new Error("更新附件与清单不一致。");
  const asset = matches[0];
  if (asset.digest && asset.digest !== `sha256:${manifest.sha256}`)
    throw new Error("GitHub 附件摘要与更新清单不一致。");
  return {
    version: manifest.version,
    available: semver.gt(manifest.version, current),
    notes: String(release.body || "").slice(0, 8000),
    name: manifest.asset,
    size: manifest.size,
    sha256: manifest.sha256,
    url: releaseUrl(asset.browser_download_url),
    hosts: ["github.com", "release-assets.githubusercontent.com"],
    headers,
  };
}
async function checkRelease(fetcher, current) {
  const release = await json(fetcher, config.api);
  if (!Array.isArray(release.assets))
    throw new Error("仓库返回的发布信息无效。");
  const manifests = release.assets.filter(
    (asset) => asset.name === config.manifest,
  );
  if (manifests.length !== 1) throw new Error("此版本尚未提供应用内更新清单。");
  return validateManifest(
    await json(fetcher, releaseUrl(manifests[0].browser_download_url)),
    release,
    current,
  );
}
module.exports = { checkRelease, validateManifest };
