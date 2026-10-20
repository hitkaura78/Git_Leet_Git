// Durable job queue. Each accepted submission is a job:
// Commits both solution and stats atomically in ONE single commit on GitHub.
import { getConfig } from "./config.js";
import { commit, readFile } from "./github.js";
import { paths, messages, statsFile } from "./render.js";

const MAX_ATTEMPTS = 10;
let chain = Promise.resolve(); // serialises everything that touches the queue

const load = () => chrome.storage.local.get({ queue: [], done: [] });

function badge(text, color) {
  try {
    chrome.action.setBadgeBackgroundColor({ color });
    chrome.action.setBadgeText({ text });
    setTimeout(() => {
      try {
        chrome.action.setBadgeText({ text: "" });
      } catch (_) {}
    }, 5000);
  } catch (_) {}
}

async function run() {
  const state = await load();
  const { queue, done } = state;

  while (queue.length) {
    const job = queue[0];
    try {
      console.log(`[LC Sync] Processing job #${job.id}...`);
      const cfg = await getConfig();
      const p = paths(cfg, job.details);
      const msg = messages(job.id, job.details);

      console.log(`[LC Sync] Fetching existing stats for ${p.stats}...`);
      const existing = await readFile(cfg, p.stats);

      console.log(`[LC Sync] Committing solution and stats for #${job.id}...`);
      await commit(cfg, [
        { path: p.solution, content: job.details.code },
        { path: p.stats, content: statsFile(existing, job.id, job.details) }
      ], msg.combined || msg.solution);

      queue.shift();
      done.push(job.id);
      await chrome.storage.local.set({
        queue,
        done: done.slice(-300),
        lastError: "",
        lastSynced: {
          id: job.id,
          title: job.details?.question?.title || "Submission",
          time: new Date().toISOString()
        }
      });
      console.log(`[LC Sync] Successfully synced submission #${job.id}!`);
      badge("OK", "#2da44e");
    } catch (err) {
      console.error(`[LC Sync] Sync error for #${job.id}:`, err);
      job.attempts = (job.attempts || 0) + 1;
      if (job.attempts >= MAX_ATTEMPTS) {
        console.error(`[LC Sync] Max retry attempts reached for #${job.id}, dropping from queue.`);
        queue.shift();
      }
      await chrome.storage.local.set({ queue, lastError: String(err.message || err) });
      badge("ERR", "#cf222e");
      if (queue.length) chrome.alarms.create("lc-retry", { delayInMinutes: 1 });
      return;
    }
  }
}

export function drain() {
  chain = chain.then(run).catch(console.error);
  return chain;
}

export function enqueue(job) {
  chain = chain.then(async () => {
    const { queue, done } = await load();
    if (done.includes(job.id) || queue.some((j) => j.id === job.id)) {
      console.log(`[LC Sync] Submission #${job.id} already completed or queued.`);
      return;
    }
    console.log(`[LC Sync] Enqueued submission #${job.id}`);
    queue.push({ ...job, stage: 0, attempts: 0 });
    await chrome.storage.local.set({ queue });
  }).catch(console.error);
  return drain();
}
