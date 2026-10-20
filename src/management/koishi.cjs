const { randomUUID } = require("node:crypto");
const { load } = require("cheerio");
const { localURL, request } = require("./transport.cjs");

class KoishiClient {
  constructor({ fetcher = fetch, Socket = WebSocket } = {}) {
    this.fetcher = fetcher;
    this.Socket = Socket;
    this.data = new Map();
    this.pending = new Map();
  }
  close() {
    this.socket?.close();
    this.socket = null;
    this.data.clear();
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error("Koishi 连接已断开，请刷新。"));
    }
    this.pending.clear();
  }
  async connect(address) {
    if (this.address === address && this.socket?.readyState === 1) return;
    if (this.connecting) throw new Error("正在连接 Koishi，请稍候。");
    this.connecting = true;
    this.close();
    this.address = address;
    try {
      const page = localURL(address);
      const { response, text } = await request(page.href, {}, this.fetcher);
      if (!response.ok)
        throw new Error(`Koishi 管理页不可用（${response.status}）。`);
      const $ = load(text);
      let settings;
      $("script").each((_i, element) => {
        const match = $(element)
          .text()
          .trim()
          .match(/^KOISHI_CONFIG = (\{[\s\S]*\})$/);
        if (match) settings = JSON.parse(match[1]);
      });
      if (typeof settings?.endpoint !== "string")
        throw new Error(
          "未找到 Koishi Console 接口地址，请检查管理页地址和版本。",
        );
      const endpoint = localURL(settings.endpoint, page);
      if (endpoint.origin !== page.origin)
        throw new Error(
          "Koishi 接口与管理页地址不一致，请在高级管理中检查 Console 配置。",
        );
      endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
      const socket = new this.Socket(endpoint.href);
      this.socket = socket;
      socket.addEventListener("message", ({ data }) => {
        if (this.socket !== socket) return;
        let frame;
        try {
          frame = JSON.parse(data);
        } catch {
          return;
        }
        if (frame.type === "data" && frame.body)
          this.data.set(frame.body.key, frame.body.value);
        if (frame.type === "patch" && frame.body)
          this.data.set(frame.body.key, {
            ...this.data.get(frame.body.key),
            ...frame.body.value,
          });
        if (frame.type === "response" && frame.body) {
          const item = this.pending.get(frame.body.id);
          if (!item) return;
          clearTimeout(item.timer);
          this.pending.delete(frame.body.id);
          if (frame.body.error === "unauthorized")
            this.data.set("config", null);
          frame.body.error
            ? item.reject(
                new Error(
                  frame.body.error === "unauthorized"
                    ? "Koishi 需要管理员登录，或当前账号权限不足。"
                    : "Koishi 拒绝了操作，请检查输入和 Koishi 日志。",
                ),
              )
            : item.resolve(frame.body.value);
        }
      });
      socket.addEventListener("close", () => {
        if (this.socket === socket) this.close();
      });
      socket.addEventListener("error", () => {});
      await new Promise((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Koishi 接口连接超时。")),
          10000,
        );
        socket.addEventListener(
          "open",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
        socket.addEventListener(
          "error",
          () => {
            clearTimeout(timer);
            reject(new Error("Koishi 接口连接失败。"));
          },
          { once: true },
        );
      });
      await this.waitConfig();
    } catch (error) {
      this.close();
      throw error;
    } finally {
      this.connecting = false;
    }
  }
  async waitConfig() {
    const deadline = Date.now() + 10000;
    while (
      !this.data.has("config") &&
      Date.now() < deadline &&
      this.socket?.readyState === 1
    )
      await new Promise((resolve) => setTimeout(resolve, 50));
    if (!this.data.has("config"))
      throw new Error("Koishi 未提供配置管理数据，请确认 config 插件已启用。");
  }
  call(type, ...args) {
    if (this.socket?.readyState !== 1)
      return Promise.reject(new Error("Koishi 未连接，请先刷新。"));
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error("Koishi 未确认操作结果，请刷新查看；不要重复点击保存。"),
        );
      }, 15000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.socket.send(JSON.stringify({ type, args, id }));
      } catch {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(new Error("Koishi 连接已中断，请刷新查看操作结果。"));
      }
    });
  }
  async login(input) {
    if (!input.username || !input.password)
      throw new Error("请填写 Koishi 管理员用户名和密码。");
    await this.call("login/password", input.username, input.password);
    const deadline = Date.now() + 5000;
    while (!this.data.get("config") && Date.now() < deadline)
      await new Promise((resolve) => setTimeout(resolve, 50));
    if (!this.data.get("config"))
      throw new Error("登录后仍无配置访问权限，请使用管理员账号。");
  }
}
module.exports = { KoishiClient };
