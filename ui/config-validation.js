import { MODES } from "./config-model.js";
export function issuesFor(data, step) {
  const issues = [];
  if (step === 0) {
    if (!/^\d+$/.test(data.botQQ)) issues.push("填写机器人 QQ 号");
    if (
      !/^\d+$/.test(data.wsPort) ||
      Number(data.wsPort) < 1 ||
      Number(data.wsPort) > 65535
    )
      issues.push("端口必须为 1–65535");
    if (!data.wsToken.trim()) issues.push("填写或生成连接 Token");
  }
  if (step === 1) {
    if (!data.providers.length) issues.push("添加至少一条模型连接");
    if (!data.providers.some((p) => p.useMain))
      issues.push("至少一条连接需要承担主叙事");
    data.providers.forEach((p, index) => {
      const name = `连接 ${index + 1}`;
      if (!Object.hasOwn(MODES, p.mode)) issues.push(name + "的服务商无效");
      if (!p.apiKey.trim()) issues.push(name + "缺少 API Key");
      if (!p.model.trim()) issues.push(name + "缺少模型名称");
      if (
        p.useEmbedding &&
        [
          p.useMain,
          p.useCompaction,
          p.useAlter,
          p.useStickers,
          p.useVision,
        ].some(Boolean)
      )
        issues.push(name + "的 Embedding 必须独占，不能同时用于其他功能");
      if (p.mode === "openai-compatible") {
        try {
          const url = new URL(p.endpoint);
          if (!["http:", "https:"].includes(url.protocol)) throw new Error();
        } catch {
          issues.push(name + "需要有效的 HTTP(S) 接口地址");
        }
      }
      for (const key of [
        "temperature",
        "topP",
        "compTemperature",
        "compTopP",
        "alterTemperature",
        "alterTopP",
      ])
        if (!Number.isFinite(Number(p[key])) || p[key] === "")
          issues.push(name + "的采样参数必须是数字");
    });
    if (
      data.vision &&
      data.visionMode === "sidecar" &&
      !data.providers.some((p) => p.useVision)
    )
      issues.push("侧端识图需要一条勾选“侧端识图”的模型连接");
  }
  if (step === 2) {
    if (!data.charName.trim()) issues.push("填写角色名");
    if (!data.charProfile.trim()) issues.push("填写角色设定");
    if (!/^\d+$/.test(data.userQQ)) issues.push("填写白名单 QQ 号");
  }
  if (step === 3) {
    if (!data.world.trim()) issues.push("填写世界背景");
    for (const [key, min, max, label] of [
      ["debounce", 0, 15, "消息合并等待"],
      ["typing", 1, 60, "打字速度"],
      ["autoMin", 5, 240, "自动推进间隔"],
    ])
      if (
        data[key] === "" ||
        !Number.isFinite(Number(data[key])) ||
        Number(data[key]) < min ||
        Number(data[key]) > max
      )
        issues.push(`${label}需在 ${min}–${max} 范围内`);
    if (data.stickers && !data.providers.some((p) => p.useStickers))
      issues.push("表情包库需要一条勾选“表情包描述”的模型连接");
  }
  return issues;
}
export function allIssues(data) {
  return [0, 1, 2, 3].flatMap((step) => issuesFor(data, step));
}
