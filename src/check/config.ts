/**
 * Where `skelpro check` gets its layout and rules: the project's
 * .skelpro.json by default, or a template given with --template.
 * Problems here mean SkelPro can't run the check (exit code 2), as opposed
 * to the project having problems (exit code 1).
 */
import fs from "fs";
import path from "path";
import { MANIFEST_FILE, resolveLayout, resolveRules } from "../template/agents";
import { TemplateError, parseTemplate, resolveVariables } from "../template/render";
import type { CheckConfig, CheckReport } from "./check";

export interface LoadedConfig {
  config: CheckConfig;
  template?: CheckReport["template"];
  /** Where the layout and rules came from, for messages. */
  source: string;
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

function parseIgnore(raw: unknown, where: string): Record<string, string[]> {
  if (raw === undefined) return {};
  if (!isObject(raw) || !Object.values(raw).every((v) => Array.isArray(v) && v.every((g) => typeof g === "string"))) {
    throw new Error(`${where}: "ignore" must map a rule id to a list of path globs, such as {"naming": ["src/legacy/**"]}.`);
  }
  return raw as Record<string, string[]>;
}

/** Reads the project's .skelpro.json. */
function loadManifest(projectDir: string): LoadedConfig {
  const file = path.join(projectDir, MANIFEST_FILE);
  if (!fs.existsSync(file)) {
    throw new Error(
      `No ${MANIFEST_FILE} in ${projectDir}. Create the project from a v2 template, ` +
        `run "skelpro init-agents", or check against a template with --template <path>.`,
    );
  }

  let manifest: unknown;
  try {
    manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${file} is not valid JSON: ${(error as Error).message}`);
  }
  if (!isObject(manifest) || manifest.skelpro !== 1) {
    throw new Error(`${file} is not a SkelPro manifest (expected "skelpro": 1).`);
  }

  // Reuse the template validator for layout and rules, so both accept exactly the same things.
  let parsed;
  try {
    parsed = parseTemplate({ skelpro: 2, files: {}, layout: manifest.layout ?? {}, rules: manifest.rules ?? [] });
  } catch (error) {
    if (error instanceof TemplateError) throw new Error(`${file}: ${error.message}`);
    throw error;
  }

  const template = isObject(manifest.template) ? manifest.template : {};
  return {
    config: {
      layout: Object.fromEntries(Object.entries(parsed.layout).map(([p, { $when: _w, ...e }]) => [p, e])),
      rules: parsed.rules,
      ignore: parseIgnore(manifest.ignore, file),
    },
    template: {
      ...(typeof template.name === "string" ? { name: template.name } : {}),
      ...(typeof template.version === "string" ? { version: template.version } : {}),
    },
    source: file,
  };
}

async function readTemplate(source: string): Promise<unknown> {
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Could not fetch template: ${response.status} ${response.statusText} (${source})`);
    return response.json();
  }
  try {
    return JSON.parse(fs.readFileSync(source, "utf8"));
  } catch (error) {
    throw new Error(`Could not read template ${source}: ${(error as Error).message}`);
  }
}

/** Uses a template's layout and rules directly, rendered with defaults and --var values. */
async function loadFromTemplate(
  projectDir: string,
  source: string,
  provided: Record<string, unknown>,
): Promise<LoadedConfig> {
  const template = parseTemplate(await readTemplate(source));
  if (template.version === 1) {
    throw new Error(`${source} is a v1 template; it has no layout or rules to check against.`);
  }

  // Values the project was created with, if it has a manifest, then --var on top.
  const manifestFile = path.join(projectDir, MANIFEST_FILE);
  let fromManifest: Record<string, unknown> = {};
  let ignore: Record<string, string[]> = {};
  if (fs.existsSync(manifestFile)) {
    try {
      const m = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
      if (isObject(m?.variables)) {
        fromManifest = Object.fromEntries(Object.entries(m.variables).filter(([k]) => k in template.variables));
      }
      ignore = parseIgnore(m?.ignore, manifestFile);
    } catch {
      // A broken manifest shouldn't stop an explicit --template check.
    }
  }

  const vars = await resolveVariables(template, {
    projectName: path.basename(projectDir),
    provided: { ...fromManifest, ...provided },
  });

  return {
    config: { layout: resolveLayout(template, vars), rules: resolveRules(template, vars), ignore },
    template: {
      ...(template.name ? { name: template.name } : {}),
      ...(template.templateVersion ? { version: template.templateVersion } : {}),
    },
    source,
  };
}

export async function loadCheckConfig(
  projectDir: string,
  options: { template?: string; vars?: Record<string, unknown> } = {},
): Promise<LoadedConfig> {
  const dir = path.resolve(projectDir);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Not a folder: ${dir}`);
  }
  return options.template ? loadFromTemplate(dir, options.template, options.vars ?? {}) : loadManifest(dir);
}
