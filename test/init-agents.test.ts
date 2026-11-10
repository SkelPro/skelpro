import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  TODO_INSTRUCTIONS,
  TODO_PURPOSE,
  applyInitPlan,
  inferLayout,
  planInitAgents,
} from "../src/template/init-agents";
import { LAYOUT_MARKER } from "../src/template/agents";
import { runCli } from "./helpers/run-cli";

let root: string;
const opts = { skelproVersion: "9.9.9", now: new Date(2026, 10, 10) };

function mkdir(...rels: string[]) {
  for (const rel of rels) fs.mkdirSync(path.join(root, rel), { recursive: true });
}
function write(rel: string, content: string) {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), content);
}
const read = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");
const exists = (rel: string) => fs.existsSync(path.join(root, rel));

beforeEach(() => {
  root = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "skelpro-init-")), "shop-api");
  fs.mkdirSync(root);
});

afterEach(() => {
  fs.rmSync(path.dirname(root), { recursive: true, force: true });
});

describe("inferLayout", () => {
  it("lists top-level folders and one level inside src/, packages/ and similar", () => {
    mkdir("src/routes", "src/services", "tests", "docs", "packages/core", "packages/ui", "scripts");
    expect(Object.keys(inferLayout(root))).toEqual([
      "docs",
      "packages",
      "packages/core",
      "packages/ui",
      "scripts",
      "src",
      "src/routes",
      "src/services",
      "tests",
    ]);
  });

  it("skips ignored, build and hidden folders", () => {
    mkdir("src", "node_modules/x", "dist", "coverage", ".git", ".github/workflows", "generated");
    write(".gitignore", "generated/\n");
    expect(Object.keys(inferLayout(root))).toEqual(["src"]);
  });

  it("doesn't go deeper than one level", () => {
    mkdir("src/a/b/c");
    expect(Object.keys(inferLayout(root))).toEqual(["src", "src/a"]);
  });

  it("marks every purpose as a TODO", () => {
    mkdir("src");
    expect(inferLayout(root)).toEqual({ src: { purpose: TODO_PURPOSE } });
  });
});

describe("a project with no agent files", () => {
  beforeEach(() => mkdir("src/routes", "tests"));

  it("creates AGENTS.md, CLAUDE.md and .skelpro.json", () => {
    applyInitPlan(planInitAgents(root, { ...opts, pointerFiles: ["CLAUDE.md"] }));

    expect(read("AGENTS.md")).toBe(
      `# shop-api\n\n${TODO_INSTRUCTIONS}\n\n## Project layout\n\n` +
        `- \`src/\`: ${TODO_PURPOSE}\n- \`src/routes/\`: ${TODO_PURPOSE}\n- \`tests/\`: ${TODO_PURPOSE}\n\nCheck structure with \`npx skelpro check\`.\n`,
    );
    expect(read("CLAUDE.md")).toBe("See [AGENTS.md](AGENTS.md) for this project's conventions and layout.\n");
    expect(JSON.parse(read(".skelpro.json"))).toEqual({
      skelpro: 1,
      template: {},
      generatedBy: "skelpro@9.9.9",
      createdAt: "2026-11-10",
      variables: {},
      layout: {
        src: { purpose: TODO_PURPOSE },
        "src/routes": { purpose: TODO_PURPOSE },
        tests: { purpose: TODO_PURPOSE },
      },
      rules: [],
    });
  });

  it("creates nested pointer files with a working link", () => {
    applyInitPlan(planInitAgents(root, { ...opts, pointerFiles: [".cursor/rules/agents.mdc"] }));
    expect(read(".cursor/rules/agents.mdc")).toContain("[AGENTS.md](../../AGENTS.md)");
  });
});

describe("never overwrites existing work", () => {
  beforeEach(() => mkdir("src"));

  it("appends the layout to an existing AGENTS.md", () => {
    write("AGENTS.md", "# Our rules\n\nUse pnpm.\n");
    const plan = planInitAgents(root, opts);
    expect(plan.changes.find((c) => c.path === "AGENTS.md")!.action).toBe("append");
    applyInitPlan(plan);
    expect(read("AGENTS.md")).toBe(`# Our rules\n\nUse pnpm.\n\n## Project layout\n\n- \`src/\`: ${TODO_PURPOSE}\n\nCheck structure with \`npx skelpro check\`.\n`);
  });

  it("puts the layout at the marker if there is one", () => {
    write("AGENTS.md", `# Rules\n\n${LAYOUT_MARKER}\n\n## Testing\n\nRun it.\n`);
    applyInitPlan(planInitAgents(root, opts));
    expect(read("AGENTS.md")).toBe(`# Rules\n\n## Project layout\n\n- \`src/\`: ${TODO_PURPOSE}\n\nCheck structure with \`npx skelpro check\`.\n\n## Testing\n\nRun it.\n`);
  });

  it("leaves an AGENTS.md that already has a layout section untouched", () => {
    const original = "# Rules\n\n## Project layout\n\n- `src/`: the code\n";
    write("AGENTS.md", original);
    const plan = planInitAgents(root, opts);
    expect(plan.changes.find((c) => c.path === "AGENTS.md")).toMatchObject({ action: "skip" });
    applyInitPlan(plan);
    expect(read("AGENTS.md")).toBe(original);
  });

  it("leaves existing pointer files untouched", () => {
    write("CLAUDE.md", "my own notes");
    applyInitPlan(planInitAgents(root, { ...opts, pointerFiles: ["CLAUDE.md"] }));
    expect(read("CLAUDE.md")).toBe("my own notes");
  });

  it("refuses when .skelpro.json exists, unless forced", () => {
    write(".skelpro.json", '{"old":true}');
    expect(() => planInitAgents(root, opts)).toThrow(/already exists.*--force/);

    write("AGENTS.md", "# keep me\n");
    const plan = planInitAgents(root, { ...opts, force: true });
    expect(plan.changes.find((c) => c.path === ".skelpro.json")!.action).toBe("replace");
    applyInitPlan(plan);
    expect(JSON.parse(read(".skelpro.json")).skelpro).toBe(1);
    expect(read("AGENTS.md")).toContain("# keep me"); // --force never overwrites AGENTS.md
  });

  it("planning writes nothing (--dry-run)", () => {
    planInitAgents(root, { ...opts, pointerFiles: ["CLAUDE.md"] });
    expect(fs.readdirSync(root)).toEqual(["src"]);
  });
});

describe("validation", () => {
  it.each([["../outside.md"], ["/etc/x.md"], ["AGENTS.md"]])("refuses pointer %s", (p) => {
    expect(() => planInitAgents(root, { ...opts, pointerFiles: [p] })).toThrow();
    expect(fs.existsSync(path.join(path.dirname(root), "outside.md"))).toBe(false);
  });

  it("refuses a path that isn't a folder", () => {
    expect(() => planInitAgents(path.join(root, "nope"), opts)).toThrow(/Not a folder/);
  });
});

describe("skelpro init-agents (CLI)", { timeout: 90_000 }, () => {
  beforeEach(() => mkdir("src", "tests"));

  it("adds the files, with CLAUDE.md by default", async () => {
    const r = await runCli(root, ["init-agents"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/create {2}AGENTS\.md/);
    expect(r.stdout).toMatch(/create {2}CLAUDE\.md/);
    expect(r.stdout).toMatch(/create {2}\.skelpro\.json/);
    expect(r.stdout).toMatch(/replace the TODOs in AGENTS\.md and \.skelpro\.json/);
    expect(exists("AGENTS.md") && exists("CLAUDE.md") && exists(".skelpro.json")).toBe(true);
  });

  it("--dry-run writes nothing", async () => {
    const r = await runCli(root, ["init-agents", "--dry-run"]);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/Dry run, nothing written/);
    expect(fs.readdirSync(root).sort()).toEqual(["src", "tests"]);
  });

  it("--no-pointers and custom --pointer", async () => {
    const r = await runCli(path.dirname(root), ["init-agents", "shop-api", "--pointer", "GEMINI.md"]);
    expect(r.status, r.stderr).toBe(0);
    expect(exists("GEMINI.md")).toBe(true);
    expect(exists("CLAUDE.md")).toBe(false);

    fs.rmSync(path.join(root, ".skelpro.json"));
    fs.rmSync(path.join(root, "GEMINI.md"));
    const r2 = await runCli(root, ["init-agents", "--no-pointers"]);
    expect(r2.status, r2.stderr).toBe(0);
    expect(exists("GEMINI.md") || exists("CLAUDE.md")).toBe(false);
  });

  it("exits 1 when already set up", async () => {
    write(".skelpro.json", "{}");
    const r = await runCli(root, ["init-agents"]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/already exists/);
  });
});
