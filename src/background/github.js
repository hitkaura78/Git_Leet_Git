// GitHub Git Data API client. One commit() call = exactly one commit,
// even if the file content is identical to what is already there
// (the new commit simply reuses the parent's tree).
const API = "https://api.github.com";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const seg = (s) => String(s || "").replace(/^\/+|\/+$/g, "").split("/").map(encodeURIComponent).join("/");

function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}

function call(cfg, path, { method = "GET", body, accept = "application/vnd.github+json" } = {}) {
  const token = (cfg.token || "").replace(/^bearer\s+/i, "").replace(/^token\s+/i, "").trim();
  return fetch(API + path, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: accept,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

async function ok(res, what) {
  if (!res.ok) {
    const text = await res.text();
    let msg = text;
    try {
      const j = JSON.parse(text);
      if (j.message) msg = j.message;
    } catch (_) {}

    if (res.status === 401) {
      throw new Error(`GitHub token invalid or expired (401: ${msg}). Check token in LC Sync settings.`);
    }
    if (res.status === 403) {
      throw new Error(`GitHub write permission denied (403: ${msg}). Token needs 'Contents: Read and write' permissions.`);
    }
    if (res.status === 404) {
      throw new Error(`GitHub resource not found (404: ${msg}). Verify repository owner/name.`);
    }

    const err = new Error(`${what} failed (${res.status}): ${msg}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Ensures the branch exists and returns { branch, parentSha }.
// If the repository is empty (0 commits), automatically initializes it with README.md.
// If the default branch is different (e.g. master vs main), auto-detects it.
async function ensureBranch(cfg) {
  const repo = `/repos/${cfg.repo}`;
  let branch = seg(cfg.branch || "main");

  const res = await call(cfg, `${repo}/git/ref/heads/${branch}`);
  if (res.ok) {
    const data = await res.json();
    return { branch, parentSha: data.object.sha };
  }

  if (res.status === 404) {
    // Check repository metadata
    const repoRes = await call(cfg, repo);
    if (!repoRes.ok) {
      await ok(repoRes, `Repository "${cfg.repo}"`);
    }
    const repoInfo = await repoRes.json();

    // 1. Check if default_branch is different (e.g. master vs main)
    if (repoInfo.default_branch && repoInfo.default_branch !== branch) {
      const altBranch = seg(repoInfo.default_branch);
      const altRes = await call(cfg, `${repo}/git/ref/heads/${altBranch}`);
      if (altRes.ok) {
        const altData = await altRes.json();
        return { branch: altBranch, parentSha: altData.object.sha };
      }
    }

    // 2. Repository might be completely empty (0 commits). Initialize with README.md!
    console.log(`[LC Sync] Repository "${cfg.repo}" is empty. Initializing with README.md on branch "${branch}"...`);
    const initRes = await call(cfg, `${repo}/contents/README.md`, {
      method: "PUT",
      body: {
        message: "Initial commit by LC Sync",
        content: b64("# LeetCode Solutions\n\nAutomated sync by [LC Sync](https://github.com).\n"),
        branch: branch
      }
    });

    if (initRes.ok) {
      const initData = await initRes.json();
      const parentSha = (initData.commit && initData.commit.sha) || initData.content?.sha;
      console.log(`[LC Sync] Repository initialized. Root commit: ${parentSha}`);
      return { branch, parentSha };
    }

    await ok(initRes, `Initialize empty repository "${cfg.repo}"`);
  }

  await ok(res, `Get branch "${cfg.branch}"`);
}

// Raw text of a file on the branch, or null if it does not exist.
export async function readFile(cfg, path) {
  const cleanPath = seg(path);
  const branch = seg(cfg.branch || "main");
  const res = await call(cfg, `/repos/${cfg.repo}/contents/${cleanPath}?ref=${encodeURIComponent(branch)}`, {
    accept: "application/vnd.github.raw+json"
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Read ${path} failed (${res.status})`);
  return res.text();
}

// Create ONE commit containing `files` ([{path, content}]) on cfg.branch.
export async function commit(cfg, files, message) {
  const repo = `/repos/${cfg.repo}`;

  for (let attempt = 1; ; attempt++) {
    try {
      const { branch, parentSha } = await ensureBranch(cfg);
      const parent = await ok(await call(cfg, `${repo}/git/commits/${parentSha}`), "Get parent commit");

      const tree = [];
      for (const f of files) {
        const blob = await ok(await call(cfg, `${repo}/git/blobs`, {
          method: "POST", body: { content: b64(f.content), encoding: "base64" }
        }), `Create blob for ${f.path}`);
        tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
      }

      const newTree = await ok(await call(cfg, `${repo}/git/trees`, {
        method: "POST", body: { base_tree: parent.tree.sha, tree }
      }), "Create tree");

      const created = await ok(await call(cfg, `${repo}/git/commits`, {
        method: "POST", body: { message, tree: newTree.sha, parents: [parentSha] }
      }), "Create commit");

      const upd = await call(cfg, `${repo}/git/refs/heads/${branch}`, {
        method: "PATCH", body: { sha: created.sha, force: false }
      });
      if (upd.ok) return created.sha;

      const updErr = await upd.text();
      const e = new Error(`Update branch "${branch}" failed (${upd.status}): ${updErr}`);
      e.status = upd.status;
      throw e;
    } catch (e) {
      const transient = e.status === 409 || e.status === 422 || e.status >= 500;
      if (!transient || attempt >= 3) throw e;
      await sleep(1000 * attempt);
    }
  }
}
