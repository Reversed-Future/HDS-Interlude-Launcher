const { stripVTControlCharacters } = require("node:util");

function detectWebUI(service, line) {
  const text = stripVTControlCharacters(line).trim();
  // These messages and logger names come from the installed upstream sources.
  const pattern =
    service === "koishi"
      ? /\[I\] console webui is available at (https?:\/\/\S+)$/
      : service === "snowluma"
        ? /\[WebUI\] listening (https?:\/\/\S+)$/
        : null;
  const match = pattern && text.match(pattern);
  if (!match) return null;
  try {
    const url = new URL(match[1]);
    if (url.username || url.password || url.search || url.hash) return null;
    if (["0.0.0.0", "[::]"].includes(url.hostname)) url.hostname = "127.0.0.1";
    if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))
      return null;
    return url.href;
  } catch {
    return null;
  }
}

module.exports = { detectWebUI };
