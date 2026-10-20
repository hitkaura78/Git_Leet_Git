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
  const token = cfg.token.replace(/^bearer\s+/i, "").replace(/^token\s+/i, "").trim();
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
    const err = new Error(`${what} failed (${res.status}): ${text}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

// Raw text of a file on the branch, or null if it does not exist.
export async function readFile(cfg, path) {
  const cleanPath = seg(path);
  const res = await call(cfg, `/repos/${cfg.repo}/contents/${cleanPath}?ref=${encodeURIComponent(cfg.branch)}`, {
    accept: "application/vnd.github.raw+json"
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Read ${path} failed (${res.status})`);
  return res.text();
}

// Create ONE commit on cfg.branch containing `files` ([{path, content}]).
export async function commit(cfg, files, message) {
  const repo = `/repos/${cfg.repo}`;
  const branch = seg(cfg.branch);

  for (let attempt = 1; ; attempt++) {
    try {
      const ref = await ok(await call(cfg, `${repo}/git/ref/heads/${branch}`), `Get branch "${cfg.branch}"`);
      const parentSha = ref.object.sha;
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

      const e = new Error(`Update branch "${cfg.branch}" failed (${upd.status}): ${await upd.text()}`);
      e.status = upd.status;
      throw e;
    } catch (e) {
      const transient = e.status === 409 || e.status === 422 || e.status >= 500;
      if (!transient || attempt >= 3) throw e;
      await sleep(1000 * attempt);
    }
  }
}
