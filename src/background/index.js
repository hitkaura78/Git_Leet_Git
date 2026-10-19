import { enqueue, drain } from "./queue.js";

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "ACCEPTED") enqueue({ id: msg.id, details: msg.details });
});

chrome.alarms.onAlarm.addListener((a) => { if (a.name === "lc-retry") drain(); });
chrome.runtime.onStartup.addListener(drain);
chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());