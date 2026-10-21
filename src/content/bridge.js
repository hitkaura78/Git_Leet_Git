// Isolated world. Turns "submission X was accepted" into full details
// (code, runtime, memory, ...) via LeetCode GraphQL, then messages the
// background worker.
const seen = new Set();

const QUERY = `query submissionDetails($submissionId: Int!) {
  submissionDetails(submissionId: $submissionId) {
    runtimeDisplay runtimePercentile memoryDisplay memoryPercentile
    code timestamp
    lang { name verboseName }
    question { questionFrontendId title titleSlug difficulty topicTags { name } }
  }
}`;

const csrf = () => (document.cookie.match(/(?:^|;\s*)csrftoken=([^;]+)/) || [])[1] || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchDetails(id) {
  // Give LeetCode's backend a moment to finish recording stats
  await sleep(500);

  for (let i = 0; i < 5; i++) {
    try {
      const endpoint = `${window.location.origin}/graphql/`;
      const headers = { "Content-Type": "application/json" };
      const token = csrf();
      if (token) headers["x-csrftoken"] = token;

      const r = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers,
        body: JSON.stringify({
          operationName: "submissionDetails",
          query: QUERY,
          variables: { submissionId: parseInt(id, 10) }
        })
      });

      if (r.ok) {
        const j = await r.json();
        const d = j && j.data && j.data.submissionDetails;
        if (d && d.code) return d;
      }
    } catch (err) {
      console.log(`[LC Sync] Fetch details attempt ${i + 1} pending...`);
    }
    await sleep(800 * (i + 1));
  }
  return null;
}

async function handleSubmission(submissionId) {
  const id = String(submissionId || "").trim();
  if (!id || seen.has(id)) return;
  seen.add(id);

  console.log(`[LC Sync] Bridge handling submission #${id}...`);
  const details = await fetchDetails(id);
  if (!details) {
    console.log(`[LC Sync] Could not fetch details for submission #${id} yet; resetting tracker.`);
    seen.delete(id);
    return;
  }

  const title = details.question?.title || "Problem";
  const lang = details.lang?.name || "Code";
  console.log(`[LC Sync] Fetched details for #${id}: ${title} [${lang}]. Forwarding to background worker...`);

  // Verify extension runtime connection
  if (typeof chrome === "undefined" || !chrome.runtime || typeof chrome.runtime.sendMessage !== "function" || !chrome.runtime.id) {
    console.error("[LC Sync] Extension is disconnected. Please refresh this LeetCode tab (Ctrl+R / F5) to reconnect.");
    seen.delete(id);
    return;
  }

  try {
    chrome.runtime.sendMessage({ type: "ACCEPTED", id, details }, (res) => {
      const err = chrome.runtime.lastError;
      if (err) {
        console.warn("[LC Sync] Background message status:", err.message);
      } else {
        console.log(`[LC Sync] Background worker queued #${id}.`);
      }
    });
  } catch (err) {
    console.error("[LC Sync] Failed to message background worker:", err);
    seen.delete(id);
  }
}

// Listen for messages from page-hook.js via window.postMessage
window.addEventListener("message", (e) => {
  if (!e.data || e.data.source !== "lc-sync") return;
  handleSubmission(e.data.submissionId);
});

// Also listen for custom DOM event as an alternative bridge channel
document.addEventListener("lc-sync-accepted", (e) => {
  if (e.detail && e.detail.submissionId) {
    handleSubmission(e.detail.submissionId);
  }
});

console.log("[LC Sync] Bridge script loaded.");
