const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {
  readConnection,
  probeConnection,
  waitForConnection,
} = require("../src/startup.cjs");
const { detectWebUI } = require("../src/webui-address.cjs");
const { ProcessManager } = require("../src/processes.cjs");
const { LogStore } = require("../src/logs.cjs");
const { onebotServer } = require("./onebot-fixture.cjs");

test("read exact enabled OneBot configuration, reject ambiguity and remote targets", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "launcher-startup-"));
  const write = (text) =>
    fs.writeFileSync(path.join(directory, "koishi.yml"), text);
  write(
    'plugins:\n  group:adapter:\n    ~adapter-onebot:disabled: {}\n    adapter-onebot:abc:\n      protocol: ws\n      selfId: "123456"\n      endpoint: ws://127.0.0.1:3001/\n      token: test-only\n',
  );
  const connection = readConnection(directory);
  assert.equal(connection.port, "3001");
  assert.equal(
    new URL(connection.url).searchParams.get("access_token"),
    "test-only",
  );
  write(
    'plugins:\n  adapter-onebot: {protocol: ws, selfId: 123456, endpoint: "ws://example.com:3001"}\n',
  );
  assert.throws(() => readConnection(directory), /本机/);
  write(
    "plugins:\n  adapter-onebot:a: {protocol: ws}\n  adapter-onebot:b: {protocol: ws}\n",
  );
  assert.throws(() => readConnection(directory), /一个/);
});

test("readiness requires authenticated matching online account, handles cancellation and timeout", async () => {
  const state = { online: false };
  const server = onebotServer(state);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const connection = {
    url: `ws://127.0.0.1:${server.address().port}/`,
    selfId: "123456",
    port: String(server.address().port),
  };
  const signal = new AbortController().signal;
  try {
    assert.equal(await probeConnection(connection, signal, 70), false);
    state.online = true;
    assert.equal(await probeConnection(connection, signal), true);
    state.selfId = 654321;
    await assert.rejects(probeConnection(connection, signal), /不一致/);
    state.selfId = 123456;
    state.authorized = false;
    assert.equal(await probeConnection(connection, signal), false);
    state.authorized = true;
    state.silent = true;
    const abort = new AbortController();
    const pending = probeConnection(connection, abort.signal);
    abort.abort(new Error("test cancelled"));
    await assert.rejects(pending, /test cancelled/);
    await assert.rejects(
      waitForConnection(connection, signal, { timeout: 90, interval: 10 }),
      /超时/,
    );
  } finally {
    await server.dispose();
  }
});

test("startAll gates Koishi behind login, and cancellation never starts it", async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "launcher-sequence-"),
  );
  fs.writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify({ scripts: { start: "node fixture.cjs" } }),
  );
  fs.writeFileSync(path.join(directory, "launcher.bat"), "");
  fs.writeFileSync(path.join(directory, "QQ.exe"), "");
  const state = { online: false };
  const server = onebotServer(state);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  fs.writeFileSync(
    path.join(directory, "koishi.yml"),
    `plugins:\n  adapter-onebot: {protocol: ws, selfId: 123456, endpoint: "ws://127.0.0.1:${server.address().port}"}\n`,
  );
  const config = {
    koishiDir: directory,
    snowlumaDir: directory,
    qqExe: path.join(directory, "QQ.exe"),
  };
  const manager = new ProcessManager(new LogStore());
  const calls = [];
  manager.start = async (id) => {
    calls.push(id);
    if (id === "snowluma") manager.children.set(id, {});
  };
  try {
    const ready = new Promise((resolve) => {
      const listener = (value) => {
        if (!value.message.includes("无需手动")) return;
        manager.off("startup", listener);
        resolve();
      };
      manager.on("startup", listener);
    });
    const pending = manager.startAll(config);
    await ready;
    assert.deepEqual(calls, ["qq", "snowluma"]);
    state.online = true;
    await pending;
    assert.deepEqual(calls, ["qq", "snowluma", "koishi"]);
    calls.length = 0;
    state.online = false;
    const cancelled = manager.startAll(config);
    setTimeout(() => manager.cancelStartup(), 150);
    await assert.rejects(cancelled, /取消/);
    assert.ok(!calls.includes("koishi"));
    assert.equal(manager.batchStarting, false);
    calls.length = 0;
    manager.start = async (id) => {
      calls.push(id);
      if (id === "snowluma") throw new Error("fixture launch failure");
    };
    await assert.rejects(manager.startAll(config), /fixture launch failure/);
    assert.deepEqual(calls, ["qq", "snowluma"]);
  } finally {
    await server.dispose();
  }
});

test("WebUI discovery uses upstream startup messages and rejects unrelated or secret URLs", () => {
  assert.equal(
    detectWebUI(
      "koishi",
      "2026-10-20 [I] console webui is available at \u001b[34mhttp://127.0.0.1:5141/admin\u001b[0m",
    ),
    "http://127.0.0.1:5141/admin",
  );
  assert.equal(
    detectWebUI(
      "snowluma",
      "13:01:00 INFO   [WebUI] listening http://0.0.0.0:5100",
    ),
    "http://127.0.0.1:5100/",
  );
  for (const text of [
    "http://127.0.0.1:5140",
    "[I] console webui is available at https://example.com",
    "[I] console webui is available at http://127.0.0.1/?token=secret",
  ])
    assert.equal(detectWebUI("koishi", text), null);
});
