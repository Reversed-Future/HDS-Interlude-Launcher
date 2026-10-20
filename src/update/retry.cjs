// Retry public GitHub requests only. Never change the user's global proxy.
function withDirectRetry(normal, direct) {
  return async (url, options = {}) => {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      ![
        "api.github.com",
        "github.com",
        "release-assets.githubusercontent.com",
      ].includes(parsed.hostname)
    )
      return normal(url, options);
    let response;
    let failure;
    try {
      response = await normal(url, options);
      if (![403, 429].includes(response.status)) return response;
    } catch (error) {
      failure = error;
    }
    if (options.signal?.aborted) throw options.signal.reason;
    try {
      const retried = await direct(url, options);
      if (
        retried.ok ||
        (options.redirect === "manual" &&
          [301, 302, 303, 307, 308].includes(retried.status))
      ) {
        await response?.body?.cancel();
        return retried;
      }
      if (!response) return retried;
      await retried.body?.cancel();
    } catch {
      /* Keep the original response so its error remains actionable. */
    }
    if (options.signal?.aborted) throw options.signal.reason;
    if (response) return response;
    throw failure;
  };
}
module.exports = { withDirectRetry };
