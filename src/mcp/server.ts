/**
 * `skelpro mcp`: an MCP server over stdio, so coding agents (Claude,
 * Cursor, Copilot...) can list templates, scaffold projects and check
 * structure as tool calls.
 *
 * Safety:
 * - templates come only from configured places, never a URL an agent sends
 * - writes only inside the allowed roots (the start folder, plus --root)
 * - scaffold_project is a dry run unless dryRun: false, and never
 *   overwrites files unless overwrite: true
 * - file count and size limits
 * - stdout is the protocol channel: nothing else is ever printed there
 */
import path from "path";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { VERSION } from "../utils/constant";
import { TemplateError, listPaths, parseTemplate } from "../template/render";
import { SkelproError, toErrorPayload } from "../core/errors";
import { assertInsideRoots } from "../core/roots";
import { scaffoldProject } from "../core/scaffold";
import { saveTemplate } from "../core/save";
import { buildReport, listProjectPaths } from "../check/check";
import { loadCheckConfig } from "../check/config";
import {
  discoverTemplates,
  findRepoTemplatesDir,
  findTemplate,
  limitsFrom,
  loadConfig,
  readTemplateEntry,
  skelproHome,
} from "../core/templates";

export interface ServerOptions {
  /** Folder the server was started in: where repo templates are found, and the first allowed root. */
  cwd: string;
  /** Extra folders the server may write to (--root). */
  roots?: string[];
  /** ~/.skelpro by default. */
  home?: string;
}

type ToolResult = { content: Array<{ type: "text"; text: string }>; isError?: boolean };

const ok = (data: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
});

const fail = (error: unknown): ToolResult => ({
  isError: true,
  content: [{ type: "text", text: JSON.stringify({ error: toErrorPayload(error) }, null, 2) }],
});

/** Runs a tool body, turning any thrown error into a structured error result. */
async function guard(body: () => Promise<unknown>): Promise<ToolResult> {
  try {
    return ok(await body());
  } catch (error) {
    return fail(error);
  }
}

const variablesSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
  .optional()
  .describe("Template variable values, by name. describe_template lists the variables, their types and defaults.");

export function createServer(options: ServerOptions): McpServer {
  const cwd = path.resolve(options.cwd);
  const home = options.home ?? skelproHome();
  const roots = [cwd, ...(options.roots ?? []).map((r) => path.resolve(cwd, r))];

  // Read config on every call, so edits to ~/.skelpro/config.json apply without a restart.
  const context = () => {
    const config = loadConfig(home);
    return { config, limits: limitsFrom(config), entries: discoverTemplates(cwd, home, config) };
  };

  const server = new McpServer({ name: "skelpro", version: VERSION });

  server.registerTool(
    "list_templates",
    {
      title: "List project templates",
      description:
        "List the project templates available to this team: from .skelpro/templates/ in the repository, " +
        "~/.skelpro/templates/, and remote templates the user configured. Returns each template's name, " +
        "description, where it comes from, and its variables. Call this before starting a new project, " +
        "service or package to see whether a template already defines its structure.",
      inputSchema: {
        query: z.string().optional().describe("Only templates whose name or description contains this text."),
      },
    },
    async ({ query }) =>
      guard(async () => {
        const { entries, limits } = context();
        const q = query?.toLowerCase();
        const templates = [];
        for (const entry of entries) {
          try {
            const t = parseTemplate(await readTemplateEntry(entry, limits));
            const item = {
              name: entry.name,
              origin: entry.origin,
              ...(t.description ? { description: t.description } : {}),
              ...(t.templateVersion ? { version: t.templateVersion } : {}),
              format: t.version,
              variables: t.variables,
            };
            if (!q || `${entry.name} ${t.name ?? ""} ${t.description ?? ""}`.toLowerCase().includes(q)) {
              templates.push(item);
            }
          } catch (error) {
            // One broken template shouldn't hide the others.
            if (!q || entry.name.toLowerCase().includes(q)) {
              templates.push({ name: entry.name, origin: entry.origin, error: toErrorPayload(error) });
            }
          }
        }
        return { templates };
      }),
  );

  server.registerTool(
    "describe_template",
    {
      title: "Describe a project template",
      description:
        "Show everything about one template before using it: its variables (type, default, pattern, " +
        "allowed values), the files it creates, its folder layout and structure rules, and the AGENTS.md " +
        "conventions it gives the project, if any.",
      inputSchema: {
        template: z.string().describe("Template name, as returned by list_templates."),
      },
    },
    async ({ template }) =>
      guard(async () => {
        const { entries, limits } = context();
        const entry = findTemplate(template, entries);
        const parsed = parseTemplate(await readTemplateEntry(entry, limits));
        const agentsMd = typeof parsed.files["AGENTS.md"] === "string" ? parsed.files["AGENTS.md"] : undefined;
        return {
          name: entry.name,
          origin: entry.origin,
          format: parsed.version,
          ...(parsed.description ? { description: parsed.description } : {}),
          ...(parsed.templateVersion ? { version: parsed.templateVersion } : {}),
          variables: parsed.variables,
          builtInVariables: {
            projectName: "the target folder's name (unless set in variables)",
            year: "the current year",
            date: "today, YYYY-MM-DD",
          },
          files: listPaths(parsed.files),
          layout: parsed.layout,
          rules: parsed.rules,
          ...(parsed.agents ? { agents: parsed.agents } : {}),
          ...(agentsMd ? { agentsMd } : {}),
        };
      }),
  );

  server.registerTool(
    "scaffold_project",
    {
      title: "Create a project from a template",
      description:
        "Create a new project from a team template. Prefer this over writing boilerplate files by hand: " +
        "it is faster and follows the team's conventions exactly. By default this is a dry run that returns " +
        "the files it would create; show that plan to the user, then call again with dryRun: false to write " +
        "them. It never overwrites existing files unless overwrite is true. After creating the project, " +
        "read its AGENTS.md and follow it.",
      inputSchema: {
        template: z.string().describe("Template name, as returned by list_templates."),
        targetDir: z
          .string()
          .describe("Folder to create the project in, relative to the server's folder. Its name is the default projectName."),
        variables: variablesSchema,
        dryRun: z.boolean().optional().default(true).describe("true (default): only return the plan. false: write the files."),
        overwrite: z.boolean().optional().default(false).describe("Replace files that already exist. Default false."),
      },
    },
    async ({ template, targetDir, variables, dryRun, overwrite }) =>
      guard(async () => {
        const { entries, limits } = context();
        const target = assertInsideRoots(path.resolve(cwd, targetDir), roots);
        const entry = findTemplate(template, entries);
        const json = await readTemplateEntry(entry, limits);
        const result = await scaffoldProject({
          json,
          source: entry.location,
          targetDir: target,
          variables,
          dryRun: dryRun ?? true,
          overwrite: overwrite ?? false,
          limits,
        });
        const next = result.dryRun
          ? result.conflicts.length
            ? "Some files already exist. Show the plan and the conflicts to the user; call again with dryRun: false and overwrite: true only if they agree, or pick another targetDir."
            : "Show this plan to the user, then call scaffold_project again with dryRun: false to create the files."
          : result.agentsMd
            ? "Done. Read AGENTS.md in the new project and follow its conventions."
            : "Done.";
        return { ...result, targetDir: path.relative(cwd, result.targetDir) || ".", nextStep: next };
      }),
  );

  server.registerTool(
    "check_structure",
    {
      title: "Check a project's structure",
      description:
        "Check a project's folders and file names against its layout and rules (from its .skelpro.json, " +
        "or a named template): missing required folders, forbidden files, naming problems, missing companion " +
        "files such as tests, and folders that aren't in the layout. Run this on your own work before saying " +
        "you're done, and fix any errors it reports.",
      inputSchema: {
        projectDir: z.string().optional().default(".").describe("Project folder, relative to the server's folder."),
        template: z
          .string()
          .optional()
          .describe("Check against this named template instead of the project's .skelpro.json."),
        variables: variablesSchema,
      },
    },
    async ({ projectDir, template, variables }) =>
      guard(async () => {
        const dir = assertInsideRoots(path.resolve(cwd, projectDir ?? "."), roots, "projectDir");
        let loaded;
        try {
          if (template) {
            const { entries, limits } = context();
            const entry = findTemplate(template, entries);
            const json = await readTemplateEntry(entry, limits);
            loaded = await loadCheckConfig(dir, { template: entry.location, templateJson: json, vars: variables });
          } else {
            loaded = await loadCheckConfig(dir);
          }
        } catch (error) {
          if (error instanceof SkelproError || error instanceof TemplateError) throw error;
          const message = (error as Error).message;
          throw new SkelproError(
            /No \.skelpro\.json|Not a folder/.test(message) ? "not_found" : "invalid_input",
            message,
            /No \.skelpro\.json/.test(message)
              ? "Pass template with a template name, or add a .skelpro.json (skelpro init-agents does this)."
              : undefined,
          );
        }
        const report = buildReport(loaded.config, listProjectPaths(dir), loaded.template);
        return {
          projectDir: path.relative(cwd, dir) || ".",
          ...report,
          passed: report.counts.error === 0,
          nextStep: report.counts.error
            ? "Fix the errors (and ideally the warnings), then check again."
            : report.counts.warn
              ? "No errors. Consider fixing the warnings."
              : "The structure matches the layout and rules.",
        };
      }),
  );

  server.registerTool(
    "save_template",
    {
      title: "Save a project as a template",
      description:
        "Save an existing project folder as a reusable template in the repository's .skelpro/templates/, " +
        "so the team (and list_templates) can use it. Dependencies, build output, secrets and anything in " +
        ".gitignore are left out. Pass variables to replace values (such as the project name) with " +
        "placeholders, so each new project gets its own. Returns the template path, the file count and " +
        "every skipped path with the reason.",
      inputSchema: {
        sourceDir: z.string().describe("Project folder to save, relative to the server's folder."),
        name: z.string().describe("Template name (letters, digits, . _ -)."),
        variables: z
          .record(z.string(), z.string())
          .optional()
          .describe('Values to turn into placeholders, e.g. {"projectName": "my-api", "port": "3000"}.'),
        description: z.string().optional().describe("What the template creates (needs variables)."),
        include: z.array(z.string()).optional().describe("Globs to keep even if they'd be skipped."),
        exclude: z.array(z.string()).optional().describe("Extra globs to skip."),
        overwrite: z.boolean().optional().default(false).describe("Replace an existing template with this name."),
      },
    },
    async ({ sourceDir, name, variables, description, include, exclude, overwrite }) =>
      guard(async () => {
        const source = assertInsideRoots(path.resolve(cwd, sourceDir), roots, "sourceDir");
        if (description && !(variables && Object.keys(variables).length)) {
          throw new SkelproError("invalid_input", "description only applies with variables (a v2 template).");
        }
        const nearest = findRepoTemplatesDir(cwd);
        const outDir = nearest ?? path.join(cwd, ".skelpro", "templates");
        assertInsideRoots(outDir, roots, "the templates folder");

        const result = saveTemplate({
          sourceDir: source,
          name,
          outDir,
          variables,
          description,
          include,
          exclude,
          overwrite: overwrite ?? false,
          limits: context().limits,
        });
        return {
          ...result,
          templatePath: path.relative(cwd, result.templatePath),
          nextStep: result.replacements
            ? "Check the replacements for anything unexpected, then commit the template."
            : "Commit the template so the team can use it.",
        };
      }),
  );

  return server;
}

/** Starts the server on stdin/stdout. */
export async function runStdioServer(options: ServerOptions): Promise<void> {
  // stdout carries the protocol; anything else printed there would corrupt it.
  console.log = (...args: unknown[]) => console.error(...args);
  console.info = console.log;

  const server = createServer(options);
  await server.connect(new StdioServerTransport());
}
