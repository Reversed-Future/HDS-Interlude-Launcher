const { createHash } = require("node:crypto");
const protectedNames = new Set(["console", "config", "server", "auth"]);
function fingerprint(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function plugins(config) {
  const list = [];
  function visit(group, parent = "", ancestry = [], blocked = false) {
    for (const [rawKey, value] of Object.entries(group || {})) {
      if (rawKey.startsWith("$")) continue;
      const enabled = !rawKey.startsWith("~");
      const key = enabled ? rawKey : rawKey.slice(1);
      const name = key.split(":", 1)[0];
      const id = JSON.stringify([...ancestry, rawKey]);
      if (name === "group")
        visit(
          value,
          key.slice(name.length + 1),
          [...ancestry, rawKey],
          blocked || !enabled,
        );
      else
        list.push({
          id,
          key,
          parent,
          name,
          enabled,
          blocked,
          protected: protectedNames.has(name),
          config: value || {},
        });
    }
  }
  visit(config?.plugins);
  return list;
}
module.exports = { plugins, fingerprint };
