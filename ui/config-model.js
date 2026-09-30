// Defaults and YAML fields from the user's rc28 tutorial. UI is implemented separately.
export const MODES = {
  "openai-compatible": {
    label: "OpenAI 兼容接口（中转站 / 自建）",
    model: "",
    reg: "任意 OpenAI 兼容服务商（中转站、自建网关等），地址以 /v1/chat/completions 结尾",
  },
  "zhipu-official": {
    label: "智谱 GLM 官方",
    model: "glm-5.3-flash",
    reg: "到 open.bigmodel.cn 注册并创建 API Key，GLM 系列新用户有免费额度",
  },
  "openai-official": {
    label: "OpenAI 官方",
    model: "gpt-5-mini",
    reg: "到 platform.openai.com 创建 API Key",
  },
  "deepseek-official": {
    label: "DeepSeek 官方",
    model: "deepseek-chat",
    reg: "到 platform.deepseek.com 创建 API Key",
  },
  "moonshot-official": {
    label: "Kimi / Moonshot 官方",
    model: "kimi-k2.5",
    reg: "到 platform.moonshot.cn 创建 API Key",
  },
  "dashscope-official": {
    label: "阿里云百炼官方（通义千问）",
    model: "qwen-plus",
    reg: "到 bailian.console.aliyun.com 创建 API Key（百炼 / 通义千问）",
  },
  "siliconflow-official": {
    label: "硅基流动官方",
    model: "Qwen/Qwen3-8B",
    reg: "到 siliconflow.cn 注册并创建 API Key",
  },
  openrouter: {
    label: "OpenRouter",
    model: "openai/gpt-5-mini",
    reg: "到 openrouter.ai 创建 API Key，一个 Key 调用各家模型",
  },
  "gemini-openai": {
    label: "Google Gemini（OpenAI 兼容）",
    model: "gemini-3-flash",
    reg: "到 aistudio.google.com 创建 API Key",
  },
};

export function newProvider(isFirst) {
  return {
    label: "",
    mode: "openai-compatible",
    apiKey: "",
    model: "",
    endpoint: "",
    reasoning: "high",
    deepseekThinking: "disabled",
    deepseekReasoning: "low",
    region: "beijing",
    temperature: "0.75",
    topP: "0.88",
    compTemperature: "0.3",
    compTopP: "1.0",
    alterTemperature: "0.3",
    alterTopP: "1.0",
    responseFormat: "json-object",
    useMain: !!isFirst,
    useCompaction: !!isFirst,
    useAlter: !!isFirst,
    useEmbedding: false,
    useStickers: false,
    useVision: false,
  };
}

export const DEFAULTS = {
  wsPort: "3001",
  wsToken: "",
  botQQ: "",
  vision: false,
  visionMode: "native",
  visionDetail: "auto",
  charName: "",
  charProfile:
    "18岁的女孩，刚刚高考结束，正准备开始大学生活。平时喜欢熬夜，有点内向，容易胆怯，但心态平和；生活比较丰富，喜欢尝试一些能力范围内没试过的东西，对想干的事情非常有行动力。线上聊天话很少、发言简洁、有点喜欢吐槽，打字不习惯加标点。",
  world: "现实社会，主角平常生活在中国",
  location: "",
  cast: "",
  timezone: "Asia/Shanghai",
  userQQ: "",
  userLabel: "",
  userProfile: "",
  userRelationship: "",
  debounce: "2",
  typing: "8",
  autoMin: "40",
  mainResponseFormat: "json-object",
  mainStreamingMode: "off",
  quoteReply: true,
  messageReactions: true,
  nativeFaces: true,
  stickers: false,
  stickerFormat: "json-object",
};

export function generateYaml(data) {
  function y(v) {
    return JSON.stringify(String(v == null ? "" : v));
  }

  function generateToken() {
    var bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    var s = btoa(String.fromCharCode.apply(null, bytes));
    return s.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  /* ══════════ YAML 生成 ══════════ */
  function providerYaml(indent) {
    var p = indent;
    var lines = [p + "providers:"];
    data.providers.forEach(function (pv, i) {
      var n = i + 1;
      var mode = pv.mode || "openai-compatible";
      lines.push(p + "  - id: " + y("p" + n));
      lines.push(p + "    label: " + y(pv.label || "模型连接 " + n));
      lines.push(p + "    enabled: true");
      lines.push(p + "    mode: " + y(mode));
      if (mode === "openai-compatible") {
        lines.push(
          p + "    endpoint: " + y(pv.endpoint || "<在此填入接口地址>"),
        );
        lines.push(p + "    apiKey: " + y(pv.apiKey || "<在此填入APIKey>"));
        lines.push(p + "    model: " + y(pv.model || "<模型名>"));
        if (pv.useMain) {
          lines.push(
            p + "    temperature: " + (parseFloat(pv.temperature) || 0.75),
          );
          lines.push(p + "    topP: " + (parseFloat(pv.topP) || 0.88));
        }
      } else {
        lines.push(p + "    apiKey: " + y(pv.apiKey || "<在此填入APIKey>"));
        lines.push(p + "    model: " + y(pv.model || MODES[mode].model));
        if (mode === "zhipu-official") {
          lines.push(p + "    reasoningEffort: " + y(pv.reasoning || "high"));
        }
        if (mode === "deepseek-official") {
          lines.push(
            p +
              "    deepseekThinking: " +
              y(pv.deepseekThinking === "enabled" ? "enabled" : "disabled"),
          );
          if (pv.deepseekThinking === "enabled")
            lines.push(
              p +
                "    deepseekReasoningEffort: " +
                y(pv.deepseekReasoning || "low"),
            );
        }
        if (mode === "dashscope-official") {
          lines.push(p + "    dashscopeRegion: " + y(pv.region || "beijing"));
        }
      }
      lines.push(
        p + "    responseFormat: " + y(pv.responseFormat || "json-object"),
      );
      lines.push(p + "    useForMain: " + (pv.useMain ? "true" : "false"));
      lines.push(
        p + "    useForCompaction: " + (pv.useCompaction ? "true" : "false"),
      );
      lines.push(p + "    useForAlter: " + (pv.useAlter ? "true" : "false"));
      lines.push(
        p + "    useForEmbedding: " + (pv.useEmbedding ? "true" : "false"),
      );
      lines.push(
        p + "    useForStickers: " + (pv.useStickers ? "true" : "false"),
      );
      lines.push(p + "    useForVision: " + (pv.useVision ? "true" : "false"));
    });
    return lines.join("\n");
  }

  function modelYaml(indent) {
    var p = indent;
    var L = [p + "model:"];
    L.push(providerYaml(p + "  "));
    L.push(
      p +
        "  mainResponseFormat: " +
        y(
          data.mainResponseFormat === "prompt-only"
            ? "prompt-only"
            : "json-object",
        ),
    );
    L.push(
      p +
        "  mainStreamingMode: " +
        y(data.mainStreamingMode === "experimental" ? "experimental" : "off"),
    );
    L.push(p + "  failover:");
    L.push(p + "    enabled: true");
    L.push(p + '    strategy: "priority"');
    L.push(p + "    maxAttemptsPerProvider: 2");
    L.push(p + "    cooldownMinutes: 5");
    if (data.vision) {
      L.push(p + "  vision:");
      L.push(p + "    enabled: true");
      L.push(
        p +
          "    mode: " +
          y(data.visionMode === "sidecar" ? "sidecar" : "native"),
      );
      L.push(
        p +
          "    detail: " +
          y(
            ["low", "high", "auto"].indexOf(data.visionDetail) >= 0
              ? data.visionDetail
              : "auto",
          ),
      );
    }
    // 勾选了 Embedding 用途才开启；否则保持默认关闭
    if (
      data.providers.some(function (pv) {
        return pv.useEmbedding;
      })
    ) {
      L.push(p + "  embedding:");
      L.push(p + "    enabled: true");
    }
    // 后台压缩：取第一条压缩连接的采样参数；没有则显式关闭
    var compPv = data.providers.filter(function (pv) {
      return pv.useCompaction;
    })[0];
    L.push(p + "  compaction:");
    if (compPv) {
      L.push(p + "    enabled: true");
      L.push(
        p + "    temperature: " + (parseFloat(compPv.compTemperature) || 0.3),
      );
      L.push(p + "    topP: " + (parseFloat(compPv.compTopP) || 1.0));
    } else {
      L.push(p + "    enabled: false");
    }
    return L.join("\n");
  }

  function adapterYaml(indent) {
    var p = indent;
    var port = data.wsPort || "3001";
    return [
      p + "adapter-onebot:",
      p + "  selfId: " + y(data.botQQ || "<机器人QQ号>"),
      p + '  protocol: "ws"',
      p + "  endpoint: " + y("ws://127.0.0.1:" + port),
      p + "  token: " + y(data.wsToken || "<第3步生成的Token>"),
    ].join("\n");
  }

  function hdsiYaml(indent) {
    var p = indent;
    var L = [];
    L.push(p + "hds-interlude:");
    L.push(modelYaml(p + "  "));
    L.push(p + "  storyDefaults:");
    L.push(p + "    characterName: " + y(data.charName || "<角色名>"));
    L.push(p + "    characterProfile: " + y(data.charProfile || "<角色设定>"));
    L.push(p + "    world: " + y(data.world || "现实社会，主角平常生活在中国"));
    L.push(p + "    location: " + y(data.location || ""));
    L.push(
      p +
        "    style: " +
        y(
          "当代现实主义生活剧。主角拥有丰富、具体且持续变化的个人生活；配角也有各自的节奏、立场与情绪。关系在日常互动和小事件中缓慢发展，生活常常留下未完成但真实感的余波。",
        ),
    );
    L.push(p + "    supportingCast: " + y(data.cast || ""));
    L.push(p + "    userProfile: " + y("一位普通网友"));
    L.push(p + "    relationship: " + y("该用户与主角不经常联系"));
    L.push(p + "    timezone: " + y(data.timezone || "Asia/Shanghai"));
    L.push(p + "  onebot:");
    L.push(p + "    enabled: true");
    L.push(p + "    ignoreSelfMessages: true");
    L.push(p + "    botAccounts:");
    L.push(p + "      - qq: " + y(data.botQQ || "<机器人QQ号>"));
    L.push(p + "        enabled: true");
    L.push(p + "    userAccounts:");
    L.push(p + "      - qq: " + y(data.userQQ || "<你的QQ号>"));
    L.push(p + "        label: " + y(data.userLabel || "用户1"));
    L.push(p + "        enabled: true");
    L.push(p + "        profile: " + y(data.userProfile || "一位普通网友"));
    L.push(
      p +
        "        relationship: " +
        y(data.userRelationship || "该用户与主角不经常联系"),
    );
    L.push(p + "  runtime:");
    L.push(p + "    autoCreate: true");
    L.push(p + "    contextEntryLimit: 35");
    L.push(p + "    contextTimeWindowMinutes: 45");
    L.push(
      p + "    userMessageDebounceSeconds: " + (parseFloat(data.debounce) || 0),
    );
    L.push(
      p + "    typingCharactersPerSecond: " + (parseInt(data.typing, 10) || 8),
    );
    L.push(p + "    typingJitterRatio: 0.3");
    L.push(p + "    splitReplyMessages: true");
    L.push(p + "    autoAdvanceEnabled: true");
    L.push(
      p + "    autoAdvanceIntervalMinutes: " + (parseFloat(data.autoMin) || 40),
    );
    L.push(p + "    allowProactiveMessages: true");
    L.push(p + "    restWindows:");
    L.push(p + '      - label: "night sleep"');
    L.push(p + '        start: "23:00"');
    L.push(p + '        end: "07:00"');
    L.push(p + "        enabled: true");
    L.push(p + "        minIntervalMinutes: 120");
    L.push(p + "        maxIntervalMinutes: 240");
    L.push(p + "  schedulePreplan:");
    L.push(p + "    enabled: true");
    L.push(p + "    horizonDays: 14");
    L.push(p + "    reviewAfterLocalHour: 3");
    L.push(p + "    anchorAutoAdvance: true");
    // 聊天互动（引用回复 / 贴表情 / 原生小表情）
    var anyChat = data.quoteReply || data.messageReactions || data.nativeFaces;
    L.push(p + "  chatActions:");
    L.push(p + "    enabled: " + (anyChat ? "true" : "false"));
    L.push(p + '    platforms: ["qq"]');
    L.push(p + "    quoteReply: " + (data.quoteReply ? "true" : "false"));
    L.push(
      p + "    messageReactions: " + (data.messageReactions ? "true" : "false"),
    );
    L.push(p + "    nativeFaces: " + (data.nativeFaces ? "true" : "false"));
    L.push(p + "  sharedStory:");
    L.push(p + "    autoEnrollParticipants: true");
    // Alter System：取第一条 Alter 连接的采样参数；没有则显式关闭（其默认为开启）
    var alterPv = data.providers.filter(function (pv) {
      return pv.useAlter;
    })[0];
    L.push(p + "  alterSystem:");
    if (alterPv) {
      L.push(p + "    enabled: true");
      L.push(
        p + "    temperature: " + (parseFloat(alterPv.alterTemperature) || 0.3),
      );
      L.push(p + "    topP: " + (parseFloat(alterPv.alterTopP) || 1.0));
    } else {
      L.push(p + "    enabled: false");
    }
    // 本地表情包库需要用户开关与视觉描述模型同时满足
    if (
      data.stickers &&
      data.providers.some(function (pv) {
        return pv.useStickers;
      })
    ) {
      L.push(p + "  stickers:");
      L.push(p + "    enabled: true");
      L.push(
        p +
          "    descriptionResponseFormat: " +
          y(
            data.stickerFormat === "prompt-only"
              ? "prompt-only"
              : "json-object",
          ),
      );
    }
    L.push(p + "  logging:");
    L.push(p + '    level: "info"');
    L.push(p + '    verbosity: "standard"');
    return L.join("\n");
  }

  function fullYaml() {
    return [
      "# Koishi 配置文件 —— 由 HDS Interlude 1.0.1-rc28 部署向导生成",
      "# 放置位置：Koishi 项目根目录（与 package.json 同级），覆盖前请备份原文件",
      "# ⚠ 内含 API Key 与 Token，请勿分享或上传到公开仓库",
      "",
      "plugins:",
      "  group:server:",
      "    server:",
      "      port: 5140",
      "      maxPort: 5149",
      "  group:basic:",
      "    commands: {}",
      "    help: {}",
      "    http: {}",
      "    locales: {}",
      "    proxy-agent: {}",
      "    rate-limit: {}",
      "    telemetry: {}",
      "  group:console:",
      "    actions: {}",
      "    analytics: {}",
      "    config: {}",
      "    console:",
      "      open: true",
      "    dataview: {}",
      "    explorer: {}",
      "    insight: {}",
      "    market:",
      "      search:",
      '        endpoint: "https://registry.koishi.chat/index.json"',
      "      registry:",
      '        endpoint: ""',
      "    logger: {}",
      "    notifier: {}",
      "    oobe: {}",
      "    sandbox: {}",
      "    status: {}",
      "    theme-vanilla: {}",
      "  group:storage:",
      "    database-sqlite:",
      "      path: data/koishi.db",
      "  group:adapter:",
      adapterYaml("    "),
      "  group:hdsi:",
      hdsiYaml("    "),
      "",
    ].join("\n");
  }

  return fullYaml();
}
