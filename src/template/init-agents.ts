/**
 * `skelpro init-agents`: brings an existing project (not made with SkelPro)
 * into the agent workflow by adding AGENTS.md, pointer files and a
 * .skelpro.json manifest. The layout is inferred from the folders that
 * exist, with a TODO for each purpose for the team to fill in.
 *
 * Planning is separate from writing so --dry-run shows exactly what would
 * happen, and nothing the project already has is overwritten.
 */
import fs from "fs";
import path from "path";
import { createIgnoreMatcher } from "../utils/ignore";
import { safeJoin } from "../utils/paths";
import { assertRelativePath } from "./render";
import {
  AGENTS_FILE,
  MANIFEST_FILE,
  agentsMarkdown,
  pointerContent,
  type Manifest,
  type ResolvedLayout,
} from "./agents";

export const TODO_PURPOSE = "TODO: describe what belongs here";
export const TODO_INSTRUCTIONS =
  "TODO: describe how to build, test and run this project, and any conventions agents must follow.";

/** Folders whose subfolders are usually worth describing too. */
const CONTAINER_FOLDERS = ["src", "app", "lib", "packages", "apps", "services"];
const MAX_LAYOUT_ENTRIES = 40;

export interface InitAgentsOptions {
  /** Pointer files to add, such as CLAUDE.md. */
  pointerFiles?: string[];
  /** Replace an existing .skelpro.json. */
  force?: boolean;
  skelproVersion: string;
  now?: Date;
}

export type PlannedChange =
  | { path: string; action: "create"; content: string }
  | { path: string; action: "append"; content: string }
  | { path: string; action: "replace"; content: string }
  | { path: string; action: "skip"; reason: string };

export interface InitPlan {
  root: string;
  layout: ResolvedLayout;
  changes: PlannedChange[];
}

/** Folders worth describing: top level, plus one level inside src/, packages/ and similar. */
export function inferLayout(root: string): ResolvedLayout {
  const matcher = createIgnoreMatcher(root);
  const folders = (rel: string): string[] => {
    const abs = rel ? path.join(root, rel) : root;
    return fs
      .readdirSync(abs, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("."))
      .map((d) => (rel ? `${rel}/${d.name}` : d.name))
      .filter((p) => !matcher.ignores(p, true))
      .sort((a, b) => a.localeCompare(b));
  };

  const paths: string[] = [];
  for (const top of folders("")) {
    paths.push(top);
    if (CONTAINER_FOLDERS.includes(top)) paths.push(...folders(top));
  }

  const layout: ResolvedLayout = {};
  for (const p of paths.slice(0, MAX_LAYOUT_ENTRIES)) layout[p] = { purpose: TODO_PURPOSE };
  return layout;
}

const pad = (n: number) => String(n).padStart(2, "0");
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function planInitAgents(dir: string, options: InitAgentsOptions): InitPlan {
  const root = path.resolve(dir);
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) {
    throw new Error(`Not a folder: ${root}`);
  }

  const manifestPath = path.join(root, MANIFEST_FILE);
  if (fs.existsSync(manifestPath) && !options.force) {
    throw new Error(
      `${MANIFEST_FILE} already exists in ${root}; this project is already set up. ` +
        `Re-run with --force to regenerate it (AGENTS.md and pointer files are never overwritten).`,
    );
  }

  const layout = inferLayout(root);
  const changes: PlannedChange[] = [];

  // AGENTS.md: create it, or add a layout section to the one that's there.
  const agentsPath = path.join(root, AGENTS_FILE);
  if (!fs.existsSync(agentsPath)) {
    changes.push({
      path: AGENTS_FILE,
      action: "create",
      content: agentsMarkdown({
        projectName: path.basename(root),
        instructions: TODO_INSTRUCTIONS,
        layout,
      })!,
    });
  } else {
    const existing = fs.readFileSync(agentsPath, "utf8");
    if (/^##\s+Project layout\s*$/im.test(existing)) {
      changes.push({ path: AGENTS_FILE, action: "skip", reason: "already has a Project layout section" });
    } else if (!Object.keys(layout).length) {
      changes.push({ path: AGENTS_FILE, action: "skip", reason: "no folders to describe" });
    } else {
      changes.push({
        path: AGENTS_FILE,
        action: "append",
        content: agentsMarkdown({ existing, projectName: path.basename(root), layout })!,
      });
    }
  }

  for (const raw of options.pointerFiles ?? []) {
    const p = raw.replace(/^\.\//, "").replace(/\\/g, "/");
    assertRelativePath(p, "--pointer");
    if (p === AGENTS_FILE) throw new Error("--pointer can't be AGENTS.md itself.");
    safeJoin(root, p); // belt and braces: must resolve inside the project

    if (fs.existsSync(path.join(root, p))) {
      changes.push({ path: p, action: "skip", reason: "already exists" });
    } else {
      changes.push({ path: p, action: "create", content: pointerContent(p) });
    }
  }

  const manifest: Manifest = {
    skelpro: 1,
    template: {},
    generatedBy: `skelpro@${options.skelproVersion}`,
    createdAt: isoDate(options.now ?? new Date()),
    variables: {},
    layout,
    rules: [],
  };
  changes.push({
    path: MANIFEST_FILE,
    action: fs.existsSync(manifestPath) ? "replace" : "create",
    content: `${JSON.stringify(manifest, null, 2)}\n`,
  });

  return { root, layout, changes };
}

/** Writes a plan. Only "create", "append" (to AGENTS.md) and a forced manifest "replace" touch disk. */
export function applyInitPlan(plan: InitPlan): void {
  for (const change of plan.changes) {
    if (change.action === "skip") continue;
    const target = safeJoin(plan.root, change.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // "wx" refuses to clobber a file that appeared since planning.
    fs.writeFileSync(target, change.content, change.action === "create" ? { flag: "wx" } : undefined);
  }
}
