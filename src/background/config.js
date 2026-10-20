function cleanRepo(r) {
  return String(r || "")
    .trim()
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/^github\.com\//i, "")
    .replace(/^git@github\.com:/i, "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/\.git$/i, "")
    .replace(/^\/+|\/+$/g, "");
}

function cleanToken(t) {
  return String(t || "")
    .trim()
    .replace(/^bearer\s+/i, "")
    .replace(/^token\s+/i, "")
    .trim();
}

export async function getConfig() {
  const c = await chrome.storage.local.get(["token", "repo", "branch", "folder"]);
  const token = cleanToken(c.token);
  const repo = cleanRepo(c.repo);

  if (!token || !repo) {
    throw new Error("GitHub token or repository not set. Click the LC Sync extension icon to configure.");
  }

  return {
    token,
    repo,
    branch: (c.branch || "main").trim().replace(/^\/+|\/+$/g, "") || "main",
    folder: (c.folder || "").trim().replace(/^\/+|\/+$/g, "")
  };
}
