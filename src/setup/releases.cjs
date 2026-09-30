const cheerio = require("cheerio");
const RELEASES_URL = "https://gitee.com/MomoiCore/hds-interlude/releases";
const LINKS = Object.freeze({
  node: "https://nodejs.org/zh-cn",
  qq: "https://im.qq.com/pc",
  snowluma: "https://github.com/SnowLuma/SnowLuma/releases",
  interlude: RELEASES_URL,
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
async function releases(fetcher = fetch) {
  const response = await fetcher(RELEASES_URL, {
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok)
    throw new Error(`Gitee 发布页请求失败：HTTP ${response.status}`);
  const html = await response.text();
  if (html.length > 8 * 1024 * 1024) throw new Error("发布页响应过大。");
  return parseReleases(html);
}
module.exports = { LINKS, RELEASES_URL, parseReleases, releases };
