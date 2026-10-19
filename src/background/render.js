// Pure functions: submission -> file paths, commit messages, file contents.
const EXT = {
  python: "py", python3: "py", cpp: "cpp", c: "c", java: "java", csharp: "cs",
  javascript: "js", typescript: "ts", golang: "go", rust: "rs", kotlin: "kt",
  swift: "swift", ruby: "rb", scala: "scala", php: "php", dart: "dart",
  mysql: "sql", mssql: "sql", oraclesql: "sql", bash: "sh",
  racket: "rkt", erlang: "erl", elixir: "ex"
};

const pct = (v) => (v == null ? "-" : `${Number(v).toFixed(1)}%`);

export function paths(cfg, d) {
  const q = d.question;
  const num = String(q.questionFrontendId).padStart(4, "0");
  const dir = [cfg.folder, `${num}-${q.titleSlug}`].filter(Boolean).join("/");
  return {
    solution: `${dir}/solution.${EXT[d.lang.name] || "txt"}`,
    stats: `${dir}/stats.md`
  };
}

export function messages(id, d) {
  const q = d.question;
  const label = `${q.questionFrontendId}. ${q.title}`;
  return {
    solution: `feat: accepted ${label} [${d.lang.name}] (#${id})`,
    stats: `docs: stats for ${label} - ${d.runtimeDisplay}, ${d.memoryDisplay} (#${id})`
  };
}

// Appends one row per accepted submission, so history is never overwritten
// and this file always changes -> the stats commit is never empty.
export function statsFile(existing, id, d) {
  const q = d.question;
  const when = new Date(d.timestamp ? Number(d.timestamp) * 1000 : Date.now())
    .toISOString().replace("T", " ").slice(0, 19);
  const n = existing ? existing.split("\n").filter((l) => /^\|\s*\d+\s*\|/.test(l)).length + 1 : 1;
  const row = `| ${n} | ${when} | ${d.lang.verboseName || d.lang.name} | ${d.runtimeDisplay} | ${pct(d.runtimePercentile)} | ${d.memoryDisplay} | ${pct(d.memoryPercentile)} | ${id} |`;

  if (existing) return existing.replace(/\n*$/, "\n") + row + "\n";

  const tags = (q.topicTags || []).map((t) => t.name).join(", ") || "-";
  return [
    `# ${q.questionFrontendId}. ${q.title}`,
    "",
    `- Link: https://leetcode.com/problems/${q.titleSlug}/`,
    `- Difficulty: ${q.difficulty}`,
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