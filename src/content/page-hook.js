// Runs in MAIN world at document_start to hook window.fetch and XMLHttpRequest
// before LeetCode scripts execute. Emits a window message when an Accepted
// submission is detected.

(function () {
  const seenSubmissions = new Set();

  function notifyAccepted(submissionId) {
    if (!submissionId) return;
    const id = String(submissionId).trim();
    if (!id || seenSubmissions.has(id)) return;
    seenSubmissions.add(id);

    console.log(`[LC Sync] 🎉 Accepted submission detected: #${id}`);
    window.postMessage({ source: "lc-sync", submissionId: id }, "*");
  }

  function handleSubmissionCheck(url, data) {
    if (!data || typeof data !== "object") return;

    // LeetCode check endpoint format:
    // GET /submissions/detail/<id>/check/
    // Response: { state: "SUCCESS", status_code: 10, status_msg: "Accepted", ... }
    const match = String(url).match(/\/submissions\/detail\/(\d+)\/check\/?/i);
    const subId = match ? match[1] : (data.submission_id || data.submissionId || data.id);

    const state = String(data.state || "").toUpperCase();
    const statusMsg = String(data.status_msg || data.status_display || "").toLowerCase();
    const statusCode = Number(data.status_code);

    const isSuccess = state === "SUCCESS";
    const isAccepted =
      statusMsg === "accepted" ||
      statusCode === 10 ||
      (data.run_success === true && data.total_correct && data.total_correct === data.total_testcases);

    if (isSuccess && isAccepted && subId) {
      notifyAccepted(subId);
    }
  }

  function handleGraphQLResponse(data) {
    if (!data || !data.data || typeof data.data !== "object") return;
    const d = data.data;

    // Check submissionDetails in GraphQL
    if (d.submissionDetails) {
      const sd = d.submissionDetails;
      const status = String(sd.statusDisplay || sd.statusMsg || "").toLowerCase();
      const isAccepted = status === "accepted" || Number(sd.statusCode) === 10;
      const id = sd.id || sd.submissionId;
      if (isAccepted && id) {
        notifyAccepted(id);
      }
    }

    // Check checkSubmission or submissionStatus
    const statusObj = d.submissionStatus || d.checkSubmission;
    if (statusObj) {
      const state = String(statusObj.state || "").toUpperCase();
      const status = String(statusObj.statusDisplay || statusObj.statusMsg || "").toLowerCase();
      const id = statusObj.id || statusObj.submissionId;
      if ((state === "SUCCESS" || !statusObj.state) && status === "accepted" && id) {
        notifyAccepted(id);
      }
    }
  }

  function processResponse(url, data) {
    if (!data) return;
    if (url.includes("/submissions/detail/")) {
      handleSubmissionCheck(url, data);
    } else if (url.includes("/graphql")) {
      handleGraphQLResponse(data);
    }
  }

  // 1. Hook window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);
    try {
      const rawUrl = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) ? args[0].url : "";
      const url = String(rawUrl);

      if (url.includes("/submissions/detail/") || url.includes("/graphql")) {
        const clone = response.clone();
        clone.json().then((data) => {
          processResponse(url, data);
        }).catch(() => {});
      }
    } catch (_) {}
    return response;
  };

  // 2. Hook XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      this._lc_url = String(url || "");
    } catch (_) {}
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener("load", function () {
      try {
        const url = this._lc_url;
        if (url && (url.includes("/submissions/detail/") || url.includes("/graphql"))) {
          if (this.responseText) {
            const data = JSON.parse(this.responseText);
            processResponse(url, data);
          }
        }
      } catch (_) {}
    });
    return origSend.apply(this, args);
  };

  // 3. Fallback: Observe DOM for "Accepted" banner / links
  function checkDomForAccepted() {
    try {
      const elements = document.querySelectorAll(
        '[data-e2e-locator="submission-result"], [class*="status-accepted"], [class*="text-green"], [class*="text-success"]'
      );
      for (const el of elements) {
        if (/^\s*Accepted\s*$/i.test(el.textContent || "")) {
          const urlMatch = window.location.pathname.match(/\/submissions\/(?:detail\/)?(\d+)/);
          if (urlMatch) {
            notifyAccepted(urlMatch[1]);
            return;
          }
          const links = document.querySelectorAll('a[href*="/submissions/detail/"], a[href*="/submissions/"]');
          for (const a of links) {
            const m = (a.getAttribute("href") || "").match(/\/submissions\/(?:detail\/)?(\d+)/);
            if (m) {
              notifyAccepted(m[1]);
              return;
            }
          }
        }
      }
    } catch (_) {}
  }

  const observer = new MutationObserver(() => {
    checkDomForAccepted();
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      if (document.body) {
        observer.observe(document.body, { childList: true, subtree: true });
      }
    });
  }

  console.log("[LC Sync] Page hook installed.");
})();

