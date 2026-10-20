const fs = require("node:fs");
const path = require("node:path");
const YAML = require("yaml");
const { setTimeout: delay } = require("node:timers/promises");

// Koishi's loader splits plugin keys at ':' and skips '~' / '$' keys.
function readConnection(directory) {
  const config = YAML.parse(
    fs.readFileSync(path.join(directory, "koishi.yml"), "utf8"),
  );
  const adapters = [];
  function visit(plugins) {
    for (const [key, value] of Object.entries(plugins || {})) {
      if (!value || key.startsWith("~") || key.startsWith("$")) continue;
      const name = key.split(":", 1)[0];
      if (name === "group") visit(value);
      if (name === "adapter-onebot") adapters.push(value);
    }
  }
  visit(config?.plugins);
  if (adapters.length !== 1 || adapters[0].protocol !== "ws")
    throw new Error(
      "一键启动需要一个已启用的 OneBot 正向 WebSocket 配置，请先完成配置向导。",
    );
  const adapter = adapters[0];
  const url = new URL(adapter.endpoint);
  if (
    !["ws:", "wss:"].includes(url.protocol) ||
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error(
      "一键启动仅支持连接本机 SnowLuma，请检查 OneBot 连接地址。",
    );
  if (!/^[1-9]\d*$/.test(String(adapter.selfId)))
    throw new Error("请先在配置向导中填写机器人 QQ 号。");
  if (adapter.token)
    url.searchParams.set("access_token", String(adapter.token));
  return {
    url: url.href,
    selfId: String(adapter.selfId),
    port: url.port || (url.protocol === "wss:" ? "443" : "80"),
  };
}

// SnowLuma sends an authenticated lifecycle frame on connect, including the
// account and its online status. An open TCP port alone is not readiness.
function probeConnection(connection, signal, timeout = 2500) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(connection.url);
    let settled = false;
    const finish = (error, ready = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", cancel);
      socket.close();
      error ? reject(error) : resolve(ready);
    };
    const cancel = () => finish(signal.reason);
    const timer = setTimeout(() => finish(null), timeout);
    signal.addEventListener("abort", cancel, { once: true });
    socket.addEventListener("error", () => finish(null));
    socket.addEventListener("close", () => finish(null));
    socket.addEventListener("message", ({ data }) => {
      let frame;
      try {
        frame = JSON.parse(data);
      } catch {
        return;
      }
      if (
        frame.post_type !== "meta_event" ||
        !["lifecycle", "heartbeat"].includes(frame.meta_event_type)
      )
        return;
      if (String(frame.self_id) !== connection.selfId)
        return finish(
          new Error(
            "SnowLuma 当前登录的 QQ 与 Koishi 配置不一致，请切换到机器人账号后重试。",
          ),
        );
      if (frame.status?.online === true) finish(null, true);
    });
  });
}

async function waitForConnection(
  connection,
  signal,
  {
    timeout = 300000,
    probe = probeConnection,
    check = () => {},
    interval = 1000,
  } = {},
) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    signal.throwIfAborted();
    check();
    if (await probe(connection, signal, Math.min(2500, deadline - Date.now())))
      return;
    await delay(
      Math.min(interval, Math.max(0, deadline - Date.now())),
      undefined,
      { signal },
    );
  }
  throw new Error(
    `等待登录超时，Koishi 尚未启动。请确认 QQ 已登录，并在 SnowLuma 日志中检查加载结果、${connection.port} 端口和 OneBot 密钥是否与 Koishi 一致，然后重试。`,
  );
}

module.exports = { readConnection, probeConnection, waitForConnection };
