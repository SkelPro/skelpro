import fs from "fs";
import path from "path";
import { toneLevel } from "tonelog";
import type { IgnoreOptions } from "./utils/ignore";
import {
  listPaths,
  parseTemplate,
  renderTemplate,
  resolveVariables,
  type ParsedTemplate,
} from "./template/render";
import { askForVariables, canPrompt } from "./template/prompt";
import { reverseTemplate } from "./template/reverse";

import createJSON from "./hooks/createJSON";
import scaffoldJSON from "./hooks/scaffoldJSON";
import installDeps from "./hooks/installDeps";
import { createGitWorktree } from "./hooks/createWorktree";

export interface SaveOptions extends IgnoreOptions {
  /** --var name=value: values to turn into {{placeholders}} (makes a v2 template). */
  vars?: string[];
  /** --description for the v2 template. */
  description?: string;
}

/** Parses repeated name=value flags into an object (later wins). */
function parseVarFlags(pairs: string[] = []): Record<string, string> {
  const out: Record<string, string> = {};
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      throw new Error(`Invalid --var "${pair}": use --var name=value.`);
    }
    out[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return out;
}

async function createTemplate(
  srcPath: string,
  fileName: string,
  options: SaveOptions = {},
) {
  console.log("Creating template...");

  const skipped: string[] = [];
  const folderStructure = createJSON(srcPath, {
    include: options.include,
    exclude: options.exclude,
    skipped,
  });

  if (skipped.length) {
    console.log(
      toneLevel.info(
        `Skipped ${skipped.length} ignored path(s): ${skipped.slice(0, 10).join(", ")}` +
          (skipped.length > 10 ? `, and ${skipped.length - 10} more` : ""),
      ),
    );
    console.log("Use --include <glob> to keep any of them.");
  }

  let output: unknown = folderStructure;
  const vars = parseVarFlags(options.vars);

  if (Object.keys(vars).length) {
    const { template, summary, unused } = reverseTemplate(folderStructure, {
      name: path.basename(fileName),
      description: options.description,
      vars,
    });
    output = template;

    console.log("\nReplacements (check nothing unexpected was touched):");
    for (const s of summary) {
      const variants = Object.entries(s.byVariant)
        .map(([text, count]) => `${text} x${count}`)
        .join(", ");
      console.log(
        `  ${s.variable}: ${s.total} in ${s.files.length} file(s)` + (variants ? ` (${variants})` : ""),
      );
      for (const file of s.files.slice(0, 8)) console.log(`      ${file}`);
      if (s.files.length > 8) console.log(`      ...and ${s.files.length - 8} more`);
    }
    for (const name of unused) {
      console.log(toneLevel.warning(`--var ${name}: value "${vars[name]}" was not found in any file.`));
    }
  } else if (options.description) {
    throw new Error("--description only applies to v2 templates; add --var to create one.");
  }

  fs.writeFileSync(`${fileName}.json`, JSON.stringify(output, null, 2), "utf8");

  console.log(
    toneLevel.success(`Template created and saved to ${fileName}.json`, "done"),
  );
}

export interface TemplateOptions {
  /** --var name=value flags, in order (later wins). */
  vars?: string[];
  /** --vars file.json */
  varsFile?: string;
  /** --yes: accept defaults and never prompt. */
  yes?: boolean;
}

const isUrl = (source: string) => /^https?:\/\//i.test(source);

/** Reads a template from a local path or an http(s) URL. */
async function loadTemplateJSON(source: string): Promise<unknown> {
  if (isUrl(source)) {
    console.log("Fetching template skeleton...");
    const response = await fetch(source);
    if (!response.ok) {
      throw new Error(`Could not fetch template: ${response.status} ${response.statusText} (${source})`);
    }
    try {
      return await response.json();
    } catch {
      throw new Error(`Invalid template: ${source} did not return valid JSON.`);
    }
  }

  const content = fs.readFileSync(source, "utf8");
  try {
    return JSON.parse(content);
  } catch {
    throw new Error(`Invalid template: ${source} is not valid JSON.`);
  }
}

/** Merges --vars file.json and --var name=value flags (flags win). */
function collectProvidedVariables(options: TemplateOptions): Record<string, unknown> {
  const provided: Record<string, unknown> = {};

  if (options.varsFile) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(fs.readFileSync(options.varsFile, "utf8"));
    } catch (error) {
      throw new Error(`Could not read --vars ${options.varsFile}: ${(error as Error).message}`);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error(`--vars ${options.varsFile} must contain a JSON object of name: value pairs.`);
    }
    Object.assign(provided, parsed);
  }

  for (const pair of options.vars ?? []) {
    const eq = pair.indexOf("=");
    if (eq <= 0) {
      throw new Error(`Invalid --var "${pair}": use --var name=value.`);
    }
    provided[pair.slice(0, eq)] = pair.slice(eq + 1);
  }

  return provided;
}

/** Parses, resolves variables, renders, scaffolds, then optionally installs. */
async function buildProject(
  json: unknown,
  baseName: string,
  install: boolean,
  useWorktree: boolean,
  branchName: string,
  options: TemplateOptions = {},
) {
  const template = parseTemplate(json);
  const provided = collectProvidedVariables(options);

  if (template.version === 1 && Object.keys(provided).length) {
    throw new Error(
      "This is a v1 template and has no variables; --var and --vars only work with v2 templates.",
    );
  }

  const vars = await resolveVariables(template, {
    projectName: path.basename(path.resolve(baseName)),
    provided,
    ask: canPrompt(options.yes) ? askForVariables : undefined,
  });
  const files = renderTemplate(template, vars);

  if (template.worktree) {
    useWorktree = true;
  }

  console.log("Scaffolding template...");

  if (useWorktree) {
    if (!branchName) {
      throw new Error("A branch name is required to create a worktree (use --branch).");
    }
    await createGitWorktree(baseName, files, branchName);
  } else {
    scaffoldJSON(baseName, files);
  }

  console.log(toneLevel.success(`Scaffolding ${baseName} completed.`, "done"));

  if (install) {
    await installDeps(baseName);
    console.log("All dependencies installed.");
  }
}

/** Creates a project from a local template file or a URL. */
async function scaffoldTemplate(
  source: string,
  baseName: string,
  install: boolean,
  useWorktree: boolean = false,
  branchName: string,
  options: TemplateOptions = {},
) {
  const json = await loadTemplateJSON(source);
  await buildProject(json, baseName, install, useWorktree, branchName, options);
}

/** Kept for the interactive menu; same as scaffoldTemplate with a URL. */
async function fetchTemplate(
  url: string,
  baseName: string,
  install: boolean,
  useWorktree: boolean = false,
  branchName: string,
  options: TemplateOptions = {},
) {
  if (!isUrl(url)) {
    throw new Error(`Not an http(s) URL: ${url}`);
  }
  await scaffoldTemplate(url, baseName, install, useWorktree, branchName, options);
}

export interface TemplateInfo {
  version: 1 | 2;
  name?: string;
  description?: string;
  variables: ParsedTemplate["variables"];
  files: string[];
  hasAgentsFile: boolean;
}

/** What a template contains, without writing anything (skelpro info). */
async function describeTemplate(source: string): Promise<TemplateInfo> {
  const template = parseTemplate(await loadTemplateJSON(source));
  const files = listPaths(template.files);
  return {
    version: template.version,
    name: template.name,
    description: template.description,
    variables: template.variables,
    files,
    hasAgentsFile: files.some((f) => f === "AGENTS.md"),
  };
}

export { createTemplate, fetchTemplate, scaffoldTemplate, describeTemplate };
