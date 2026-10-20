const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { createManagementFixture } = require("./management-fixture.cjs");
const { ManagementService } = require("../src/management/service.cjs");
const { localURL } = require("../src/management/transport.cjs");
const fields = require("../src/management/fields.cjs");

test("native management authenticates, preserves unrelated settings, backs up, rejects stale edits and syncs OneBot", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hds-native-"));
  const fixture = createManagementFixture(directory);
  const address = await fixture.start();
  const config = {
    koishiUrl: address + "/console",
    snowlumaUrl: address,
    koishiDir: directory,
    snowlumaDir: directory,
  };
  const service = new ManagementService(
    { load: () => config },
    { busy: new Set(), batchStarting: false },
    { busy: false },
  );
  try {
    assert.equal((await service.koishiStatus()).loginRequired, true);
    await assert.rejects(
      service.koishiLogin({ username: "admin", password: "wrong" }),
      /拒绝/,
    );
    const status = await service.koishiLogin({
      username: "admin",
      password: "test-password",
    });
    const row = status.plugins.find((row) => row.name === "hds-interlude");
    const editor = await service.editor(row.id);
    const before = fs.readFileSync(path.join(directory, "koishi.yml"));
    await service.saveEditor({
      id: editor.id,
      revision: editor.revision,
      changes: { "storyDefaults.characterName": "新的角色" },
      arrays: {
        "model.providers": [{ index: 0, changes: { model: "new-model" } }],
      },
    });
    assert.deepEqual(
      fs.readFileSync(path.join(directory, "koishi.yml.bak")),
      before,
    );
    const saved =
      fixture.state.config.plugins["group:app"]["hds-interlude:test"];
    assert.equal(saved.storyDefaults.characterName, "新的角色");
    assert.equal(saved.storyDefaults.style, "保留的高级字段");
    assert.deepEqual(saved.model.providers[0].extraHeaders, {
      "X-Preserve": "yes",
    });
    assert.equal(saved.model.providers[0].apiKey, "demo-secret");
    assert.deepEqual(saved.hiddenExtension, { keep: true });
    await assert.rejects(
      service.saveEditor({
        id: editor.id,
        revision: editor.revision,
        changes: {},
      }),
      /其他页面/,
    );
    const current = await service.editor(row.id);
    await assert.rejects(
      service.saveEditor({
        id: row.id,
        revision: current.revision,
        changes: {},
        arrays: {
          "model.providers": [{ index: 0, changes: { useForEmbedding: true } }],
        },
      }),
      /专用向量/,
    );
    const help = (await service.koishiStatus()).plugins.find(
      (row) => row.name === "help",
    );
    await service.toggle({ ...help, enabled: false });
    assert.ok(
      Object.hasOwn(fixture.state.config.plugins["group:app"], "~help:test"),
    );
    const consoleRow = (await service.koishiStatus()).plugins.find(
      (row) => row.name === "console",
    );
    await assert.rejects(
      service.toggle({ ...consoleRow, enabled: false }),
      /高级管理/,
    );
    assert.equal((await service.snowStatus()).loginRequired, true);
    await assert.rejects(service.snowLogin({ password: "wrong" }), /密码错误/);
    assert.equal(
      (await service.snowLogin({ password: "test-password" })).accounts[0].uin,
      "123456",
    );
    const snow = await service.snowEditor("123456");
    await service.saveSnow({
      ...snow,
      rows: [{ index: 0, changes: { port: 3101 } }],
    });
    assert.deepEqual(fixture.state.snow.networks.httpClients, [
      { name: "untouched" },
    ]);
    assert.equal(fixture.state.snow.networks.wsServers[0].custom, "preserve");
    await assert.rejects(service.saveSnow({ ...snow, rows: [] }), /已变化/);
    const next = await service.snowEditor("123456");
    const adapter = (await service.koishiStatus()).plugins.find(
      (row) => row.name === "adapter-onebot",
    );
    await service.syncConnection({
      uin: next.uin,
      revision: next.revision,
      index: 0,
      id: adapter.id,
      koishiRevision: adapter.revision,
    });
    const connection =
      fixture.state.config.plugins["group:app"]["adapter-onebot:test"];
    assert.equal(connection.endpoint, "ws://127.0.0.1:3101/");
    assert.equal(connection.token, "demo-connection");
    assert.equal(connection.keep, true);
    assert.ok(!JSON.stringify(status).includes("demo-secret"));
    await service.snowLogout();
    assert.equal((await service.snowStatus()).loginRequired, true);
  } finally {
    service.destroy();
    await fixture.close();
  }
});

test("management rejects foreign URLs, unknown fields, invalid ranges and duplicate row indexes", () => {
  assert.throws(() => localURL("https://example.com"), /本机/);
  assert.throws(() => localURL("http://user:pass@127.0.0.1"), /本机/);
  assert.throws(
    () => fields.patch({}, { "constructor.prototype": 1 }, fields.onebot),
    /不支持/,
  );
  assert.throws(() => fields.patch({}, { port: 0 }, fields.snow), /允许范围/);
  assert.throws(
    () =>
      fields.patchRows(
        [{}],
        [
          { index: 0, changes: {} },
          { index: 0, changes: {} },
        ],
        fields.snow,
      ),
    /列表已经变化/,
  );
  assert.throws(
    () =>
      fields.validateEmbedding({
        model: { providers: [{ useForEmbedding: true }] },
      }),
    /专用向量/,
  );
  assert.doesNotThrow(() =>
    fields.validateEmbedding({
      model: { providers: [{ useForEmbedding: true, useForMain: false }] },
    }),
  );
});
