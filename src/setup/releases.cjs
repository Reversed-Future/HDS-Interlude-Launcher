const cheerio = require("cheerio");
const RELEASES_URL = "https://gitee.com/MomoiCore/hds-interlude/releases";
const GITHUB_RELEASES =
  "https://github.com/ISEKAI-MomoiCore/HDS-Interlude/releases";
const LINKS = Object.freeze({
  node: "https://nodejs.org/zh-cn",
  qq: "https://im.qq.com/pc",
  snowluma: "https://github.com/SnowLuma/SnowLuma/releases",
  interlude: GITHUB_RELEASES,
  interludeBackup: RELEASES_URL,
});
function parseReleases(html) {
  const $ = cheerio.load(html);
  const rows = [];
  $(".release-tag-item").each((_index, item) => {
    const tag = $(item).attr("data-tag");
    $(item)
      .find(".releases-download-list a[href]")
      .each((_i, anchor) => {
        const url = new URL($(anchor).attr("href"), RELEASES_URL);
        if (
          url.origin !== "https://gitee.com" ||
          !url.pathname.startsWith(
            "/MomoiCore/hds-interlude/releases/download/",
          )
        )
          return;
        const name = decodeURIComponent(url.pathname.split("/").pop());
        if (!name.endsWith(".tgz")) return;
        rows.push({ tag, name, url: url.href });
      });
  });
  if (!rows.length)
    throw new Error(
      "发布页没有返回可识别的 tgz 附件。请打开发布页下载后手动导入。",
    );
  return rows;
}
async function giteeReleases(fetcher) {
  const response = await fetcher(RELEASES_URL, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(`Gitee 发布页请求失败：HTTP ${response.status}`);
  const html = await response.text();
  if (html.length > 8 * 1024 * 1024) throw new Error("发布页响应过大。");
  return parseReleases(html);
}
async function releases(fetcher = fetch) {
  try {
    const response = await fetcher(
      "https://api.github.com/repos/ISEKAI-MomoiCore/HDS-Interlude/releases",
      {
        headers: {
          "User-Agent": "HDS-Interlude-Launcher",
          Accept: "application/vnd.github+json",
        },
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!response.ok) throw new Error(`GitHub HTTP ${response.status}`);
    const text = await response.text();
    if (text.length > 8 * 1024 * 1024) throw new Error("发布信息过大");
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error("发布信息格式不正确");
    const rows = data
      .filter((r) => !r.draft)
      .flatMap((r) =>
        (r.assets || [])
          .filter(
            (a) =>
              typeof a.name === "string" &&
              a.name.endsWith(".tgz") &&
              typeof a.browser_download_url === "string" &&
              a.browser_download_url.startsWith(GITHUB_RELEASES + "/download/"),
          )
          .map((a) => ({
            tag: r.tag_name,
            name: a.name,
            url: a.browser_download_url,
            source: "GitHub",
          })),
      );
    if (rows.length) return rows;
  } catch {
    /* Gitee remains available when GitHub is unavailable. */
  }
  try {
    return (await giteeReleases(fetcher)).map((r) => ({
      ...r,
      source: "Gitee（备用）",
    }));
  } catch {
    throw new Error(
      "暂时无法读取插件发布列表。可打开 GitHub 发布页，或使用 Gitee 备用入口下载 .tgz 后导入。",
    );
  }
}
module.exports = { LINKS, RELEASES_URL, parseReleases, releases };
