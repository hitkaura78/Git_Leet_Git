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
  await sleep(400);

  for (let i = 0; i < 5; i++) {
    try {
      const endpoint = `${window.location.origin}/graphql/`;
      const r = await fetch(endpoint, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "x-csrftoken": csrf()
        },
        body: JSON.stringify({
          operationName: "submissionDetails",
          query: QUERY,
          variables: { submissionId: Number(id) }
        })
      });

      if (r.ok) {
        const j = await r.json();
        const d = j && j.data && j.data.submissionDetails;
        if (d && d.code) return d;
      }
    } catch (err) {
      console.warn("[LC Sync] Attempt " + (i + 1) + " fetching details failed:", err);
    }
    await sleep(800 * (i + 1));
  }
  return null;
}

window.addEventListener("message", async (e) => {
  if (!e.data || e.data.source !== "lc-sync") return;
  const id = String(e.data.submissionId);
  if (!id || seen.has(id)) return;
  seen.add(id);

  console.log(`[LC Sync] Bridge handling submission #${id}...`);
  const details = await fetchDetails(id);
  if (!details) {
    console.warn(`[LC Sync] Could not fetch details for submission #${id}; resetting so it can retry.`);
    seen.delete(id);
    return;
  }

  const title = details.question?.title || "Problem";
  const lang = details.lang?.name || "Code";
  console.log(`[LC Sync] Fetched details for #${id}: ${title} [${lang}]. Notifying background worker...`);

  try {
    chrome.runtime.sendMessage({ type: "ACCEPTED", id, details }, (res) => {
      if (chrome.runtime.lastError) {
        console.warn("[LC Sync] Warning from background worker:", chrome.runtime.lastError.message);
      } else {
        console.log(`[LC Sync] Background worker received #${id}.`);
      }
    });
  } catch (err) {
    console.error("[LC Sync] Failed to message background worker:", err);
  }
});

console.log("[LC Sync] Bridge script loaded.");
