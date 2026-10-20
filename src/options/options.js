const $ = (id) => document.getElementById(id);
const FIELDS = ["token", "repo", "branch", "folder"];

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

function showStatus(text, type = "info") {
  const el = $("status");
  el.textContent = text;
  el.className = type;
}

chrome.storage.local.get([...FIELDS, "lastError", "lastSynced", "queue"]).then((c) => {
  FIELDS.forEach((f) => {
    if ($(f)) $(f).value = c[f] || "";
  });
  if (c.queue && c.queue.length > 0) {
    $("retry").style.display = "inline-block";
    showStatus(`Queue has ${c.queue.length} pending submission(s). Last error: ${c.lastError || "None"}`, "error");
  } else if (c.lastError) {
    showStatus("Last error: " + c.lastError, "error");
  } else if (c.lastSynced) {
    showStatus(`✓ Ready. Last synced: "${c.lastSynced.title}" (#${c.lastSynced.id}) at ${new Date(c.lastSynced.time).toLocaleTimeString()}`, "success");
  }
});

$("save").onclick = async () => {
  const token = cleanToken($("token").value);
  const repo = cleanRepo($("repo").value);
  const branch = $("branch").value.trim().replace(/^\/+|\/+$/g, "") || "main";
  const folder = $("folder").value.trim().replace(/^\/+|\/+$/g, "");

  if (!token || !repo) {
    showStatus("Error: GitHub token and repository are required.", "error");
    return;
  }

  // Update input fields to cleaned versions
  $("token").value = token;
  $("repo").value = repo;
  $("branch").value = branch;
  $("folder").value = folder;

  await chrome.storage.local.set({ token, repo, branch, folder });
  showStatus("Settings saved successfully.", "success");
};

$("test").onclick = async () => {
  const token = cleanToken($("token").value);
  const repo = cleanRepo($("repo").value);
  const branch = $("branch").value.trim().replace(/^\/+|\/+$/g, "") || "main";

  if (!token || !repo) {
    showStatus("Please enter both a GitHub token and repository before testing.", "error");
    return;
  }

  showStatus("Testing GitHub connection...", "info");
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`, { headers });
    if (res.status === 401) {
      throw new Error("Invalid GitHub token (401 Unauthorized). Verify token has not expired.");
    }
    if (res.status === 404) {
      throw new Error(`Repository "${repo}" not found (404). Check owner/repo name and token access permissions.`);
    }
    if (!res.ok) {
      throw new Error(`GitHub API returned error ${res.status}: ${res.statusText}`);
    }

    const repoData = await res.json();
    if (repoData.permissions && repoData.permissions.push === false) {
      throw new Error("Token does not have push permissions. Grant 'Contents: Read and write' in token settings.");
    }

    const branchRes = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`, { headers });
    if (branchRes.status === 404) {
      throw new Error(`Branch "${branch}" not found in repository. If repository is empty, create a README.md file first.`);
    }
    if (!branchRes.ok) {
      throw new Error(`Failed to check branch "${branch}" (${branchRes.status})`);
    }

    showStatus(`✓ Connection successful! Verified write access to "${repoData.full_name}" on branch "${branch}".`, "success");
  } catch (err) {
    showStatus("Connection test failed:\n" + err.message, "error");
  }
};

$("retry").onclick = () => {
  chrome.runtime.sendMessage({ type: "RETRY_QUEUE" }, () => {
    showStatus("Retrying pending queue...", "info");
    setTimeout(() => location.reload(), 1500);
  });
};
