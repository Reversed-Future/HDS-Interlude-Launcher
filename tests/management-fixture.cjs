const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const YAML = require("yaml");

function createManagementFixture(directory) {
  const state = {
    calls: [],
    config: {
      plugins: {
        "group:app": {
          "hds-interlude:test": {
            storyDefaults: {
              characterName: "演示角色",
              world: "演示世界",
              style: "保留的高级字段",
            },
            model: {
              providers: [
                {
                  id: "original",
                  label: "演示连接",
                  mode: "openai-compatible",
                  model: "example-model",
                  endpoint: "http://127.0.0.1/v1/chat/completions",
                  apiKey: "demo-secret",
                  enabled: true,
                  useForMain: true,
                  extraHeaders: { "X-Preserve": "yes" },
                },
              ],
            },
            onebot: {
              userAccounts: [
                {
                  qq: "123456",
                  label: "用户",
                  enabled: true,
                  profile: "测试",
                  relationship: "朋友",
                  entityId: "keep-me",
                },
              ],
              botAccounts: [{ qq: "123456", enabled: true }],
            },
            runtime: { typingCharactersPerSecond: 8 },
            hiddenExtension: { keep: true },
          },
          "adapter-onebot:test": {
            protocol: "ws",
            selfId: "123456",
            endpoint: "ws://127.0.0.1:3001",
            token: "old-token",
            keep: true,
          },
          "help:test": {},
          "console:test": {},
        },
      },
    },
    snow: {
      networks: {
        wsServers: [
          {
            name: "ws-default",
            host: "127.0.0.1",
            port: 3001,
            path: "/",
            role: "Universal",
            accessToken: "demo-connection",
            messageFormat: "array",
            reportSelfMessage: false,
            custom: "preserve",
          },
        ],
        wsClients: [],
        httpClients: [{ name: "untouched" }],
        httpServers: [],
      },
      historySync: { enabled: false },
    },
    snowReads: 0,
    koishiAuthenticated: false,
  };
  const configFile = path.join(directory, "koishi.yml");
  const persist = () =>
    fs.writeFileSync(configFile, YAML.stringify(state.config));
  persist();
  const sockets = new Set();
  const server = http.createServer(async (req, res) => {
    const respond = (value, code = 200) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(value));
    };
    if (req.url === "/console") {
      res.setHeader("Content-Type", "text/html");
      return res.end(
        '<html><head><script>KOISHI_CONFIG = {"endpoint":"/status"}</script></head><body>Console</body></html>',
      );
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    let body;
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return respond({ message: "bad json" }, 400);
    }
    state.calls.push({ type: req.method + " " + req.url });
    if (req.url === "/api/login")
      return body.password === "test-password"
        ? respond({ success: true, token: "test-session" })
        : respond({ success: false, message: "密码错误" }, 401);
    if (req.headers.authorization !== "Bearer test-session")
      return respond({ message: "Unauthorized" }, 401);
    if (req.url === "/api/logout") return respond({ success: true });
    if (req.url === "/api/processes")
      return respond({
        list: [{ pid: 456, status: "online", loggedIn: true, uin: "123456" }],
      });
    if (req.url === "/api/qq-list")
      return respond({ list: [{ uin: "123456", nickname: "演示 QQ" }] });
    if (req.url === "/api/config/123456") {
      if (req.method === "POST") {
        state.snow = body;
        return respond({
          success: true,
          saved: true,
          applied: true,
          message: "配置保存成功，已热重载当前会话。",
        });
      }
      state.snowReads++;
      return respond({ config: state.snow });
    }
    respond({ message: "unexpected endpoint" }, 404);
  });
  server.on("upgrade", (req, socket) => {
    if (req.url !== "/status") return socket.destroy();
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    const accept = createHash("sha1")
      .update(
        req.headers["sec-websocket-key"] +
          "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      )
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    const send = (value) => {
      const data = Buffer.from(JSON.stringify(value));
      const header =
        data.length < 126
          ? Buffer.from([129, data.length])
          : Buffer.from([129, 126, data.length >> 8, data.length & 255]);
      socket.write(Buffer.concat([header, data]));
    };
    let auth = false;
    const push = () =>
      send({
        type: "data",
        body: { key: "config", value: auth ? state.config : null },
      });
    push();
    let buffer = Buffer.alloc(0);
    socket.on("data", (data) => {
      buffer = Buffer.concat([buffer, data]);
      while (buffer.length >= 2) {
        const opcode = buffer[0] & 15,
          masked = !!(buffer[1] & 128);
        let length = buffer[1] & 127,
          offset = 2;
        if (length === 126) {
          if (buffer.length < 4) return;
          length = buffer.readUInt16BE(2);
          offset = 4;
        }
        if (length === 127) return socket.destroy();
        const maskOffset = offset;
        if (masked) offset += 4;
        if (buffer.length < offset + length) return;
        const payload = Buffer.from(buffer.subarray(offset, offset + length));
        if (masked)
          for (let i = 0; i < payload.length; i++)
            payload[i] ^= buffer[maskOffset + (i % 4)];
        buffer = buffer.subarray(offset + length);
        if (opcode === 8) return socket.end(Buffer.from([136, 0]));
        if (opcode !== 1) continue;
        const { type, args, id } = JSON.parse(payload.toString());
        state.calls.push({ type });
        let error, value;
        if (type === "ping") value = "pong";
        else if (type === "login/password") {
          if (args[0] === "admin" && args[1] === "test-password") {
            auth = true;
            state.koishiAuthenticated = true;
            push();
          } else error = "bad password";
        } else if (type === "user/logout") {
          auth = false;
          push();
        } else if (!auth) error = "unauthorized";
        else if (["manager/reload", "manager/unload"].includes(type)) {
          const [parent, key, config] = args;
          if (parent !== "app") error = "bad parent";
          else {
            const group = state.config.plugins["group:app"];
            delete group[key];
            delete group["~" + key];
            group[(type === "manager/unload" ? "~" : "") + key] = config;
            persist();
            push();
          }
        } else error = "not implemented";
        send({
          type: "response",
          body: { id, ...(error ? { error } : { value }) },
        });
      }
    });
  });
  return {
    state,
    server,
    persist,
    async start() {
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      return `http://127.0.0.1:${server.address().port}`;
    },
    async close() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
module.exports = { createManagementFixture };
