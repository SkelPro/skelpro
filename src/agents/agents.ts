/**
 * `skelpro agents`: isolated Git worktrees in an existing repository, one
 * per agent or task, optionally with a feature skeleton from a template.
 *
 * - Worktrees live in a sibling folder, ../<repo>.agents/<name>, so they
 *   never show up inside the repository or its search results.
 * - Branches are agent/<name>, validated with git check-ref-format.
 * - Spawned worktrees are recorded in .git/skelpro-agents.json (inside .git,
 *   so never committed). list and cleanup only touch worktrees recorded there.
 * - cleanup refuses to lose work: uncommitted changes and unmerged commits
 *   need --force, and it never deletes a folder Git doesn't list as one of
 *   its worktrees.
 * - Every git call uses argument arrays (no shell).
 */
import fs from "fs";
import path from "path";
import { git, validateBranchName } from "../utils/git";
import { SkelproError } from "../core/errors";

export interface AgentRecord {
  name: string;
  branch: string;
  /** The ref it was created from, e.g. "main". */
  base: string;
  /** The commit it started at. */
  baseCommit: string;
  path: string;
  createdAt: string;
}

export interface AgentsConfig {
  /** Folder for worktrees; default ../<repo>.agents. Relative paths are relative to the repo. */
  dir?: string;
  /** Untracked files to copy into each new worktree, such as ".env.local". */
  copy?: string[];
}

export interface AgentStatus extends AgentRecord {
  /** missing: the folder is gone; detached: git no longer lists it as a worktree. */
  state: "ok" | "missing" | "detached";
  ahead: number;
  behind: number;
  /** Uncommitted (including untracked) files. */
  changes: number;
  merged: boolean;
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const TRACKING_FILE = "skelpro-agents.json";

// ---------------------------------------------------------------- repository

export interface Repo {
  root: string;
  /** The shared .git folder (the same for every worktree). */
  commonDir: string;
}

export function openRepo(cwd: string): Repo {
  let root: string;
  try {
    root = git(["rev-parse", "--show-toplevel"], cwd);
  } catch {
    throw new SkelproError("not_found", `${path.resolve(cwd)} isn't inside a Git repository.`, "Run this in a repository.");
  }
  const commonDir = path.resolve(root, git(["rev-parse", "--git-common-dir"], root));
  return { root: path.resolve(root), commonDir };
}

function trackingPath(repo: Repo): string {
  return path.join(repo.commonDir, TRACKING_FILE);
}

export function readRecords(repo: Repo): AgentRecord[] {
  const file = trackingPath(repo);
  if (!fs.existsSync(file)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(data?.agents) ? data.agents : [];
  } catch {
    throw new SkelproError("invalid_input", `${file} is not valid JSON; fix or delete it.`);
  }
}

function writeRecords(repo: Repo, records: AgentRecord[]): void {
  fs.writeFileSync(trackingPath(repo), `${JSON.stringify({ agents: records }, null, 2)}\n`);
}

/**
 * The "agents" settings: from the repository's .skelpro/config.json (shared
 * with the team) if it has them, otherwise from ~/.skelpro/config.json.
 */
export function loadAgentsConfig(repo: Repo, home: string): AgentsConfig {
  for (const file of [path.join(repo.root, ".skelpro", "config.json"), path.join(home, "config.json")]) {
    if (!fs.existsSync(file)) continue;
    let raw: unknown;
    try {
      raw = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
      throw new SkelproError("invalid_input", `${file} is not valid JSON: ${(error as Error).message}`);
    }
    const agents = (raw as { agents?: unknown })?.agents;
    if (agents === undefined) continue;

    const valid =
      typeof agents === "object" &&
      agents !== null &&
      ((agents as AgentsConfig).dir === undefined || typeof (agents as AgentsConfig).dir === "string") &&
      ((agents as AgentsConfig).copy === undefined ||
        (Array.isArray((agents as AgentsConfig).copy) && (agents as AgentsConfig).copy!.every((c) => typeof c === "string")));
    if (!valid) {
      throw new SkelproError(
        "invalid_input",
        `${file}: "agents" should look like {"dir": "../my-agents", "copy": [".env.local"]}.`,
      );
    }
    return agents as AgentsConfig;
  }
  return {};
}

export function agentsDir(repo: Repo, config: AgentsConfig = {}): string {
  if (config.dir) return path.resolve(repo.root, config.dir);
  return path.join(path.dirname(repo.root), `${path.basename(repo.root)}.agents`);
}

/** Paths of every worktree git knows, canonicalised for comparison. */
function registeredWorktrees(repo: Repo): Set<string> {
  return new Set(
    git(["worktree", "list", "--porcelain"], repo.root)
      .split(/\r?\n/)
      .filter((l) => l.startsWith("worktree "))
      .map((l) => canonical(l.slice("worktree ".length))),
  );
}

function canonical(p: string): string {
  let r = path.resolve(p);
  try {
    r = fs.realpathSync.native(r);
  } catch {
    // gone; compare as given
  }
  return process.platform === "win32" ? r.toLowerCase() : r;
}

const branchExists = (repo: Repo, branch: string) => {
  try {
    git(["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], repo.root);
    return true;
  } catch {
    return false;
  }
};

// ---------------------------------------------------------------- spawn

export interface SpawnOptions {
  names: string[];
  /** Ref to branch from; default the current HEAD. */
  from?: string;
  config?: AgentsConfig;
}

/** Names for --count N --prefix p: p-1 ... p-N, skipping ones already in use. */
export function numberedNames(repo: Repo, prefix: string, count: number): string[] {
  if (!Number.isInteger(count) || count < 1 || count > 50) {
    throw new SkelproError("invalid_input", "--count must be a whole number from 1 to 50.");
  }
  const used = new Set(readRecords(repo).map((r) => r.name));
  const names: string[] = [];
  for (let i = 1; names.length < count; i++) {
    const name = `${prefix}-${i}`;
    if (!used.has(name) && !branchExists(repo, `agent/${name}`)) names.push(name);
  }
  return names;
}

/** Validates everything first, then creates each worktree. Returns the new records. */
export function spawnAgents(repo: Repo, options: SpawnOptions): AgentRecord[] {
  const { names } = options;
  if (!names.length) throw new SkelproError("invalid_input", "Give at least one name, or use --count.");

  const base = options.from ?? git(["rev-parse", "--abbrev-ref", "HEAD"], repo.root);
  let baseCommit: string;
  try {
    if (base.startsWith("-")) throw new Error();
    baseCommit = git(["rev-parse", "--verify", "--quiet", `${base}^{commit}`], repo.root);
  } catch {
    throw new SkelproError("not_found", `--from ${base} isn't a branch, tag or commit in this repository.`);
  }

  const dir = agentsDir(repo, options.config);
  const existing = readRecords(repo);
  const seen = new Set<string>();

  for (const name of names) {
    if (!NAME.test(name)) {
      throw new SkelproError("invalid_input", `Invalid agent name "${name}".`, "Use letters, digits, ., _ and -.");
    }
    if (seen.has(name)) throw new SkelproError("invalid_input", `"${name}" is listed twice.`);
    seen.add(name);
    validateBranchName(`agent/${name}`);
    if (existing.some((r) => r.name === name)) {
      throw new SkelproError("conflicts", `An agent worktree named "${name}" already exists.`, `Clean it up first: skelpro agents cleanup ${name}`);
    }
    if (branchExists(repo, `agent/${name}`)) {
      throw new SkelproError("conflicts", `Branch agent/${name} already exists.`, "Pick another name, or delete the branch.");
    }
    if (fs.existsSync(path.join(dir, name))) {
      throw new SkelproError("conflicts", `${path.join(dir, name)} already exists.`, "Pick another name.");
    }
  }

  const created: AgentRecord[] = [];
  for (const name of names) {
    const branch = `agent/${name}`;
    const worktree = path.join(dir, name);
    fs.mkdirSync(dir, { recursive: true });
    git(["worktree", "add", "-b", branch, worktree, baseCommit], repo.root);

    for (const file of options.config?.copy ?? []) copyIntoWorktree(repo.root, worktree, file);

    const record: AgentRecord = {
      name,
      branch,
      base,
      baseCommit,
      path: worktree,
      createdAt: new Date().toISOString(),
    };
    created.push(record);
    writeRecords(repo, [...readRecords(repo), record]); // record each as it's made
  }
  return created;
}

/** Copies one untracked file (such as .env.local) from the repo into a worktree. */
function copyIntoWorktree(repoRoot: string, worktree: string, rel: string): void {
  const parts = rel.split(/[\\/]+/);
  if (!rel || path.isAbsolute(rel) || parts.includes("..")) {
    throw new SkelproError("invalid_input", `agents.copy entry "${rel}" must be a relative path inside the repository.`);
  }
  const from = path.join(repoRoot, rel);
  const to = path.join(worktree, rel);
  if (!fs.existsSync(from) || fs.existsSync(to)) return; // nothing to copy, or tracked and already there
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

// ---------------------------------------------------------------- list

export function agentStatuses(repo: Repo): AgentStatus[] {
  const registered = registeredWorktrees(repo);
  return readRecords(repo).map((record) => {
    const exists = fs.existsSync(record.path);
    const state: AgentStatus["state"] = !exists ? "missing" : registered.has(canonical(record.path)) ? "ok" : "detached";

    let ahead = 0;
    let behind = 0;
    let merged = false;
    if (branchExists(repo, record.branch)) {
      // Spawned from a detached HEAD: compare with the commit it started at.
      const baseRef = record.base === "HEAD" ? record.baseCommit : record.base;
      try {
        const [b, a] = git(["rev-list", "--left-right", "--count", `${baseRef}...${record.branch}`], repo.root)
          .split(/\s+/)
          .map(Number);
        behind = b;
        ahead = a;
      } catch {
        // base ref gone; fall back to the commit it started at
        ahead = Number(git(["rev-list", "--count", `${record.baseCommit}..${record.branch}`], repo.root));
      }
      merged = ahead === 0;
    }

    let changes = 0;
    if (state === "ok") {
      changes = git(["status", "--porcelain", "--untracked-files=all"], record.path)
        .split(/\r?\n/)
        .filter(Boolean).length;
    }
    return { ...record, state, ahead, behind, changes, merged };
  });
}

// ---------------------------------------------------------------- cleanup

export interface CleanupOptions {
  names?: string[];
  /** Every agent whose branch has no commits beyond its base. */
  merged?: boolean;
  force?: boolean;
}

export interface CleanupResult {
  removed: string[];
  /** name → why it was kept. */
  refused: Array<{ name: string; reason: string }>;
}

export function cleanupAgents(repo: Repo, options: CleanupOptions): CleanupResult {
  const statuses = agentStatuses(repo);
  let targets: AgentStatus[];

  if (options.merged) {
    if (options.names?.length) throw new SkelproError("invalid_input", "Use either names or --merged, not both.");
    targets = statuses.filter((s) => s.merged);
  } else {
    if (!options.names?.length) throw new SkelproError("invalid_input", "Name the agents to clean up, or use --merged.");
    const unknown = options.names.filter((n) => !statuses.some((s) => s.name === n));
    if (unknown.length) {
      throw new SkelproError(
        "not_found",
        `No agent worktree named ${unknown.join(", ")}.`,
        statuses.length ? `Known agents: ${statuses.map((s) => s.name).join(", ")}.` : "There are no agent worktrees.",
      );
    }
    targets = statuses.filter((s) => options.names!.includes(s.name));
  }

  const result: CleanupResult = { removed: [], refused: [] };

  for (const agent of targets) {
    // Check everything before touching anything.
    if (agent.state === "detached") {
      result.refused.push({
        name: agent.name,
        reason: `${agent.path} exists but Git no longer lists it as a worktree, so SkelPro won't delete it. Check it and remove it by hand.`,
      });
      continue;
    }
    if (agent.state === "ok" && agent.changes > 0 && !options.force) {
      result.refused.push({
        name: agent.name,
        reason: `${agent.changes} uncommitted file(s) in ${agent.path} would be lost. Commit them, or use --force to discard them.`,
      });
      continue;
    }
    if (!agent.merged && branchExists(repo, agent.branch) && !options.force) {
      result.refused.push({
        name: agent.name,
        reason: `${agent.branch} has ${agent.ahead} commit(s) not in ${agent.base}; deleting it would lose them. Merge it first, or use --force.`,
      });
      continue;
    }

    if (agent.state === "ok") {
      git(["worktree", "remove", ...(options.force ? ["--force"] : []), agent.path], repo.root);
    }
    git(["worktree", "prune"], repo.root);
    // Only leftovers git has already let go of (e.g. files locked on Windows).
    if (agent.state === "ok" && fs.existsSync(agent.path) && !registeredWorktrees(repo).has(canonical(agent.path))) {
      fs.rmSync(agent.path, { recursive: true, force: true });
    }
    if (branchExists(repo, agent.branch)) git(["branch", "-D", agent.branch], repo.root);

    writeRecords(repo, readRecords(repo).filter((r) => r.name !== agent.name));
    result.removed.push(agent.name);
  }

  return result;
}
