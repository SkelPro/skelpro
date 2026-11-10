/**
 * Agent-ready output for v2 templates: AGENTS.md (with a generated
 * "Project layout" section), pointer files such as CLAUDE.md, and the
 * .skelpro.json manifest that `skelpro check` (Feature 4) reads.
 *
 * Pure: adds entries to the rendered file tree, which scaffoldJSON then
 * writes with the same path checks and all-or-nothing behaviour as every
 * other file.
 */
import path from "path";
import type { JsonStructure } from "../types/structures";
import {
  assertRelativePath,
  evaluateCondition,
  renderString,
  type LayoutEntry,
  type ParsedTemplate,
  type Rule,
  type Variables,
} from "./render";

export const MANIFEST_FILE = ".skelpro.json";
export const AGENTS_FILE = "AGENTS.md";
/** Ends the layout section, so agents verify their own work against it. */
export const CHECK_HINT = "Check structure with `npx skelpro check`.";
/** Put this line in a template's own AGENTS.md to choose where the layout goes. */
export const LAYOUT_MARKER = "<!-- skelpro:layout -->";

export type ResolvedLayout = Record<string, Omit<LayoutEntry, "$when">>;

export interface Manifest {
  skelpro: 1;
  template: { name?: string; version?: string; source?: string };
  generatedBy: string;
  createdAt: string;
  variables: Variables;
  layout: ResolvedLayout;
  rules: Rule[];
}

/** Layout with $when applied and placeholders rendered. */
export function resolveLayout(template: ParsedTemplate, vars: Variables): ResolvedLayout {
  const out: ResolvedLayout = {};
  for (const [rawPath, entry] of Object.entries(template.layout)) {
    const where = `layout "${rawPath}"`;
    if (entry.$when !== undefined && !evaluateCondition(entry.$when, vars, where)) continue;

    const p = renderString(rawPath, vars, where).replace(/[\\/]+$/, "").replace(/\\/g, "/");
    assertRelativePath(p, "layout"); // again after rendering: values can't add ..
    const { $when: _when, ...rest } = entry;
    out[p] = { ...rest, purpose: renderString(entry.purpose, vars, where) };
  }
  return out;
}

export function resolveRules(template: ParsedTemplate, vars: Variables): Rule[] {
  return template.rules.map((rule) => {
    const r = (glob: string) => renderString(glob, vars, `rule "${rule.id}"`);
    return "forbid" in rule
      ? { ...rule, forbid: r(rule.forbid), ...(rule.except ? { except: rule.except.map(r) } : {}) }
      : { ...rule, match: r(rule.match), expect: r(rule.expect) };
  });
}

/** "Business logic" → "business logic", but "HTTP handlers" stays. */
function lowerFirst(text: string): string {
  return /^[A-Z][^A-Z]/.test(text) ? text.charAt(0).toLowerCase() + text.slice(1) : text;
}

export function layoutSection(layout: ResolvedLayout): string {
  const lines = Object.entries(layout).map(([p, entry]) => {
    const notes = [entry.naming ? `${entry.naming} names` : "", entry.required ? "required" : ""].filter(Boolean);
    return `- \`${p}/\`: ${lowerFirst(entry.purpose)}${notes.length ? ` (${notes.join(", ")})` : ""}`;
  });
  return `## Project layout\n\n${lines.join("\n")}\n\n${CHECK_HINT}\n`;
}

/**
 * Builds AGENTS.md from the template's own AGENTS.md (if any), the
 * instructions and the layout. Returns undefined when there's nothing to say.
 */
export function agentsMarkdown(options: {
  existing?: string;
  projectName: string;
  instructions?: string;
  layout: ResolvedLayout;
}): string | undefined {
  const { existing, projectName, instructions, layout } = options;
  const hasLayout = Object.keys(layout).length > 0;
  if (existing === undefined && !instructions && !hasLayout) return undefined;

  const trimEnd = (s: string) => s.replace(/\s+$/, "");
  let doc = existing !== undefined ? trimEnd(existing) : `# ${projectName}`;

  if (instructions) doc += `\n\n${trimEnd(instructions)}`;

  if (hasLayout) {
    const section = trimEnd(layoutSection(layout));
    doc = doc.includes(LAYOUT_MARKER) ? doc.replace(LAYOUT_MARKER, section) : `${doc}\n\n${section}`;
  } else {
    doc = doc.replace(`\n${LAYOUT_MARKER}`, "").replace(LAYOUT_MARKER, "");
  }

  return `${trimEnd(doc)}\n`;
}

/** One line pointing at AGENTS.md, with a link that works from the pointer's folder. */
export function pointerContent(pointerPath: string): string {
  const dir = path.posix.dirname(pointerPath.replace(/\\/g, "/"));
  const link = path.posix.relative(dir, AGENTS_FILE) || AGENTS_FILE;
  return `See [AGENTS.md](${link}) for this project's conventions and layout.\n`;
}

/** Where a template came from, safe to commit: no local absolute paths, no URL credentials. */
export function manifestSource(source: string, projectDir: string): string {
  if (/^https?:\/\//i.test(source)) {
    try {
      const url = new URL(source);
      url.username = "";
      url.password = "";
      url.search = ""; // raw URLs often carry access tokens
      url.hash = "";
      return url.toString();
    } catch {
      return source.split(/[?#]/)[0];
    }
  }
  return path.relative(path.resolve(projectDir), path.resolve(source)).split(path.sep).join("/");
}

/** True if the tree already has a file at this (possibly nested) path. */
function hasPath(tree: JsonStructure, p: string): boolean {
  if (p in tree) return true;
  const [head, ...rest] = p.split("/");
  const child = tree[head];
  return rest.length > 0 && typeof child === "object" && child !== null && hasPath(child as JsonStructure, rest.join("/"));
}

export interface AgentFileOptions {
  /** Template path or URL as given to `create`. */
  source: string;
  projectDir: string;
  skelproVersion: string;
}

/**
 * Adds AGENTS.md, pointer files and .skelpro.json to a rendered v2 tree.
 * v1 templates are returned unchanged.
 */
export function addAgentFiles(
  template: ParsedTemplate,
  vars: Variables,
  files: JsonStructure,
  options: AgentFileOptions,
): JsonStructure {
  if (template.version === 1) return files;

  const out: JsonStructure = { ...files };
  const layout = resolveLayout(template, vars);
  const rules = resolveRules(template, vars);

  const existing = typeof files[AGENTS_FILE] === "string" ? (files[AGENTS_FILE] as string) : undefined;
  const instructions = template.agents?.instructions
    ? renderString(template.agents.instructions, vars, "agents.instructions")
    : undefined;
  const markdown = agentsMarkdown({ existing, projectName: String(vars.projectName), instructions, layout });

  if (markdown !== undefined) {
    out[AGENTS_FILE] = markdown;
    for (const pointer of template.agents?.pointerFiles ?? []) {
      const p = pointer.replace(/^\.\//, "").replace(/\\/g, "/");
      // A file the template wrote itself wins over the generated pointer.
      if (!hasPath(files, p)) out[p] = pointerContent(p);
    }
  }

  const declared: Variables = {};
  for (const name of Object.keys(template.variables)) declared[name] = vars[name];

  const manifest: Manifest = {
    skelpro: 1,
    template: {
      ...(template.name ? { name: template.name } : {}),
      ...(template.templateVersion ? { version: template.templateVersion } : {}),
      source: manifestSource(options.source, options.projectDir),
    },
    generatedBy: `skelpro@${options.skelproVersion}`,
    createdAt: String(vars.date),
    variables: declared,
    layout,
    rules,
  };
  out[MANIFEST_FILE] = `${JSON.stringify(manifest, null, 2)}\n`;

  return out;
}
