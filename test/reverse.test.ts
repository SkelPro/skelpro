import { describe, expect, it } from "vitest";

import { reverseTemplate } from "../src/template/reverse";
import { parseTemplate, renderTemplate, resolveVariables } from "../src/template/render";
import type { JsonStructure } from "../src/types/structures";

const PNG_URI = "data:image/png;base64,bXktYXBpIHt7eH19"; // decodes to "my-api {{x}}"

/** A small real-looking project, as createJSON would return it. */
const project: JsonStructure = {
  "package.json": '{\n  "name": "my-api",\n  "version": "1.0.0"\n}\n',
  "README.md": "# my-api\n\nRuns on port 3000. Not 30001, not v1.3000, not 3000.5.\n",
  src: {
    "MyApiService.ts": "export class MyApiService {}\nconst MY_API_URL = `http://localhost:3000`;\n",
    "my_api.py": "import my_api\n",
    "App.vue": "<template><p>{{ message }}</p></template>\n",
  },
  ".github": { workflows: { "ci.yml": "token: ${{ secrets.TOKEN }}\nescaped: \\{{ x }}\n" } },
  "logo.png": PNG_URI,
};

async function renderBack(template: Record<string, unknown>, projectName: string, provided = {}) {
  const parsed = parseTemplate(JSON.parse(JSON.stringify(template)));
  const vars = await resolveVariables(parsed, { projectName, provided });
  return renderTemplate(parsed, vars);
}

describe("save --var (reverse substitution)", () => {
  const result = reverseTemplate(project, { name: "node-api", vars: { projectName: "my-api", port: "3000" } });
  const files = result.template.files as any;

  it("replaces the value and its case variants, in contents and names", () => {
    expect(files["package.json"]).toContain('"name": "{{projectName}}"');
    expect(files.src).toHaveProperty(["{{pascal projectName}}Service.ts"]);
    expect(files.src["{{pascal projectName}}Service.ts"]).toContain("class {{pascal projectName}}Service");
    expect(files.src["{{pascal projectName}}Service.ts"]).toContain("{{upper projectName}}_URL");
    expect(files.src).toHaveProperty(["{{snake projectName}}.py"]);
  });

  it("replaces numbers only as whole numbers", () => {
    expect(files["README.md"]).toBe(
      "# {{projectName}}\n\nRuns on port {{port}}. Not 30001, not v1.3000, not 3000.5.\n",
    );
  });

  it("escapes existing {{ so it survives rendering", () => {
    expect(files.src["App.vue"]).toBe("<template><p>\\{{ message }}</p></template>\n");
    expect(files[".github"].workflows["ci.yml"]).toBe("token: $\\{{ secrets.TOKEN }}\nescaped: \\\\{{ x }}\n");
  });

  it("leaves binary files alone", () => {
    expect(files["logo.png"]).toBe(PNG_URI);
  });

  it("writes the v2 envelope and variables block", () => {
    expect(result.template).toMatchObject({
      skelpro: 2,
      name: "node-api",
      $schema: expect.stringContaining("schema/template-v2.json"),
      variables: {
        projectName: { type: "string" },
        port: { type: "number", default: 3000 },
      },
    });
    expect((result.template.variables as any).projectName.default).toBeUndefined();
  });

  it("reports every replacement by variant and file", () => {
    const pn = result.summary.find((s) => s.variable === "projectName")!;
    expect(pn.byVariant).toEqual({ "my-api": 2, MyApi: 2, my_api: 2, MY_API: 1 });
    expect(pn.files.sort()).toEqual(
      ["README.md", "package.json", "src/MyApiService.ts", "src/my_api.py"].sort(),
    );
    const port = result.summary.find((s) => s.variable === "port")!;
    expect(port.total).toBe(2);
    expect(result.unused).toEqual([]);
  });

  it("round-trips: rendering with the original values reproduces the project exactly", async () => {
    expect(await renderBack(result.template, "my-api")).toEqual(project);
  });

  it("renders a differently named project", async () => {
    const out = (await renderBack(result.template, "billing-service", { port: 8080 })) as any;
    expect(out.src).toHaveProperty(["BillingServiceService.ts"]);
    expect(out.src["BillingServiceService.ts"]).toContain("BILLING_SERVICE_URL = `http://localhost:8080`");
    expect(out["README.md"]).toContain("# billing-service");
  });
});

describe("save --var: validation", () => {
  it.each([
    [{ flag: "true" }, /booleans can't be substituted/],
    [{ year: "2026" }, /built-in variable/],
    [{ "bad-name": "x" }, /Invalid variable name/],
    [{ a: "same", b: "same" }, /same value/],
    [{ a: "" }, /needs a value/],
  ])("rejects %j", (vars, message) => {
    expect(() => reverseTemplate(project, { name: "t", vars: vars as Record<string, string> })).toThrow(message);
  });

  it("reports values that were never found", () => {
    const r = reverseTemplate(project, { name: "t", vars: { owner: "nobody-here" } });
    expect(r.unused).toEqual(["owner"]);
  });

  it("keeps a file literally named {{projectName}} distinct from the substituted one", async () => {
    const tree = { "my-api.ts": "a", "{{projectName}}.ts": "b" };
    const r = reverseTemplate(tree, { name: "t", vars: { projectName: "my-api" } });
    expect(Object.keys(r.template.files as object).sort()).toEqual(["\\{{projectName}}.ts", "{{projectName}}.ts"]);
    expect(await renderBack(r.template, "my-api")).toEqual(tree);
  });

  it("prefers the longest match when values overlap", () => {
    const r = reverseTemplate({ "a.txt": "acme and acme-cloud" }, {
      name: "t",
      vars: { org: "acme", product: "acme-cloud" },
    });
    expect((r.template.files as any)["a.txt"]).toBe("{{org}} and {{product}}");
  });
});
