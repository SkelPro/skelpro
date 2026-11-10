import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import scaffoldJSON from "../src/hooks/scaffoldJSON";
import {
  LAYOUT_MARKER,
  addAgentFiles,
  agentsMarkdown,
  manifestSource,
  pointerContent,
} from "../src/template/agents";
import { TemplateError, parseTemplate, renderTemplate, resolveVariables } from "../src/template/render";

const ROOT = path.resolve(__dirname, "..");
const NOW = new Date(2026, 10, 9);

/** The JSON and markdown examples from docs/templates.md#agent-ready-templates. */
function docsExample(): { template: any; agentsMd: string } {
  const md = fs.readFileSync(path.join(ROOT, "docs", "templates.md"), "utf8");
  const section = md.slice(md.indexOf("## Agent-ready templates"));
  const json = /```json\n([\s\S]*?)```/.exec(section)![1];
  const agents = /```markdown\n([\s\S]*?)```/.exec(section)![1];
  return { template: JSON.parse(json), agentsMd: agents };
}

async function build(json: unknown, provided: Record<string, unknown> = {}, source = "./tpl.json", projectDir = "/work/my-api") {
  const template = parseTemplate(json);
  const vars = await resolveVariables(template, { projectName: path.basename(projectDir), provided, now: NOW });
  return addAgentFiles(template, vars, renderTemplate(template, vars), {
    source,
    projectDir,
    skelproVersion: "9.9.9",
  }) as any;
}

describe("the docs example", () => {
  it("produces exactly the AGENTS.md shown in docs/templates.md", async () => {
    const { template, agentsMd } = docsExample();
    const out = await build(template);
    expect(out["AGENTS.md"]).toBe(agentsMd);
  });

  it("includes $when layout entries when the condition holds", async () => {
    const out = await build(docsExample().template, { database: "postgres" });
    expect(out["AGENTS.md"]).toContain("- `src/db/`: database client and queries only\n");
  });

  it("writes the CLAUDE.md pointer", async () => {
    const out = await build(docsExample().template);
    expect(out["CLAUDE.md"]).toBe("See [AGENTS.md](AGENTS.md) for this project's conventions and layout.\n");
  });

  it("writes a manifest with resolved layout, rules and variables", async () => {
    const out = await build(
      docsExample().template,
      {},
      path.resolve("/work/templates/node-api.json"),
      path.resolve("/work/my-api"),
    );
    const manifest = JSON.parse(out[".skelpro.json"]);
    expect(manifest).toEqual({
      skelpro: 1,
      template: { name: "node-api", version: "1.0.0", source: "../templates/node-api.json" },
      generatedBy: "skelpro@9.9.9",
      createdAt: "2026-11-09",
      variables: { database: "none" },
      layout: {
        "src/routes": { purpose: "HTTP route handlers, one file per resource", naming: "kebab-case" },
        "src/services": { purpose: "Business logic; no HTTP or database imports" },
        tests: { purpose: "Integration tests", required: true },
      },
      rules: [
        { id: "colocated-unit-tests", match: "src/**/*.ts", expect: "src/**/*.test.ts", severity: "warn" },
        { id: "no-root-scripts", forbid: "*.js", except: ["*.config.js"], severity: "error" },
      ],
    });
  });
});

describe("AGENTS.md composition", () => {
  const layout = { tests: { purpose: "Tests", required: true } };

  it("keeps a template's own AGENTS.md and appends the layout", () => {
    expect(agentsMarkdown({ existing: "# Team rules\n\nBe kind.\n", projectName: "x", layout })).toBe(
      "# Team rules\n\nBe kind.\n\n## Project layout\n\n- `tests/`: tests (required)\n\nCheck structure with `npx skelpro check`.\n",
    );
  });

  it("puts the layout at the marker when there is one", () => {
    const existing = `# Rules\n\n${LAYOUT_MARKER}\n\n## More\n`;
    expect(agentsMarkdown({ existing, projectName: "x", layout })).toBe(
      "# Rules\n\n## Project layout\n\n- `tests/`: tests (required)\n\nCheck structure with `npx skelpro check`.\n\n## More\n",
    );
  });

  it("removes an unused marker", () => {
    expect(agentsMarkdown({ existing: `# Rules\n${LAYOUT_MARKER}\n`, projectName: "x", layout: {} })).toBe("# Rules\n");
  });

  it("keeps acronyms capitalised and combines notes", () => {
    const md = agentsMarkdown({
      projectName: "x",
      layout: { "src/api": { purpose: "HTTP handlers", naming: "camelCase", required: true } },
    });
    expect(md).toContain("- `src/api/`: HTTP handlers (camelCase names, required)");
  });

  it("writes nothing when there's nothing to say", () => {
    expect(agentsMarkdown({ projectName: "x", layout: {} })).toBeUndefined();
  });
});

describe("generated files", () => {
  it("v2 without layout or agents still gets a manifest, but no AGENTS.md", async () => {
    const out = await build({ skelpro: 2, files: { "a.txt": "a" } });
    expect(Object.keys(out).sort()).toEqual([".skelpro.json", "a.txt"]);
  });

  it("v1 templates get nothing extra", async () => {
    const out = await build({ "a.txt": "a" });
    expect(out).toEqual({ "a.txt": "a" });
  });

  it("renders placeholders in layout, purposes, rules and instructions", async () => {
    const out = await build(
      {
        skelpro: 2,
        variables: { feature: { type: "string", default: "billing" } },
        files: {},
        layout: { "src/{{kebab feature}}": { purpose: "All {{feature}} code" } },
        rules: [{ id: "tests", match: "src/{{feature}}/*.ts", expect: "src/{{feature}}/*.test.ts" }],
        agents: { instructions: "Work only in src/{{feature}}." },
      },
      {},
    );
    expect(out["AGENTS.md"]).toBe(
      "# my-api\n\nWork only in src/billing.\n\n## Project layout\n\n- `src/billing/`: all billing code\n\nCheck structure with `npx skelpro check`.\n",
    );
    expect(JSON.parse(out[".skelpro.json"]).rules[0].match).toBe("src/billing/*.ts");
  });

  it("nested pointer files link back correctly", () => {
    expect(pointerContent(".cursor/rules/agents.mdc")).toContain("[AGENTS.md](../../AGENTS.md)");
  });

  it("a template's own pointer file wins over the generated one", async () => {
    const out = await build({
      skelpro: 2,
      files: { "CLAUDE.md": "custom" },
      agents: { instructions: "x", pointerFiles: ["CLAUDE.md", "GEMINI.md"] },
    });
    expect(out["CLAUDE.md"]).toBe("custom");
    expect(out["GEMINI.md"]).toContain("AGENTS.md");
  });
});

describe("manifest source", () => {
  it("strips credentials, query strings and fragments from URLs", () => {
    expect(manifestSource("https://user:pw@raw.example.com/t.json?token=SECRET#x", "/p")).toBe(
      "https://raw.example.com/t.json",
    );
  });

  it("stores local templates relative to the project", () => {
    const projectDir = path.resolve("/work/apps/api");
    expect(manifestSource(path.resolve("/work/templates/api.json"), projectDir)).toBe("../../templates/api.json");
  });
});

describe("validation", () => {
  it.each([
    [{ layout: [] }, /"layout" must be an object/],
    [{ layout: { src: {} } }, /needs a "purpose"/],
    [{ layout: { src: { purpose: "x", color: "red" } } }, /unknown field color/],
    [{ layout: { src: { purpose: "x", naming: "Title Case" } } }, /"naming" must be one of/],
    [{ layout: { "../up": { purpose: "x" } } }, /relative path inside the project/],
    [{ layout: { src: { purpose: "x", $when: "a && b" } } }, /Invalid \$when/],
    [{ layout: { src: { purpose: "{{ghost}}" } } }, /Undefined variable "ghost"/],
    [{ rules: {} }, /"rules" must be a list/],
    [{ rules: [{ id: "Bad_Id", forbid: "*.js" }] }, /kebab-case/],
    [{ rules: [{ id: "a", forbid: "*.js" }, { id: "a", forbid: "*.ts" }] }, /Two rules have the id "a"/],
    [{ rules: [{ id: "a", match: "*.ts" }] }, /either "match" and "expect"/],
    [{ rules: [{ id: "a", forbid: "*.js", match: "x" }] }, /a forbid rule has/],
    [{ rules: [{ id: "a", forbid: "*.js", severity: "fatal" }] }, /error, warn or info/],
    [{ agents: { instructions: 1 } }, /must be a string/],
    [{ agents: { pointerFiles: ["AGENTS.md"] } }, /can't include AGENTS.md/],
    [{ agents: { pointerFiles: ["/etc/x"] } }, /relative path inside the project/],
    [{ agents: { run: "x" } }, /unknown field run/],
    [{ files: { ".skelpro.json": "{}" } }, /generated by SkelPro/],
    [{ version: 2 }, /"version" must be a string/],
  ])("rejects %j", (extra, message) => {
    let error: unknown;
    try {
      parseTemplate({ skelpro: 2, files: {}, ...extra });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(TemplateError);
    expect((error as Error).message).toMatch(message);
  });

  it("refuses a layout path that a variable value turns into ..", async () => {
    const tpl = {
      skelpro: 2,
      variables: { dir: { type: "string" } },
      files: {},
      layout: { "src/{{dir}}": { purpose: "x" } },
    };
    await expect(build(tpl, { dir: "../../etc" })).rejects.toThrow(/relative path inside the project/);
  });
});

describe("on disk", () => {
  let work: string;
  beforeEach(() => {
    work = fs.mkdtempSync(path.join(os.tmpdir(), "skelpro-agents-"));
  });
  afterEach(() => {
    fs.rmSync(work, { recursive: true, force: true });
  });

  it("writes AGENTS.md, a nested pointer and the manifest with the project", async () => {
    const dir = path.join(work, "my-api");
    const files = await build(
      {
        skelpro: 2,
        files: { src: {} },
        layout: { src: { purpose: "Source" } },
        agents: { pointerFiles: ["CLAUDE.md", ".cursor/rules/agents.mdc"] },
      },
      {},
      path.join(work, "tpl.json"),
      dir,
    );
    scaffoldJSON(dir, files);

    expect(fs.readFileSync(path.join(dir, "AGENTS.md"), "utf8")).toContain("- `src/`: source");
    expect(fs.readFileSync(path.join(dir, ".cursor", "rules", "agents.mdc"), "utf8")).toContain("../../AGENTS.md");
    expect(JSON.parse(fs.readFileSync(path.join(dir, ".skelpro.json"), "utf8")).template.source).toBe("../tpl.json");
  });
});
