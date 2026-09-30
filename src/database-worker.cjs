const { parentPort, workerData } = require("node:worker_threads");
const { listStories, readEntries } = require("./database.cjs");
try {
  const result =
    workerData.operation === "stories"
      ? listStories(workerData.file)
      : readEntries(workerData.file, workerData.options);
  parentPort.postMessage({ ok: true, value: result });
} catch (error) {
  parentPort.postMessage({ ok: false, error: error.message });
}
