// Runs in MAIN world at document_start to hook window.fetch and XMLHttpRequest
// before LeetCode scripts execute. Emits a window message when an Accepted
// submission is detected.

(function () {
  const seenSubmissions = new Set();
  let trackedSubmissionId = null;

  function trackSubmissionId(id) {
    if (!id) return;
    const str = String(id).trim();
    if (str && !seenSubmissions.has(str)) {
      trackedSubmissionId = str;
      console.log(`[LC Sync] 🎯 Tracked submission ID: #${str}`);
    }
  }

  function notifyAccepted(submissionId) {
    const id = String(submissionId || trackedSubmissionId || "").trim();
    if (!id || seenSubmissions.has(id)) return;
    seenSubmissions.add(id);

    console.log(`[LC Sync] 🎉 Accepted submission confirmed: #${id}`);
    window.postMessage({ source: "lc-sync", submissionId: id }, "*");
  }

  // Intercept URL for submission ID
  function checkUrlForSubmissionId() {
    const match = window.location.pathname.match(/\/submissions\/(?:detail\/)?(\d+)/i);
    if (match) {
      trackSubmissionId(match[1]);
    }
  }

  // Intercept request payloads to find submissionId before response arrives
  function inspectRequestBody(body) {
    if (!body) return;
    try {
      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      if (parsed && parsed.variables) {
        const v = parsed.variables;
        if (v.submissionId) trackSubmissionId(v.submissionId);
        if (v.id) trackSubmissionId(v.id);
      }
    } catch (_) {}
  }

  // Inspect responses from GraphQL or REST
  function inspectResponseData(url, data) {
    if (!data || typeof data !== "object") return;

    // 1. REST check endpoint: /submissions/detail/<id>/check/
    const restMatch = String(url).match(/\/submissions\/detail\/(\d+)\/check\/?/i);
    if (restMatch) {
      const subId = restMatch[1] || data.submission_id || data.id;
      trackSubmissionId(subId);

      const state = String(data.state || "").toUpperCase();
      const statusMsg = String(data.status_msg || data.status_display || "").toLowerCase();
      const isAccepted = statusMsg === "accepted" || data.status_code === 10 || data.run_success === true;
      if (state === "SUCCESS" && isAccepted) {
        notifyAccepted(subId);
      }
      return;
    }

    // 2. REST submit endpoint: /problems/<slug>/submit/
    if (url.includes("/submit/")) {
      if (data.submission_id || data.id) {
        trackSubmissionId(data.submission_id || data.id);
      }
    }

    // 3. GraphQL responses
    if (data.data) {
      const d = data.data;

      // 3a. submitCode mutation response
      if (d.submitCode) {
        const subId = d.submitCode.submission_id || d.submitCode.id;
        if (subId) trackSubmissionId(subId);
      }

      // 3b. checkSubmissionStatus query response
      const checkNode = d.checkSubmissionStatus || d.submissionStatus || d.checkSubmission;
      if (checkNode) {
        const state = String(checkNode.state || "").toUpperCase();
        const statusMsg = String(checkNode.status_msg || checkNode.statusDisplay || "").toLowerCase();
        const statusCode = Number(checkNode.status_code || checkNode.statusCode);
        const isAccepted =
          statusMsg === "accepted" ||
          statusCode === 10 ||
          (checkNode.run_success === true && checkNode.total_correct && checkNode.total_correct === checkNode.total_testcases);

        if (state === "SUCCESS" && isAccepted) {
          const subId = checkNode.submission_id || checkNode.id || trackedSubmissionId;
          if (subId) notifyAccepted(subId);
        }
      }

      // 3c. submissionDetails query response
      if (d.submissionDetails) {
        const sd = d.submissionDetails;
        const status = String(sd.statusDisplay || sd.statusMsg || "").toLowerCase();
        const isAccepted = status === "accepted" || Number(sd.statusCode) === 10;
        const subId = sd.id || sd.submissionId || trackedSubmissionId;
        if (isAccepted && subId) {
          notifyAccepted(subId);
        }
      }

      // 3d. Recent submissions list
      const list =
        (d.submissionList && d.submissionList.submissions) ||
        (d.questionSubmissions && d.questionSubmissions.submissions) ||
        d.recentSubmissions;
      if (Array.isArray(list) && list.length > 0) {
        const latest = list[0];
        if (latest) {
          const status = String(latest.statusDisplay || latest.status || "").toLowerCase();
          if (status === "accepted" && latest.id) {
            trackSubmissionId(latest.id);
            const now = Date.now() / 1000;
            const ts = Number(latest.timestamp || now);
            if (Math.abs(now - ts) < 180) {
              notifyAccepted(latest.id);
            }
          }
        }
      }
    }
  }

  // Hook window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const rawUrl = typeof args[0] === "string" ? args[0] : (args[0] && args[0].url) ? args[0].url : "";
    const url = String(rawUrl);

    // Inspect request body
    if (args[1] && args[1].body) {
      inspectRequestBody(args[1].body);
    } else if (args[0] && typeof args[0] === "object" && typeof args[0].clone === "function") {
      try {
        args[0].clone().text().then(inspectRequestBody).catch(() => {});
      } catch (_) {}
    }

    const response = await originalFetch.apply(this, args);

    try {
      if (url.includes("/submissions/") || url.includes("/graphql") || url.includes("/submit/")) {
        const clone = response.clone();
        clone.json().then((data) => {
          inspectResponseData(url, data);
        }).catch(() => {});
      }
    } catch (_) {}

    return response;
  };

  // Hook XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    try {
      this._lc_url = String(url || "");
    } catch (_) {}
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    try {
      this._lc_body = body;
      inspectRequestBody(body);
    } catch (_) {}

    this.addEventListener("load", function () {
      try {
        const url = this._lc_url;
        if (url && (url.includes("/submissions/") || url.includes("/graphql") || url.includes("/submit/"))) {
          if (this.responseText) {
            const data = JSON.parse(this.responseText);
            inspectResponseData(url, data);
          }
        }
      } catch (_) {}
    });

    return origSend.call(this, body);
  };

  // Hook history pushState and replaceState to detect submission URL changes
  const origPush = history.pushState;
  history.pushState = function (...args) {
    const res = origPush.apply(this, args);
    checkUrlForSubmissionId();
    return res;
  };

  const origReplace = history.replaceState;
  history.replaceState = function (...args) {
    const res = origReplace.apply(this, args);
    checkUrlForSubmissionId();
    return res;
  };

  window.addEventListener("popstate", checkUrlForSubmissionId);
  checkUrlForSubmissionId();

  // Fallback: Check DOM for "Accepted" banner
  function scanDom() {
    try {
      checkUrlForSubmissionId();
      const allSpans = document.querySelectorAll("span, div, h4, p");
      for (const el of allSpans) {
        if (el.children.length === 0 && /^Accepted$/i.test((el.textContent || "").trim())) {
          if (trackedSubmissionId) {
            notifyAccepted(trackedSubmissionId);
            return;
          }
        }
      }
    } catch (_) {}
  }

  const observer = new MutationObserver(() => scanDom());
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  console.log("[LC Sync] Page hook active and monitoring submissions.");
})();
