import { enqueue, drain } from "./queue.js";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "ACCEPTED") {
    enqueue({ id: msg.id, details: msg.details });
    if (sendResponse) sendResponse({ ok: true });
    return false;
  }
  if (msg && msg.type === "RETRY_QUEUE") {
    drain();
    if (sendResponse) sendResponse({ ok: true });
    return false;
  }
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === "lc-retry") drain();
});

chrome.runtime.onStartup.addListener(drain);
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());

console.log("[LC Sync] Background service worker initialized.");
