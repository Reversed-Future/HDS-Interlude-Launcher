const { localURL, request } = require("./transport.cjs");
class SnowClient {
  constructor(fetcher = fetch) {
    this.fetcher = fetcher;
    this.address = "";
    this.token = "";
  }
  configure(address) {
    const url = localURL(address);
    if (!["http:", "https:"].includes(url.protocol))
      throw new Error("SnowLuma 管理地址必须是 HTTP 地址。");
    if (this.address !== url.origin) {
      this.address = url.origin;
      this.token = "";
    }
  }
  async call(route, body, login = false) {
    if (!login && !this.token) throw new Error("请先登录 SnowLuma 管理。");
    const { response, text } = await request(
      new URL(route, this.address).href,
      {
        method: body === undefined ? "GET" : "POST",
        headers: {
          "Content-Type": "application/json",
          ...(!login ? { Authorization: `Bearer ${this.token}` } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      },
      this.fetcher,
    );
    let value;
    try {
      value = JSON.parse(text);
    } catch {
      throw new Error("SnowLuma 返回了无法识别的数据，请检查版本和管理地址。");
    }
    if (response.status === 401 && !login) {
      this.token = "";
      throw new Error("SnowLuma 登录已失效，请点击“刷新 QQ 状态”重新登录。");
    }
    if (!response.ok || value.success === false) {
      if (value.needsTotp)
        throw new Error("请输入 SnowLuma 的两步验证码后重新登录。");
      if (value.consentRequired || value.mustChangePassword)
        throw new Error(
          "请先在高级管理中完成 SnowLuma 协议确认和初始密码修改，再返回刷新。",
        );
      throw new Error(
        value.message ||
          (response.status === 401
            ? "登录已失效，请重新登录。"
            : `SnowLuma 操作失败（${response.status}）。`),
      );
    }
    return value;
  }
  async login(input) {
    if (typeof input.password !== "string" || !input.password)
      throw new Error("请填写 SnowLuma 管理密码。");
    const result = await this.call(
      "/api/login",
      { password: input.password, totp: input.totp || "" },
      true,
    );
    if (typeof result.token !== "string" || !result.token)
      throw new Error("SnowLuma 未返回登录会话。");
    this.token = result.token;
    if (result.mustChangePassword)
      throw new Error("登录成功，请先在高级管理中修改初始密码，再返回刷新。");
  }
  async logout() {
    try {
      if (this.token) await this.call("/api/logout", {});
    } finally {
      this.token = "";
    }
  }
  async status() {
    const [processes, accounts] = await Promise.all([
      this.call("/api/processes"),
      this.call("/api/qq-list"),
    ]);
    if (!Array.isArray(processes.list) || !Array.isArray(accounts.list))
      throw new Error("SnowLuma 状态格式不兼容。");
    return { processes: processes.list, accounts: accounts.list };
  }
}
module.exports = { SnowClient };
