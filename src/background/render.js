// Pure functions: submission -> file paths, commit messages, file contents.
const EXT = {
  python: "py", python3: "py", cpp: "cpp", c: "c", java: "java", csharp: "cs",
  javascript: "js", typescript: "ts", golang: "go", rust: "rs", kotlin: "kt",
  swift: "swift", ruby: "rb", scala: "scala", php: "php", dart: "dart",
  mysql: "sql", mssql: "sql", oraclesql: "sql", postgresql: "sql", bash: "sh",
  racket: "rkt", erlang: "erl", elixir: "ex", pandas: "py", pythondata: "py"
};

const pct = (v) => (v == null ? "-" : `${Number(v).toFixed(1)}%`);

export function paths(cfg, d) {
  const q = d.question || {};
  const num = String(q.questionFrontendId || "0").padStart(4, "0");
  const slug = q.titleSlug || "submission";
  const dir = [cfg.folder, `${num}-${slug}`].filter(Boolean).join("/");
  const langKey = (d.lang && d.lang.name) ? d.lang.name.toLowerCase() : "";
  const ext = EXT[langKey] || "txt";
  return {
    solution: `${dir}/solution.${ext}`,
    stats: `${dir}/stats.md`
  };
}

export function messages(id, d) {
  const q = d.question || {};
  const label = `${q.questionFrontendId || "?"}. ${q.title || "Solution"}`;
  const lang = (d.lang && d.lang.name) || "Code";
  const runtime = d.runtimeDisplay || "N/A";
  const memory = d.memoryDisplay || "N/A";
  return {
    combined: `feat: solve ${label} [${lang}] - ${runtime}, ${memory} (#${id})`,
    solution: `feat: accepted ${label} [${lang}] (#${id})`,
    stats: `docs: stats for ${label} - ${runtime}, ${memory} (#${id})`
  };
}

// Appends one row per accepted submission, so history is never overwritten
// and this file always changes -> the stats commit is never empty.
export function statsFile(existing, id, d) {
  const q = d.question || {};
  const when = new Date(d.timestamp ? Number(d.timestamp) * 1000 : Date.now())
    .toISOString().replace("T", " ").slice(0, 19);
  const n = existing ? existing.split("\n").filter((l) => /^\|\s*\d+\s*\|/.test(l)).length + 1 : 1;
  const lang = (d.lang && (d.lang.verboseName || d.lang.name)) || "Unknown";
  const runtime = d.runtimeDisplay || "-";
  const memory = d.memoryDisplay || "-";
  const row = `| ${n} | ${when} | ${lang} | ${runtime} | ${pct(d.runtimePercentile)} | ${memory} | ${pct(d.memoryPercentile)} | ${id} |`;

  if (existing) return existing.replace(/\n*$/, "\n") + row + "\n";

  const tags = (q.topicTags || []).map((t) => t.name).join(", ") || "-";
  return [
    `# ${q.questionFrontendId || "?"}. ${q.title || "Problem"}`,
    "",
    `- Link: https://leetcode.com/problems/${q.titleSlug || ""}/`,
    `- Difficulty: ${q.difficulty || "-"}`,
    `- Topics: ${tags}`,
    "",
    "## Accepted submissions",
    "",
    "| # | Date (UTC) | Language | Runtime | Runtime beats | Memory | Memory beats | Submission |",
    "|---|---|---|---|---|---|---|---|",
    row,
    ""
  ].join("\n");
}
