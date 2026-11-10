import type { CheckReport, Finding } from "./check";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function title(report: CheckReport, fallbackName: string): string {
  const name = report.template?.name ?? fallbackName;
  return report.template?.version ? `${name} v${report.template.version}` : name;
}

/** "2 errors, 1 warning" (notes only when there are some). */
export function summary(report: CheckReport): string {
  const { error, warn, info } = report.counts;
  if (!error && !warn && !info) {
    return `no problems found in ${plural(report.checkedFiles, report.scope ? `${report.scope.kind} file` : "file")}`;
  }
  const parts = [plural(error, "error"), plural(warn, "warning")];
  if (info) parts.push(plural(info, "note"));
  return parts.join(", ");
}

/**
 *   skelpro check: node-api v2 -- 2 errors, 1 warning
 *     error  tests/                    required folder is missing     [required]
 */
export function formatText(report: CheckReport, fallbackName: string): string {
  const lines = [`skelpro check: ${title(report, fallbackName)} -- ${summary(report)}`];
  if (report.fixed?.length) {
    lines.push("", `Created ${report.fixed.length} missing required folder(s), each with a .gitkeep:`);
    for (const p of report.fixed) lines.push(`  ${p}`);
  }
  if (!report.findings.length) return `${lines.join("\n")}\n`;

  const label = (f: Finding) => (f.severity === "warn" ? "warn " : f.severity === "info" ? "info " : "error");
  const pathWidth = Math.min(48, Math.max(...report.findings.map((f) => f.path.length)));
  const messageWidth = Math.min(56, Math.max(...report.findings.map((f) => f.message.length)));

  lines.push("");
  for (const f of report.findings) {
    lines.push(`  ${label(f)}  ${f.path.padEnd(pathWidth)}  ${f.message.padEnd(messageWidth)}  [${f.rule}]`);
  }

  const suggestions = report.findings.filter((f) => f.suggestion).map((f) => f.suggestion!);
  if (suggestions.length) {
    lines.push("", "Suggested fixes (not run):");
    for (const s of suggestions) lines.push(`  ${s}`);
  }

  return `${lines.join("\n")}\n`;
}

// GitHub workflow commands: https://docs.github.com/actions/reference/workflow-commands-for-github-actions
const escapeData = (s: string) => s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
const escapeProperty = (s: string) => escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");

const LEVEL = { error: "error", warn: "warning", info: "notice" } as const;

/** One annotation per finding, so problems show inline on pull requests. */
export function formatGithub(report: CheckReport, fallbackName: string): string {
  const lines = report.findings.map((f) => {
    const file = escapeProperty(f.path.replace(/\/$/, ""));
    const t = escapeProperty(`skelpro check (${f.rule})`);
    const message = escapeData(f.suggestion ? `${f.message}. Suggested: ${f.suggestion}` : f.message);
    return `::${LEVEL[f.severity]} file=${file},title=${t}::${message}`;
  });
  lines.push(`skelpro check: ${title(report, fallbackName)} -- ${summary(report)}`);
  return `${lines.join("\n")}\n`;
}
