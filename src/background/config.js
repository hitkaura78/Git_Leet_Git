export async function getConfig() {
  const c = await chrome.storage.local.get(["token", "repo", "branch", "folder"]);
  if (!c.token || !c.repo) throw new Error("Token/repo not set. Open the extension options.");
  return {
    token: c.token,
    repo: c.repo,
    branch: c.branch || "main",
    folder: (c.folder || "").replace(/^\/+|\/+$/g, "")
  };
}