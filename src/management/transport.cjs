function localURL(value, base) {
  const url = new URL(value, base);
  if (
    !["http:", "https:", "ws:", "wss:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error("常用管理仅连接本机地址。请在高级管理中访问远程服务。");
  return url;
}
async function request(url, options = {}, fetcher = fetch) {
  localURL(url);
  let response;
  try {
    response = await fetcher(url, {
      ...options,
      redirect: "error",
      signal: AbortSignal.timeout(12000),
    });
  } catch {
    throw new Error("无法连接管理服务，请先启动程序并检查管理页地址。");
  }
  const text = await response.text();
  if (text.length > 8 * 1024 * 1024) throw new Error("管理接口返回内容过大。");
  return { response, text };
}
module.exports = { localURL, request };
