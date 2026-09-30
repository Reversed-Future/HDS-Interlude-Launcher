const { net } = require("electron");

// net.fetch cancels manual redirects instead of exposing their response. Use the
// documented ClientRequest redirect event while preserving Chromium/system proxy support.
function fetchOfficial(url, options = {}) {
  if (options.redirect !== "manual") return net.fetch(url, options);
  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: "GET", redirect: "manual" });
    let controller;
    let ended = false;
    const fail = (error) => {
      reject(error);
      if (controller && !ended) {
        ended = true;
        controller.error(error);
      }
    };
    const abort = () => {
      fail(options.signal.reason);
      request.abort();
    };
    request.on("error", fail);
    request.on("close", () =>
      options.signal?.removeEventListener("abort", abort),
    );
    request.on("redirect", (status, method, redirectUrl) => {
      resolve(
        new Response(null, { status, headers: { location: redirectUrl } }),
      );
      request.abort();
    });
    request.on("response", (response) => {
      const body = new ReadableStream({
        start(stream) {
          controller = stream;
          response.on("end", () => {
            if (!ended) {
              ended = true;
              stream.close();
            }
          });
          response.on("error", fail);
          response.on("aborted", () => fail(new Error("下载连接已中断。")));
          response.on("data", (chunk) => {
            if (!ended) stream.enqueue(chunk);
          });
        },
        cancel() {
          ended = true;
          request.abort();
        },
      });
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers))
        for (const item of Array.isArray(value) ? value : [value])
          headers.append(name, item);
      resolve(new Response(body, { status: response.statusCode, headers }));
    });
    for (const [name, value] of Object.entries(options.headers || {}))
      request.setHeader(name, value);
    if (options.signal?.aborted) return abort();
    options.signal?.addEventListener("abort", abort, { once: true });
    request.end();
  });
}
module.exports = { fetchOfficial };
