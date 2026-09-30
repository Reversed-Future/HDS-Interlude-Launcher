const { stripVTControlCharacters } = require("node:util");

class LogStore {
  constructor(limit = 3000) {
    this.limit = limit;
    this.rows = { koishi: [], snowluma: [] };
    this.sequence = 0;
  }
  append(service, stream, text) {
    if (!this.rows[service]) return;
    const entry = {
      id: ++this.sequence,
      time: Date.now(),
      stream,
      text: stripVTControlCharacters(text).replace(/\r/g, "").slice(0, 16000),
    };
    this.rows[service].push(entry);
    if (this.rows[service].length > this.limit)
      this.rows[service].splice(0, this.rows[service].length - this.limit);
    return entry;
  }
  get(service) {
    if (!this.rows[service]) throw new Error("未知日志来源。");
    return this.rows[service];
  }
  clear(service) {
    this.get(service);
    this.rows[service] = [];
  }
}

function captureLines(stream, encoding, onLine) {
  const decoder = new TextDecoder(encoding);
  let pending = "";
  function drain(text, final = false) {
    pending += text;
    const lines = pending.split(/\r?\n|\r(?!$)/);
    pending = lines.pop();
    for (const line of lines) onLine(line);
    // Bound partial output from programs that never write a newline.
    while (pending.length > 16000) {
      onLine(pending.slice(0, 16000));
      pending = pending.slice(16000);
    }
    if (final && pending) {
      onLine(pending);
      pending = "";
    }
  }
  stream.on("data", (chunk) => drain(decoder.decode(chunk, { stream: true })));
  stream.on("end", () => drain(decoder.decode(), true));
}

module.exports = { LogStore, captureLines };
