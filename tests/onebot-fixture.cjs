const http = require("node:http");
const { createHash } = require("node:crypto");

// Minimal server-side RFC 6455 fixture; no application messages are sent to QQ.
function onebotServer(state = {}) {
  const sockets = new Set();
  const server = http.createServer((_req, res) =>
    res.end("<h1>管理页测试</h1>"),
  );
  server.on("upgrade", (req, socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", () => {});
    socket.on("data", () => socket.destroy());
    if (state.authorized === false)
      return socket.end(
        "HTTP/1.1 401 Unauthorized\r\nContent-Length: 0\r\n\r\n",
      );
    const accept = createHash("sha1")
      .update(
        req.headers["sec-websocket-key"] +
          "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      )
      .digest("base64");
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`,
    );
    if (state.silent) return;
    const payload = Buffer.from(
      JSON.stringify({
        post_type: "meta_event",
        meta_event_type: "lifecycle",
        self_id: state.selfId || 123456,
        status: { online: state.online === true },
      }),
    );
    const header =
      payload.length < 126
        ? Buffer.from([129, payload.length])
        : Buffer.from([129, 126, payload.length >> 8, payload.length & 255]);
    socket.write(Buffer.concat([header, payload]));
  });
  server.dispose = async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  };
  return server;
}
module.exports = { onebotServer };
