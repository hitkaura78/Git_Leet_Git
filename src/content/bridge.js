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

const csrf = () => (document.cookie.match(/csrftoken=([^;]+)/) || [])[1] || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchDetails(id) {
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch("/graphql/", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrftoken": csrf() },
        body: JSON.stringify({ query: QUERY, variables: { submissionId: Number(id) } })
      });
      const j = await r.json();
      const d = j && j.data && j.data.submissionDetails;
      if (d && d.code) return d;
    } catch (_) {}
    await sleep(800 * (i + 1));
  }
  return null;
}

window.addEventListener("message", async (e) => {
  if (e.source !== window || !e.data || e.data.source !== "lc-sync") return;
  const id = String(e.data.submissionId);
  if (seen.has(id)) return;
  seen.add(id);

  const details = await fetchDetails(id);
  if (!details) { seen.delete(id); return; }
  chrome.runtime.sendMessage({ type: "ACCEPTED", id, details });
});