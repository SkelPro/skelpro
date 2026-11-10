/**
 * `skelpro check`: compares a project's structure with its layout and
 * rules. Paths and names only, never file contents.
 *
 * The project tree is walked once (with the same ignore rules as `save`),
 * then every check is a pure function over the list of paths, so each one
 * is easy to test and the MCP server can return the report as-is.
 */
import fs from "fs";
import path from "path";
import { minimatch } from "minimatch";
import { createIgnoreMatcher } from "../utils/ignore";
import { CASE_HELPERS, type NamingStyle, type Rule, type Severity } from "../template/render";
import type { ResolvedLayout } from "../template/agents";
import { limitToPaths } from "./scope";

export interface Finding {
  severity: Severity;
  /** Project-relative path, folders ending in "/". */
  path: string;
  message: string;
  /** Built-in check name (required, naming, unknown-folder, todo) or a rule id. */
  rule: string;
  /** A suggested command, such as a git mv for a naming problem. */
  suggestion?: string;
}

export interface CheckConfig {
  layout: ResolvedLayout;
  rules: Rule[];
  /** rule id → globs of paths where that rule is switched off. */
  ignore?: Record<string, string[]>;
}

export interface ProjectPaths {
  files: string[];
  dirs: string[];
}

export interface CheckReport {
  template?: { name?: string; version?: string };
  findings: Finding[];
  counts: Record<Severity, number>;
  checkedFiles: number;
  /** Set with --staged / --changed: only findings about these files are reported. */
  scope?: { kind: "staged" | "changed"; files: string[] };
  /** Folders created by --fix. */
  fixed?: string[];
}

export interface ReportOptions {
  /** Only report findings about these files (--staged / --changed). */
  scope?: { kind: "staged" | "changed"; files: string[] };
  fixed?: string[];
}

const GLOB = { dot: true } as const;

/** Every file and folder in the project, skipping what `save` would skip. */
export function listProjectPaths(root: string): ProjectPaths {
  const matcher = createIgnoreMatcher(root);
  const files: string[] = [];
  const dirs: string[] = [];

  const walk = (rel: string) => {
    for (const entry of fs.readdirSync(rel ? path.join(root, rel) : root, { withFileTypes: true })) {
      const p = rel ? `${rel}/${entry.name}` : entry.name;
      const isDir = entry.isDirectory();
      if (matcher.ignores(p, isDir)) continue;
      if (isDir) {
        dirs.push(p);
        walk(p);
      } else if (entry.isFile()) {
        files.push(p);
      }
    }
  };

  walk("");
  return { files: files.sort(), dirs: dirs.sort() };
}

// ---------------------------------------------------------------- naming

const NAMING_PATTERNS: Record<NamingStyle, RegExp> = {
  "kebab-case": /^[a-z0-9]+(-[a-z0-9]+)*$/,
  camelCase: /^[a-z][a-zA-Z0-9]*$/,
  PascalCase: /^[A-Z][a-zA-Z0-9]*$/,
  snake_case: /^[a-z0-9]+(_[a-z0-9]+)*$/,
  UPPER_CASE: /^[A-Z0-9]+(_[A-Z0-9]+)*$/,
};

const NAMING_HELPER: Record<NamingStyle, keyof typeof CASE_HELPERS> = {
  "kebab-case": "kebab",
  camelCase: "camel",
  PascalCase: "pascal",
  snake_case: "snake",
  UPPER_CASE: "upper",
};

/** "UserRoutes.test.ts" → ["UserRoutes", ".test.ts"]; ".eslintrc" has no stem to check. */
function splitName(name: string): [string, string] {
  const dot = name.indexOf(".", 1);
  return dot === -1 ? [name, ""] : [name.slice(0, dot), name.slice(dot)];
}

// ---------------------------------------------------------------- companions

const hasGlobChars = (s: string) => /[*?[\]{}!]/.test(s);

/** Literal folders before the first segment with glob characters. */
function literalPrefix(dirPattern: string): string {
  const out: string[] = [];
  for (const segment of dirPattern.split("/").filter(Boolean)) {
    if (hasGlobChars(segment)) break;
    out.push(segment);
  }
  return out.join("/");
}

interface CompanionMapping {
  matchBase: RegExp;
  expectBase: string;
  matchPrefix: string;
  expectPrefix: string;
}

/**
 * Works out how a file maps to its companion from the two globs: the file
 * name parts must each have exactly one "*" (billing.ts ↔ billing.test.ts),
 * and the folders map by their literal prefixes (src/** ↔ tests/**).
 */
export function companionMapping(rule: { id: string; match: string; expect: string }): CompanionMapping {
  const split = (glob: string) => {
    const i = glob.lastIndexOf("/");
    return i === -1 ? ["", glob] : [glob.slice(0, i), glob.slice(i + 1)];
  };
  const [matchDir, matchBase] = split(rule.match);
  const [expectDir, expectBase] = split(rule.expect);
  const stars = (s: string) => (s.match(/\*/g) ?? []).length;

  if (stars(matchBase) !== 1 || stars(expectBase) !== 1 || /[?[\]{}!]/.test(matchBase + expectBase)) {
    throw new Error(
      `Rule "${rule.id}": the file names in "match" and "expect" must each contain exactly one * ` +
        `(for example "src/**/*.ts" and "src/**/*.test.ts").`,
    );
  }

  const escape = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return {
    matchBase: new RegExp(`^${escape(matchBase).replace("*", "(.+)")}$`),
    expectBase,
    matchPrefix: literalPrefix(matchDir),
    expectPrefix: literalPrefix(expectDir),
  };
}

/** The companion a file should have, or undefined if the file doesn't map. */
export function companionFor(file: string, mapping: CompanionMapping): string | undefined {
  const slash = file.lastIndexOf("/");
  const dir = slash === -1 ? "" : file.slice(0, slash);
  const base = file.slice(slash + 1);
  const stem = mapping.matchBase.exec(base)?.[1];
  if (stem === undefined) return undefined;

  const inPrefix = !mapping.matchPrefix || dir === mapping.matchPrefix || dir.startsWith(`${mapping.matchPrefix}/`);
  if (!inPrefix) return undefined;

  const rest = mapping.matchPrefix ? dir.slice(mapping.matchPrefix.length).replace(/^\//, "") : dir;
  const companionDir = [mapping.expectPrefix, rest].filter(Boolean).join("/");
  const companionBase = mapping.expectBase.replace("*", stem);
  return companionDir ? `${companionDir}/${companionBase}` : companionBase;
}

// ---------------------------------------------------------------- unknown folders

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
  }
  return dp[a.length][b.length];
}

/** Folder names that usually mean the same thing (helpers/ vs src/lib/). */
const SYNONYMS: string[][] = [
  ["lib", "libs", "helpers", "helper", "utils", "util", "utilities", "common", "shared"],
  ["test", "tests", "spec", "specs", "__tests__", "e2e"],
  ["doc", "docs", "documentation"],
  ["script", "scripts", "bin", "tools", "tooling"],
  ["src", "source", "sources", "code"],
  ["asset", "assets", "static", "public", "resources"],
  ["config", "configs", "configuration", "settings"],
  ["component", "components", "ui", "widgets"],
  ["service", "services", "domain"],
  ["route", "routes", "routers", "controllers", "handlers", "api"],
];

const sameMeaning = (a: string, b: string) => SYNONYMS.some((group) => group.includes(a) && group.includes(b));

/** The layout folder that a stray folder name most likely meant. */
function closestLayoutPath(name: string, layoutPaths: string[]): string | undefined {
  let best: { p: string; score: number } | undefined;
  const lower = name.toLowerCase();
  for (const p of layoutPaths) {
    const base = p.split("/").pop()!.toLowerCase();
    const score =
      base === lower
        ? 0
        : sameMeaning(base, lower)
          ? 1
          : base.includes(lower) || lower.includes(base)
            ? 1
            : editDistance(lower, base);
    if (score <= Math.max(2, Math.floor(base.length / 3)) && (!best || score < best.score)) best = { p, score };
  }
  return best?.p;
}

// ---------------------------------------------------------------- the checks

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

export function runChecks(config: CheckConfig, project: ProjectPaths): Finding[] {
  const findings: Finding[] = [];
  const fileSet = new Set(project.files);
  const dirSet = new Set(project.dirs);
  const layoutPaths = Object.keys(config.layout);

  // Required folders
  for (const [p, entry] of Object.entries(config.layout)) {
    if (entry.required && !dirSet.has(p)) {
      findings.push({ severity: "error", path: `${p}/`, message: "required folder is missing", rule: "required" });
    }
  }

  // Purposes still left as TODO (from init-agents)
  for (const [p, entry] of Object.entries(config.layout)) {
    if (/^\s*TODO\b/.test(entry.purpose)) {
      findings.push({
        severity: "info",
        path: `${p}/`,
        message: "purpose is still a TODO in .skelpro.json and AGENTS.md",
        rule: "todo",
      });
    }
  }

  // Naming conventions (files directly inside each folder)
  for (const [p, entry] of Object.entries(config.layout)) {
    if (!entry.naming) continue;
    const pattern = NAMING_PATTERNS[entry.naming];
    for (const file of project.files) {
      if (file.slice(0, file.lastIndexOf("/")) !== p) continue;
      const name = file.slice(p.length + 1);
      const [stem, ext] = splitName(name);
      if (!stem || pattern.test(stem)) continue;
      const fixed = `${CASE_HELPERS[NAMING_HELPER[entry.naming]](stem)}${ext}`;
      findings.push({
        severity: "warn",
        path: file,
        message: `use ${entry.naming}: ${fixed}`,
        rule: "naming",
        suggestion: `git mv "${file}" "${p}/${fixed}"`,
      });
    }
  }

  for (const rule of config.rules) {
    if ("forbid" in rule) {
      // Forbidden files
      for (const file of project.files) {
        if (!minimatch(file, rule.forbid, GLOB)) continue;
        if ((rule.except ?? []).some((e) => minimatch(file, e, GLOB))) continue;
        const where = rule.forbid.includes("/") ? `(matches ${rule.forbid})` : "in project root";
        findings.push({ severity: rule.severity, path: file, message: `not allowed ${where}`, rule: rule.id });
      }
    } else {
      // Expected companions
      const mapping = companionMapping(rule);
      for (const file of project.files) {
        if (!minimatch(file, rule.match, GLOB) || minimatch(file, rule.expect, GLOB)) continue;
        const companion = companionFor(file, mapping);
        if (companion && !fileSet.has(companion)) {
          const folderOf = (p: string) => p.slice(0, p.lastIndexOf("/") + 1);
          const shown = folderOf(companion) === folderOf(file) ? companion.slice(folderOf(companion).length) : companion;
          findings.push({ severity: rule.severity, path: file, message: `has no ${shown}`, rule: rule.id });
        }
      }
    }
  }

  // Unknown top-level folders (only when there's a layout to compare with)
  if (layoutPaths.length) {
    const covered = new Set(layoutPaths.map((p) => p.split("/")[0]));
    for (const dir of project.dirs) {
      if (dir.includes("/") || dir.startsWith(".") || covered.has(dir)) continue;
      const guess = closestLayoutPath(dir, layoutPaths);
      findings.push({
        severity: "info",
        path: `${dir}/`,
        message: `isn't in the layout${guess ? `; did you mean ${guess}/?` : ""}`,
        rule: "unknown-folder",
      });
    }
  }

  // Per-path ignores from .skelpro.json
  const ignore = config.ignore ?? {};
  const kept = findings.filter((f) => {
    const globs = [...(ignore[f.rule] ?? []), ...(ignore["*"] ?? [])];
    const p = f.path.replace(/\/$/, "");
    return !globs.some((g) => minimatch(p, g.replace(/\/$/, ""), GLOB));
  });

  return kept.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.path.localeCompare(b.path),
  );
}

export function buildReport(
  config: CheckConfig,
  project: ProjectPaths,
  template?: CheckReport["template"],
  options: ReportOptions = {},
): CheckReport {
  let findings = runChecks(config, project);
  if (options.scope) findings = limitToPaths(findings, options.scope.files);

  const counts: Record<Severity, number> = { error: 0, warn: 0, info: 0 };
  for (const f of findings) counts[f.severity]++;
  return {
    ...(template ? { template } : {}),
    findings,
    counts,
    checkedFiles: options.scope ? options.scope.files.length : project.files.length,
    ...(options.scope ? { scope: options.scope } : {}),
    ...(options.fixed ? { fixed: options.fixed } : {}),
  };
}

/** 0 = clean, 1 = problems found. (2, SkelPro itself failed, is set by the caller.) */
export function exitCodeFor(report: CheckReport, strict = false): 0 | 1 {
  return report.counts.error > 0 || (strict && report.counts.warn > 0) ? 1 : 0;
}
