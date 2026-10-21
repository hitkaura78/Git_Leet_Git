// Runs in MAIN world at document_start to hook window.fetch and XMLHttpRequest
// before LeetCode scripts execute. Emits a window message when an Accepted
// submission is detected.

(function () {
  const seenSubmissions = new Set();
  let activeSubmissionId = null;
  let lastSubmitTime = 0;

  function notifyAccepted(submissionId) {
    const id = String(submissionId || "").trim();
    if (!id || seenSubmissions.has(id)) return;
    seenSubmissions.add(id);

    console.log(`[LC Sync] 🎉 Accepted submission confirmed: #${id}`);
    window.postMessage({ source: "lc-sync", submissionId: id }, "*");
    try {
      document.dispatchEvent(new CustomEvent("lc-sync-accepted", { detail: { submissionId: id } }));
    } catch (_) {}
  }

  // Safely extract JSON from XMLHttpRequest without triggering InvalidStateError
  function getXhrResponse(xhr) {
    try {
      if (xhr.responseType === "json" && xhr.response) {
        return xhr.response;
      }
      if (!xhr.responseType || xhr.responseType === "text") {
        if (typeof xhr.responseText === "string" && xhr.responseText.trim()) {
          return JSON.parse(xhr.responseText);
        }
      }
      if (xhr.response) {
        if (typeof xhr.response === "object") return xhr.response;
        if (typeof xhr.response === "string" && xhr.response.trim()) {
          return JSON.parse(xhr.response);
        }
      }
    } catch (_) {}
    return null;
  }

  // Inspect request body to find submissionId before response arrives
  function inspectRequestBody(body) {
    if (!body) return;
    try {
      const parsed = typeof body === "string" ? JSON.parse(body) : body;
      if (parsed && parsed.variables) {
        const v = parsed.variables;
        if (v.submissionId) {
          activeSubmissionId = String(v.submissionId);
        }
      }
    } catch (_) {}
  }

  // Handle submit response: capture the new submission ID
  function handlePossibleSubmit(url, data) {
    if (!data || typeof data !== "object") return;

    // REST: /problems/<slug>/submit/
    if (url.includes("/submit/")) {
      const subId = data.submission_id || data.id;
      if (subId) {
        activeSubmissionId = String(subId);
        lastSubmitTime = Date.now();
        console.log(`[LC Sync] 📋 New submission queued: #${activeSubmissionId}`);
      }
    }

    // GraphQL: submitCode mutation
    if (data.data && data.data.submitCode) {
      const subId = data.data.submitCode.submission_id || data.data.submitCode.id;
      if (subId) {
        activeSubmissionId = String(subId);
        lastSubmitTime = Date.now();
        console.log(`[LC Sync] 📋 New GraphQL submission queued: #${activeSubmissionId}`);
      }
    }
  }

  // Handle check/polling response: verify if the submission is Accepted
  function handlePossibleCheck(url, data) {
    if (!data || typeof data !== "object") return;

    // 1. REST polling: /submissions/detail/<id>/check/
    const restMatch = String(url).match(/\/submissions\/detail\/(\d+)\/check\/?/i);
    if (restMatch) {
      const subId = restMatch[1] || data.submission_id || activeSubmissionId;
      const state = String(data.state || "").toUpperCase();
      const statusMsg = String(data.status_msg || data.status_display || "").toLowerCase();
      const statusCode = Number(data.status_code);

      console.log(`[LC Sync] Check polling #${subId}: state=${state}, status=${statusMsg || statusCode}`);

      if (state === "SUCCESS") {
        const isAccepted =
          statusMsg === "accepted" ||
          statusCode === 10 ||
          (data.run_success === true && data.total_correct && data.total_correct === data.total_testcases);

        if (isAccepted && subId) {
          notifyAccepted(subId);
        }
      }
      return;
    }

    // 2. GraphQL polling: checkSubmissionStatus
    if (data.data) {
      const cs = data.data.checkSubmissionStatus || data.data.submissionStatus || data.data.checkSubmission;
      if (cs) {
        const state = String(cs.state || "").toUpperCase();
        const statusMsg = String(cs.status_msg || cs.statusDisplay || "").toLowerCase();
        const statusCode = Number(cs.status_code || cs.statusCode);
        const subId = cs.submission_id || cs.id || activeSubmissionId;

        console.log(`[LC Sync] GraphQL check #${subId}: state=${state}, status=${statusMsg || statusCode}`);

        if (state === "SUCCESS") {
          const isAccepted =
            statusMsg === "accepted" ||
            statusCode === 10 ||
            (cs.run_success === true && cs.total_correct && cs.total_correct === cs.total_testcases);

          if (isAccepted && subId) {
            notifyAccepted(subId);
          }
        }
      }
    }
  }

  function processResponse(url, data) {
    if (!data) return;
    handlePossibleSubmit(url, data);
    handlePossibleCheck(url, data);
  }

  // 1. Hook window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    let url = "";
    try {
      if (typeof args[0] === "string") url = args[0];
      else if (args[0] && args[0].url) url = args[0].url;
    } catch (_) {}

    try {
      if (args[1] && args[1].body) {
        inspectRequestBody(args[1].body);
      } else if (args[0] && typeof args[0] === "object" && typeof args[0].clone === "function") {
        args[0].clone().text().then(inspectRequestBody).catch(() => {});
      }
    } catch (_) {}

    const response = await originalFetch.apply(this, args);

    try {
      const u = String(url || "");
      if (u.includes("/submit/") || u.includes("/submissions/") || u.includes("/graphql")) {
        const clone = response.clone();
        clone.json().then((data) => {
          processResponse(u, data);
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

  XMLHttpRequest.prototype.send = function (body) {
    try {
      this._lc_body = body;
      inspectRequestBody(body);
    } catch (_) {}

    this.addEventListener("load", function () {
      try {
        const url = this._lc_url;
        if (url && (url.includes("/submit/") || url.includes("/submissions/") || url.includes("/graphql"))) {
          const data = getXhrResponse(this);
          if (data) {
            processResponse(url, data);
          }
        }
      } catch (_) {}
    });

    return origSend.call(this, body);
  };

  // 3. User Submit Click Listener
  function onUserSubmit() {
    lastSubmitTime = Date.now();
    activeSubmissionId = null;
    console.log("[LC Sync] 🚀 User clicked Submit! Monitoring execution...");
  }

  document.addEventListener("click", function (e) {
    const btn = e.target && e.target.closest('button, [role="button"]');
    if (btn) {
      const isSubmitBtn =
        btn.getAttribute("data-e2e-locator") === "console-submit-button" ||
        /^Submit$/i.test((btn.textContent || "").trim());
      if (isSubmitBtn) {
        onUserSubmit();
      }
    }
  }, true);

  // Keyboard shortcut Ctrl+Enter / Cmd+Enter on LeetCode editor submits
  document.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      onUserSubmit();
    }
  }, true);

  // 4. URL change listener for dynamic layout submissions
  function checkUrlForSubmission() {
    const match = window.location.pathname.match(/\/submissions\/(?:detail\/)?(\d+)/i);
    if (match) {
      activeSubmissionId = match[1];
    }
  }

  const origPush = history.pushState;
  history.pushState = function (...args) {
    const res = origPush.apply(this, args);
    checkUrlForSubmission();
    return res;
  };

  const origReplace = history.replaceState;
  history.replaceState = function (...args) {
    const res = origReplace.apply(this, args);
    checkUrlForSubmission();
    return res;
  };

  window.addEventListener("popstate", checkUrlForSubmission);

  // 5. DOM Observer fallback when user just submitted
  function scanDomForAccepted() {
    // Only check if user submitted within the last 90 seconds
    if (Date.now() - lastSubmitTime > 90000) return;

    try {
      checkUrlForSubmission();
      const spans = document.querySelectorAll("span, div, h4, p");
      for (const el of spans) {
        if (el.children.length === 0 && /^Accepted$/i.test((el.textContent || "").trim())) {
          if (activeSubmissionId) {
            console.log(`[LC Sync] 🎯 DOM confirmed Accepted for active submission #${activeSubmissionId}`);
            notifyAccepted(activeSubmissionId);
            activeSubmissionId = null;
            return;
          }
        }
      }
    } catch (_) {}
  }

  const observer = new MutationObserver(() => scanDomForAccepted());
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    });
  }

  console.log("[LC Sync] Page hook active: monitoring active submissions.");
})();
