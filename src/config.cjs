const fs = require("node:fs");
const path = require("node:path");

const defaults = Object.freeze({
  koishiDir: "",
  snowlumaDir: "",
  qqExe: "",
  databasePath: "",
  koishiUrl: "",
  snowlumaUrl: "",
  logEncoding: "utf-8",
});

function validateUrl(value) {
  if (!value) return "";
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol))
    throw new Error("WebUI 地址必须以 http:// 或 https:// 开头。");
  if (url.username || url.password)
    throw new Error("请在 WebUI 页面登录，不要把密码写入地址。");
  return value;
}

function validateConfig(input) {
  if (!input || typeof input !== "object") throw new Error("配置格式不正确。");
  const result = {};
  for (const key of Object.keys(defaults)) {
    if (typeof input[key] !== "string")
      throw new Error(`配置项 ${key} 必须是文本。`);
    result[key] = input[key];
  }
  validateUrl(result.koishiUrl);
  validateUrl(result.snowlumaUrl);
  if (!["utf-8", "gb18030"].includes(result.logEncoding))
    throw new Error("不支持的日志编码。");
  return result;
}

class ConfigStore {
  constructor(file, seedFile) {
    this.file = file;
    this.seedFile = seedFile;
  }
  load() {
    const file = fs.existsSync(this.file) ? this.file : this.seedFile;
    if (!file || !fs.existsSync(file)) return { ...defaults };
    const config = validateConfig({
      ...defaults,
      ...JSON.parse(fs.readFileSync(file, "utf8")),
    });
    // Persist the developer's explicit seed once; public builds omit the seed.
    if (file === this.seedFile) this.save(config);
    return config;
  }
  save(input) {
    const config = validateConfig(input);
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(
      this.file + ".tmp",
      JSON.stringify(config, null, 2),
      "utf8",
    );
    fs.renameSync(this.file + ".tmp", this.file);
    return config;
  }
}

module.exports = { defaults, validateUrl, validateConfig, ConfigStore };
