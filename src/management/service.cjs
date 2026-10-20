const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const YAML = require("yaml");
const { KoishiClient } = require("./koishi.cjs");
const { SnowClient } = require("./snowluma.cjs");
const { plugins, fingerprint } = require("./plugins.cjs");
const fields = require("./fields.cjs");
const { backupProject } = require("../setup/packages.cjs");
const { localURL } = require("./transport.cjs");

class ManagementService {
  constructor(configStore, processes, setup, clients = {}) {
    Object.assign(this, { configStore, processes, setup });
    this.koishi = clients.koishi || new KoishiClient();
    this.snow = clients.snow || new SnowClient();
    this.busy = false;
  }
  async mutate(run) {
    if (
      this.busy ||
      this.setup.busy ||
      this.processes.batchStarting ||
      this.processes.busy.size
    )
      throw new Error("请等待当前启动、安装或保存操作完成。");
    this.busy = true;
    try {
      return await run();
    } finally {
      this.busy = false;
    }
  }
  async connectKoishi() {
    const address = this.configStore.load().koishiUrl;
    if (!address) throw new Error("请先启动 Koishi，等待管理地址自动识别。");
    await this.koishi.connect(address);
  }
  configureSnow() {
    const address = this.configStore.load().snowlumaUrl;
    if (!address) throw new Error("请先启动 SnowLuma，等待管理地址自动识别。");
    this.snow.configure(address);
  }
  async koishiStatus() {
    await this.connectKoishi();
    await this.koishi.call("ping");
    const config = this.koishi.data.get("config");
    return {
      loginRequired: !config,
      plugins: config
        ? plugins(config).map(({ config: value, ...row }) => ({
            ...row,
            revision: this.koishiRevision(value),
          }))
        : [],
    };
  }
  async koishiLogin(input) {
    await this.connectKoishi();
    await this.koishi.login(input);
    return this.koishiStatus();
  }
  async koishiLogout() {
    try {
      if (this.koishi.data.get("user")) await this.koishi.call("user/logout");
    } finally {
      this.koishi.close();
    }
    return true;
  }
  koishiRevision(value) {
    const { koishiUrl, koishiDir } = this.configStore.load();
    return fingerprint({ koishiUrl, koishiDir, value });
  }
  snowRevision(uin, value) {
    const { snowlumaUrl, snowlumaDir } = this.configStore.load();
    return fingerprint({ snowlumaUrl, snowlumaDir, uin, value });
  }
  row(id, revision) {
    const row = plugins(this.koishi.data.get("config")).find(
      (item) => item.id === id,
    );
    if (!row) throw new Error("插件配置已变化，请刷新列表。");
    if (revision && this.koishiRevision(row.config) !== revision)
      throw new Error("该配置已在其他页面修改，请重新读取后再保存。");
    if (row.blocked)
      throw new Error("插件所在分组未启用，请先在高级管理中启用分组。");
    return row;
  }
  currentRow(input) {
    if (typeof input.revision !== "string" || !input.revision)
      throw new Error("请先读取当前配置。");
    return this.row(input.id, input.revision);
  }
  backupKoishi(row) {
    const directory = this.configStore.load().koishiDir;
    const file = path.join(directory, "koishi.yml");
    const local = plugins(YAML.parse(fs.readFileSync(file, "utf8"))).find(
      (item) => item.id === row.id,
    );
    if (!local || fingerprint(local.config) !== fingerprint(row.config))
      throw new Error(
        "本地 koishi.yml 与管理服务配置不一致，请检查目录和地址后刷新。",
      );
    const backup = backupProject(directory);
    fs.copyFileSync(file, file + ".bak");
    return backup;
  }
  async toggle(input) {
    return this.mutate(async () => {
      await this.connectKoishi();
      await this.koishi.call("ping");
      const row = this.currentRow(input);
      if (row.protected)
        throw new Error("管理连接所需的插件请在高级管理中操作。");
      if (typeof input.enabled !== "boolean") throw new Error("启停状态无效。");
      if (input.enabled === row.enabled) return { message: "状态没有变化。" };
      this.backupKoishi(row);
      await this.koishi.call(
        input.enabled ? "manager/reload" : "manager/unload",
        row.parent,
        row.key,
        row.config,
      );
      return { message: "插件状态已保存，Koishi 已接收启停操作。" };
    });
  }
  async editor(id) {
    await this.connectKoishi();
    await this.koishi.call("ping");
    const row = this.row(id);
    const common = {
      id,
      revision: this.koishiRevision(row.config),
      name: row.name,
      enabled: row.enabled,
    };
    if (row.name === "adapter-onebot") {
      if (row.config.protocol !== "ws")
        throw new Error("当前适配器不是正向 WebSocket，请在高级管理中调整。");
      return {
        ...common,
        groups: [{ title: "Koishi 的 QQ 连接", fields: fields.onebot }],
        values: fields.project(row.config, fields.onebot),
        arrays: [],
      };
    }
    if (row.name !== "hds-interlude")
      throw new Error("此插件的详细配置请使用高级管理。");
    return {
      ...common,
      groups: fields.hdsi,
      values: fields.project(
        row.config,
        fields.hdsi.flatMap((group) => group.fields),
      ),
      arrays: fields.arrays.map((group) => ({
        ...group,
        rows: (fields.get(row.config, group.key) || []).map((value, index) => ({
          index,
          values: fields.project(value, group.fields),
        })),
      })),
    };
  }
  async writePlugin(row, config) {
    this.backupKoishi(row);
    await this.koishi.call(
      row.enabled ? "manager/reload" : "manager/unload",
      row.parent,
      row.key,
      config,
    );
    return {
      message: row.enabled
        ? "配置已备份并保存，Koishi 已接收重载请求。请查看日志确认插件正常运行。"
        : "配置已备份并保存，插件仍保持停用。",
    };
  }
  async saveEditor(input) {
    return this.mutate(async () => {
      await this.connectKoishi();
      await this.koishi.call("ping");
      const row = this.currentRow(input);
      const next = structuredClone(row.config);
      if (row.name === "adapter-onebot" && row.config.protocol === "ws") {
        fields.patch(next, input.changes, fields.onebot);
        if (!next.endpoint || !next.selfId)
          throw new Error("请填写机器人 QQ 号和连接地址。");
        const url = localURL(next.endpoint);
        if (!["ws:", "wss:"].includes(url.protocol))
          throw new Error("OneBot 连接地址应以 ws:// 或 wss:// 开头。");
      } else if (row.name === "hds-interlude") {
        fields.patch(
          next,
          input.changes,
          fields.hdsi.flatMap((group) => group.fields),
        );
        for (const [key, rows] of Object.entries(input.arrays || {})) {
          const spec = fields.arrays.find((group) => group.key === key);
          if (!spec) throw new Error("不支持的配置列表。");
          fields.set(
            next,
            key,
            fields.patchRows(
              fields.get(next, key) || [],
              rows,
              spec.fields,
              () =>
                key === "model.providers"
                  ? {
                      id: "launcher-" + randomUUID(),
                      mode: "openai-compatible",
                      enabled: true,
                      useForMain: false,
                      useForCompaction: false,
                      useForAlter: false,
                      useForEmbedding: false,
                      useForStickers: false,
                      useForVision: false,
                    }
                  : { enabled: true },
            ),
          );
        }
        fields.validateEmbedding(next);
      } else throw new Error("此插件不支持常用配置编辑。");
      return this.writePlugin(row, next);
    });
  }
  async snowLogin(input) {
    this.configureSnow();
    await this.snow.login(input);
    return this.snowStatus();
  }
  async snowStatus() {
    this.configureSnow();
    if (!this.snow.token)
      return { loginRequired: true, processes: [], accounts: [] };
    return { loginRequired: false, ...(await this.snow.status()) };
  }
  async snowLogout() {
    await this.snow.logout();
    return true;
  }
  async loadProcess(input) {
    return this.mutate(async () => {
      this.configureSnow();
      const status = await this.snow.status();
      if (!status.processes.some((row) => row.pid === input.pid))
        throw new Error("QQ 进程已变化，请刷新。");
      await this.snow.call(`/api/processes/${input.pid}/load`, {});
      return { message: "已请求加载 SnowLuma，请刷新查看登录状态。" };
    });
  }
  async snowConfig(uin) {
    if (typeof uin !== "string" || !/^\d{5,10}$/.test(uin))
      throw new Error("请先选择已登录的 QQ 账号。");
    this.configureSnow();
    const result = await this.snow.call(`/api/config/${uin}`);
    if (!Array.isArray(result.config?.networks?.wsServers))
      throw new Error("SnowLuma OneBot 配置格式不兼容。");
    return result.config;
  }
  async snowEditor(uin) {
    const config = await this.snowConfig(uin);
    return {
      uin,
      revision: this.snowRevision(uin, config),
      fields: fields.snow,
      rows: config.networks.wsServers.map((row, index) => ({
        index,
        values: fields.project(row, fields.snow),
      })),
    };
  }
  async saveSnow(input) {
    return this.mutate(async () => {
      const previous = await this.snowConfig(input.uin);
      if (this.snowRevision(input.uin, previous) !== input.revision)
        throw new Error("SnowLuma 配置已变化，请重新读取。");
      const next = structuredClone(previous);
      next.networks.wsServers = fields.patchRows(
        previous.networks.wsServers,
        input.rows,
        fields.snow,
        () => ({
          name: "ws-" + randomUUID().slice(0, 8),
          enabled: true,
          host: "127.0.0.1",
          port: 3001,
          path: "/",
          role: "Universal",
          accessToken: require("node:crypto")
            .randomBytes(32)
            .toString("base64url"),
          messageFormat: "array",
          reportSelfMessage: false,
        }),
      );
      const backup = path.join(
        this.configStore.load().snowlumaDir,
        ".hds-launcher-backups",
        randomUUID(),
      );
      fs.mkdirSync(backup, { recursive: true });
      fs.writeFileSync(
        path.join(backup, `onebot_${input.uin}.json`),
        JSON.stringify(previous, null, 2),
        { flag: "wx" },
      );
      const result = await this.snow.call(`/api/config/${input.uin}`, next);
      return {
        message:
          result.message ||
          (result.applied
            ? "SnowLuma 配置已保存并应用。"
            : "配置已保存，尚未全部应用，请查看 SnowLuma 日志。"),
      };
    });
  }
  async syncConnection(input) {
    return this.mutate(async () => {
      const config = await this.snowConfig(input.uin);
      if (this.snowRevision(input.uin, config) !== input.revision)
        throw new Error("SnowLuma 节点已变化，请重新读取。");
      const node = config.networks.wsServers[input.index];
      if (!node || node.enabled === false || node.role !== "Universal")
        throw new Error("请选择已启用且角色为 Universal 的 WS 服务端。");
      await this.connectKoishi();
      await this.koishi.call("ping");
      const row = this.currentRow({
        id: input.id,
        revision: input.koishiRevision,
      });
      if (row.name !== "adapter-onebot" || row.config.protocol !== "ws")
        throw new Error("请选择 Koishi 的正向 WebSocket 适配器。");
      let host = node.host;
      if (["0.0.0.0", "::", "[::]"].includes(host)) host = "127.0.0.1";
      if (host === "::1") host = "[::1]";
      const endpoint = localURL(`ws://${host}:${node.port}`);
      endpoint.pathname = node.path || "/";
      return this.writePlugin(row, {
        ...row.config,
        selfId: input.uin,
        endpoint: endpoint.href,
        token: node.accessToken || "",
      });
    });
  }
  destroy() {
    this.koishi.close();
    this.snow.token = "";
  }
}
module.exports = { ManagementService };
