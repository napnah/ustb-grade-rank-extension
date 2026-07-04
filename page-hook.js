(function () {
  "use strict";

  const TARGET_PATH = "/cjgl/grcjcx/grcjcx";
  const MESSAGE_SOURCE = "ustb-grade-rank-extension";

  function shouldCapture(input) {
    try {
      const url =
        typeof input === "string"
          ? input
          : input && typeof input.url === "string"
            ? input.url
            : String(input || "");
      return url.includes(TARGET_PATH);
    } catch (_error) {
      return false;
    }
  }

  function publishResponse(text, url) {
    if (!text) return;

    let payload = text;
    try {
      payload = JSON.parse(text);
    } catch (_error) {
      // Keep the raw text. The content script can ignore non-JSON payloads.
    }

    window.postMessage(
      {
        source: MESSAGE_SOURCE,
        type: "GRADES_RESPONSE",
        url,
        payload
      },
      window.location.origin
    );
  }

  function hookFetch() {
    if (typeof window.fetch !== "function") return;

    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      const request = args[0];

      if (shouldCapture(request) || shouldCapture(response && response.url)) {
        try {
          const cloned = response.clone();
          cloned
            .text()
            .then((text) => publishResponse(text, cloned.url || String(request || "")))
            .catch(() => {});
        } catch (_error) {
          // Do not affect the host page when response cloning fails.
        }
      }

      return response;
    };
  }

  function hookXhr() {
    if (typeof window.XMLHttpRequest !== "function") return;

    const originalOpen = window.XMLHttpRequest.prototype.open;
    const originalSend = window.XMLHttpRequest.prototype.send;

    window.XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this.__ustbGradeRankUrl = url;
      return originalOpen.call(this, method, url, ...rest);
    };

    window.XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener("load", function () {
        const url = this.responseURL || this.__ustbGradeRankUrl || "";
        if (!shouldCapture(url)) return;

        try {
          const responseType = this.responseType || "text";
          if (responseType !== "text" && responseType !== "" && responseType !== "json") return;

          const text =
            responseType === "json"
              ? JSON.stringify(this.response)
              : this.responseText || String(this.response || "");
          publishResponse(text, url);
        } catch (_error) {
          // Ignore malformed or inaccessible XHR responses.
        }
      });

      return originalSend.apply(this, args);
    };
  }

  if (!window.__ustbGradeRankHooked) {
    window.__ustbGradeRankHooked = true;
    hookFetch();
    hookXhr();
  }
})();
