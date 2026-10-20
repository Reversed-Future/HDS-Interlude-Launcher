const { session } = require("electron");
const { fetchOfficial } = require("../setup/electron-fetch.cjs");
const { withDirectRetry } = require("./retry.cjs");
let direct;
const fetchUpdate = withDirectRetry(fetchOfficial, async (url, options) => {
  if (!direct)
    direct = (async () => {
      const isolated = session.fromPartition("launcher-public-downloads");
      await isolated.setProxy({ mode: "direct" });
      return isolated;
    })().catch((error) => {
      direct = null;
      throw error;
    });
  return fetchOfficial(url, options, await direct);
});
module.exports = { fetchUpdate };
