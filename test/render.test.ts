import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import scaffoldJSON from "../src/hooks/scaffoldJSON";
import {
  CASE_HELPERS,
  TemplateError,
  evaluateCondition,
  listPaths,
  parseTemplate,
  renderString,
  renderTemplate,
  resolveVariables,
} from "../src/template/render";

const NOW = new Date(2026, 10, 9); // 9 Nov 2026

/** The example template from the roadmap. */
const nodeApi = {
  skelpro: 2,
  name: "node-api",
  description: "Express API with TypeScript, Vitest and Docker",
  variables: {
    projectName: { type: "string", description: "npm package name", pattern: "^[a-z0-9-]+$" },
    description: { type: "string", default: "" },
    port: { type: "number", default: 3000 },
    includeDocker: { type: "boolean", default: true },
    database: { type: "enum", options: ["none", "postgres", "sqlite"], default: "none" },
  },
  files: {
    "package.json": '{\n  "name": "{{projectName}}",\n  "description": "{{description}}"\n}',
    src: {
      "server.ts": "app.listen({{port}});",
      "{{pascal projectName}}Service.ts": "export class {{pascal projectName}}Service {}",
    },
    Dockerfile: { $when: "includeDocker", $content: "FROM node:22-alpine\n" },
    "src/db": { $when: "database != 'none'", "client.ts": "// {{database}} client" },
  },
};

async function render(json: unknown, provided: Record<string, unknown> = {}, projectName = "my-api") {
  const template = parseTemplate(json);
  const vars = await resolveVariables(template, { projectName, provided, now: NOW });
  return renderTemplate(template, vars);
}

async function errorOf(p: Promise<unknown> | (() => unknown)): Promise<TemplateError> {
  try {
    await (typeof p === "function" ? p() : p);
  } catch (error) {
    expect(error).toBeInstanceOf(TemplateError);
    return error as TemplateError;
  }
  throw new Error("expected a TemplateError");
}

describe("placeholders and helpers", () => {
  const vars = { name: "my-cool api", n: 3, flag: false };

  it("replaces {{name}}, with or without spaces", () => {
    expect(renderString("a {{name}} b {{ n }} {{flag}}", vars)).toBe("a my-cool api b 3 false");
  });

  it.each([
    ["kebab", "my-cool-api"],
    ["snake", "my_cool_api"],
    ["camel", "myCoolApi"],
    ["pascal", "MyCoolApi"],
    ["upper", "MY_COOL_API"],
  ])("{{%s name}}", (helper, expected) => {
    expect(renderString(`{{${helper} name}}`, vars)).toBe(expected);
  });

  it("splits camelCase and acronyms into words", () => {
    expect(CASE_HELPERS.kebab("myHTTPServer")).toBe("my-http-server");
    expect(CASE_HELPERS.pascal("user_id")).toBe("UserId");
  });

  it("\\{{ outputs a literal {{ (Vue, Handlebars, GitHub Actions)", () => {
    expect(renderString("\\{{ secrets.TOKEN }} and {{n}}", vars)).toBe("{{ secrets.TOKEN }} and 3");
  });

  it("refuses unknown variables and helpers", async () => {
    expect((await errorOf(() => renderString("{{nope}}", vars))).message).toMatch(/Undefined variable "nope"/);
    expect((await errorOf(() => renderString("{{shout name}}", vars))).message).toMatch(/Unknown helper "shout"/);
  });

  it("refuses JavaScript-like expressions", async () => {
    expect((await errorOf(() => renderString("{{ name.length }}", vars))).code).toBe("invalid_template");
  });
});

describe("$when", () => {
  const vars = { docker: true, db: "none", port: 3000, empty: "" };

  it.each([
    ["docker", true],
    ["!docker", false],
    ["empty", false],
    ["!empty", true],
    ["db == 'none'", true],
    ['db != "none"', false],
    ["port == 3000", true],
    ["port != 8080", true],
  ])("%s → %s", (expr, expected) => {
    expect(evaluateCondition(expr, vars)).toBe(expected);
  });

  it.each(["docker && db", "process.exit()", "!db == 'x'", "db === 'none'"])(
    "rejects %s (no arbitrary JavaScript)",
    async (expr) => {
      expect((await errorOf(() => evaluateCondition(expr, vars))).message).toMatch(/Invalid \$when/);
    },
  );
});

describe("rendering the roadmap's node-api template", () => {
  it("renders names, contents and defaults", async () => {
    const out = (await render(nodeApi)) as any;
    expect(JSON.parse(out["package.json"])).toEqual({ name: "my-api", description: "" });
    expect(out.src["server.ts"]).toBe("app.listen(3000);");
    expect(out.src["MyApiService.ts"]).toBe("export class MyApiService {}");
    expect(out.Dockerfile).toBe("FROM node:22-alpine\n");
    expect(out["src/db"]).toBeUndefined();
  });

  it("applies provided values and conditions", async () => {
    const out = (await render(nodeApi, { port: "8080", includeDocker: "false", database: "postgres" })) as any;
    expect(out.src["server.ts"]).toBe("app.listen(8080);");
    expect(out.Dockerfile).toBeUndefined();
    expect(out["src/db"]["client.ts"]).toBe("// postgres client");
  });

  it("projectName defaults to the CLI project name, --var wins", async () => {
    const out = (await render(nodeApi, { projectName: "billing" }, "ignored")) as any;
    expect(out.src).toHaveProperty("BillingService.ts");
  });

  it("year and date are always available", async () => {
    const out = (await render({ skelpro: 2, files: { LICENSE: "(c) {{year}}, {{date}}" } })) as any;
    expect(out.LICENSE).toBe("(c) 2026, 2026-11-09");
  });

  it("never renders binary (base64) files", async () => {
    const uri = "data:application/octet-stream;base64,e3t4fX0="; // decodes to "{{x}}"
    const out = (await render({ skelpro: 2, files: { "font.woff2": uri } })) as any;
    expect(out["font.woff2"]).toBe(uri);
  });

  it("lists files for info, including conditional ones", () => {
    expect(listPaths(parseTemplate(nodeApi).files).sort()).toEqual(
      ["Dockerfile", "package.json", "src/db/client.ts", "src/server.ts", "src/{{pascal projectName}}Service.ts"].sort(),
    );
  });
});

describe("v1 templates keep working", () => {
  it("are passed through without rendering", async () => {
    const v1 = { "App.vue": "<p>{{ message }}</p>", src: { "a.ts": "x" }, worktree: true };
    const template = parseTemplate(v1);
    expect(template.version).toBe(1);
    expect(template.worktree).toBe(true);
    expect(await render(v1)).toEqual({ "App.vue": "<p>{{ message }}</p>", src: { "a.ts": "x" } });
  });
});

describe("variable validation", () => {
  it("lists every missing required variable with type and pattern", async () => {
    const tpl = parseTemplate({
      skelpro: 2,
      variables: {
        service: { type: "string", pattern: "^[a-z]+$", description: "service name" },
        tier: { type: "enum", options: ["free", "pro"] },
      },
      files: { a: "{{service}} {{tier}}" },
    });
    const err = await errorOf(resolveVariables(tpl, { projectName: "p" }));
    expect(err.code).toBe("missing_variable");
    expect(err.message).toMatch(/service \(string, pattern \^\[a-z\]\+\$\): service name/);
    expect(err.message).toMatch(/tier \(enum, one of free\|pro\)/);
    expect(err.details.map((d) => d.variable)).toEqual(["service", "tier"]);
  });

  it("asks for missing values when a prompt is available", async () => {
    const tpl = parseTemplate({ skelpro: 2, variables: { svc: { type: "string" } }, files: { a: "{{svc}}" } });
    const ask = vi.fn().mockResolvedValue({ svc: "billing" });
    const vars = await resolveVariables(tpl, { projectName: "p", ask });
    expect(ask).toHaveBeenCalledWith([["svc", { type: "string" }]]);
    expect(vars.svc).toBe("billing");
  });

  it.each([
    [{ port: "eighty" }, /expected a number/],
    [{ includeDocker: "maybe" }, /expected true or false/],
    [{ database: "mysql" }, /expected one of none, postgres, sqlite/],
    [{ projectName: "My API" }, /does not match/],
  ])("rejects bad value %j", async (provided, message) => {
    const err = await errorOf(render(nodeApi, provided));
    expect(err.code).toBe("invalid_variable");
    expect(err.message).toMatch(message);
  });

  it("rejects variables the template doesn't declare", async () => {
    const err = await errorOf(render(nodeApi, { prot: "8080" }));
    expect(err.code).toBe("unknown_variable");
    expect(err.message).toMatch(/prot.*declares: projectName, description, port/);
  });
});

describe("template validation", () => {
  it.each([
    [{ skelpro: 3, files: {} }, /Unsupported template version 3/],
    [{ skelpro: 2 }, /needs a "files" object/],
    [{ skelpro: 2, files: { a: "{{ghost}}" } }, /Undefined variable "ghost" in a/],
    [{ skelpro: 2, files: { "{{ghost}}.ts": "" } }, /Undefined variable "ghost"/],
    [{ skelpro: 2, files: { d: { $when: "ghost", f: "" } } }, /Undefined variable "ghost" in \$when/],
    [{ skelpro: 2, files: { $run: "rm -rf /" } }, /Unknown key "\$run"/],
    [{ skelpro: 2, variables: { x: { type: "date" } }, files: {} }, /type must be one of/],
    [{ skelpro: 2, variables: { x: { type: "enum" } }, files: {} }, /need a non-empty "options"/],
    [{ skelpro: 2, variables: { x: { type: "number", default: "a" } }, files: {} }, /expected a number/],
    [{ skelpro: 2, files: { a: { $content: "x", $mode: "755" } } }, /only "\$when" and a string "\$content"/],
  ])("rejects %j", async (json, message) => {
    expect((await errorOf(() => parseTemplate(json))).message).toMatch(message);
  });

  it("refuses two names that render to the same file", async () => {
    const tpl = { skelpro: 2, variables: { a: { type: "string", default: "x" } }, files: { "{{a}}.ts": "1", "x.ts": "2" } };
    expect((await errorOf(render(tpl))).message).toMatch(/both render to "x.ts"/);
  });
});

describe("security: rendered paths still can't escape (B1)", () => {
  let work: string;
  beforeEach(() => {
    work = fs.mkdtempSync(path.join(os.tmpdir(), "skelpro-render-"));
  });
  afterEach(() => {
    fs.rmSync(work, { recursive: true, force: true });
  });

  it.each(["../../escaped", "../escaped", "/etc/escaped"])(
    "a variable value of %s is refused with zero files written",
    async (value) => {
      const tpl = {
        skelpro: 2,
        variables: { feature: { type: "string" } },
        files: { "ok.txt": "fine", src: { "{{feature}}.ts": "pwned" } },
      };
      const files = await render(tpl, { feature: value });
      const target = path.join(work, "proj");

      expect(() => scaffoldJSON(target, files)).toThrow(/escapes project folder|Unsafe template path/);
      expect(fs.existsSync(target)).toBe(false);
      expect(fs.existsSync(path.join(work, "escaped.ts"))).toBe(false);
    },
  );
});
