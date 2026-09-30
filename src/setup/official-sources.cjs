// Protocols read from SnowLuma's release API and QQ's official PC download page.
const SNOW_API =
  "https://api.github.com/repos/SnowLuma/SnowLuma/releases/latest";
const QQ_CONFIG =
  "https://qq-web.cdn-go.cn/im.qq.com_new/latest/rainbow/pcConfig.json";
const QQ_CONFIG_FALLBACK =
  "https://im.qq.com/proxy/domain/qq-web.cdn-go.cn/im.qq.com_new/latest/rainbow/pcConfig.json";
const QQ_SIGN =
  "https://im.qq.com/http2rpc/gotrpc/noauth/trpc.qqntv2.urlsign.UrlSign/GetSign";
const QQ_HEADERS = {
  "User-Agent": "Mozilla/5.0 HDS-Interlude-Launcher",
  Referer: "https://im.qq.com/pc/",
};

function officialUrl(value, hosts) {
  const url = new URL(value);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !hosts.includes(url.hostname)
  )
    throw new Error("下载地址不属于已核实的官方来源。");
  return url.href;
}
async function json(fetcher, url, signal, options = {}) {
  const response = await fetcher(url, {
    ...options,
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
  });
  if (!response.ok)
    throw new Error(
      `官方版本信息读取失败（HTTP ${response.status}）。请稍后重试。`,
    );
  return response.json();
}
function snowAsset(release, arch) {
  if (arch !== "x64")
    throw new Error("SnowLuma 当前官方 Windows 安装表仅提供 x64 完整包。");
  if (
    typeof release.body !== "string" ||
    typeof release.tag_name !== "string" ||
    !Array.isArray(release.assets)
  )
    throw new Error("SnowLuma 官方版本信息结构已变化。");
  // Read the explicit platform/full-package mapping, never infer a filename from the tag.
  const row = release.body
    .split(/\r?\n/)
    .find((line) => line.startsWith("| Windows x64 |"));
  const cell = row?.split("|")[2]?.trim();
  if (!cell || !/^`[^`]+`$/.test(cell))
    throw new Error("官方发布说明未列出 Windows x64 完整包，请查看发布页。");
  const name = cell.slice(1, -1);
  const matches = release.assets.filter((asset) => asset.name === name);
  if (matches.length !== 1) throw new Error("发布说明中的完整包与附件不一致。");
  const asset = matches[0];
  if (
    !Number.isSafeInteger(asset.size) ||
    asset.size <= 0 ||
    !/^sha256:[a-f0-9]{64}$/.test(asset.digest)
  )
    throw new Error("官方附件缺少大小或 SHA-256 校验信息。");
  return {
    name,
    version: release.tag_name,
    size: asset.size,
    sha256: asset.digest.slice(7),
    url: officialUrl(asset.browser_download_url, ["github.com"]),
    hosts: ["github.com", "release-assets.githubusercontent.com"],
    headers: { "User-Agent": "HDS-Interlude-Launcher" },
  };
}
async function resolveSnow(fetcher, signal, arch = process.arch) {
  return snowAsset(
    await json(fetcher, SNOW_API, signal, {
      headers: {
        "User-Agent": "HDS-Interlude-Launcher",
        Accept: "application/vnd.github+json",
      },
    }),
    arch,
  );
}
async function resolveQQ(fetcher, signal, arch = process.arch) {
  let config;
  try {
    config = await json(fetcher, QQ_CONFIG, signal);
  } catch (error) {
    if (signal.aborted) throw error;
    config = await json(fetcher, QQ_CONFIG_FALLBACK, signal);
  }
  const keys = {
    x64: "ntDownloadX64Url",
    arm64: "ntDownloadARMUrl",
    ia32: "ntDownloadUrl",
  };
  if (!Object.hasOwn(keys, arch))
    throw new Error("QQ 官网未提供当前架构的 Windows 安装包。");
  const raw = config.Windows?.[keys[arch]];
  if (typeof raw !== "string" || typeof config.Windows.version !== "string")
    throw new Error("QQ 官方版本配置结构已变化。");
  const url = officialUrl(raw, ["qqdl.gtimg.cn"]);
  const signed = await json(fetcher, QQ_SIGN, signal, {
    method: "POST",
    headers: {
      ...QQ_HEADERS,
      "Content-Type": "application/json",
      Origin: "https://im.qq.com",
      "x-oidb": JSON.stringify({
        uint32_command: "0x9b8e",
        uint32_service_type: 1,
      }),
    },
    body: JSON.stringify({ url }),
  });
  if (signed.retcode !== 0 || typeof signed.data?.url !== "string")
    throw new Error("QQ 官网未返回有效下载签名，请稍后重试。");
  return {
    name: decodeURIComponent(new URL(url).pathname.split("/").pop()),
    version: config.Windows.version,
    url: officialUrl(signed.data.url, ["qqdl.gtimg.cn"]),
    hosts: ["qqdl.gtimg.cn"],
    headers: { "User-Agent": QQ_HEADERS["User-Agent"] },
  };
}
module.exports = { resolveSnow, resolveQQ, snowAsset, officialUrl };
