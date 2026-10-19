const $ = (id) => document.getElementById(id);
const FIELDS = ["token", "repo", "branch", "folder"];

chrome.storage.local.get([...FIELDS, "lastError"]).then((c) => {
  FIELDS.forEach((f) => ($(f).value = c[f] || ""));
  if (c.lastError) $("status").textContent = "Last error: " + c.lastError;
});

$("save").onclick = async () => {
  const data = {};
  FIELDS.forEach((f) => (data[f] = $(f).value.trim()));
  await chrome.storage.local.set(data);
  $("status").textContent = "Saved.";
};

$("test").onclick = async () => {
  const token = $("token").value.trim(), repo = $("repo").value.trim();
  const branch = $("branch").value.trim() || "main";
  $("status").textContent = "Testing...";
  const h = { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" };
  try {
    const r = await fetch(`https://api.github.com/repos/${repo}`, { headers: h });
    if (!r.ok) throw new Error(`repo: ${r.status} ${r.statusText}`);
    const j = await r.json();
    if (!(j.permissions && j.permissions.push)) throw new Error("token has no push access");
    const b = await fetch(`https://api.github.com/repos/${repo}/git/ref/heads/${branch}`, { headers: h });
    if (!b.ok) throw new Error(`branch "${branch}" not found (empty repo? add a README first)`);
    $("status").textContent = `OK: write access to ${j.full_name} on ${branch}`;
  } catch (e) {
    $("status").textContent = "Failed: " + e.message;
  }
};
