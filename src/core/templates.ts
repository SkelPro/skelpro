/**
 * Where named templates come from, nearest first:
 *   1. .skelpro/templates/ in the current repository (team templates)
 *   2. ~/.skelpro/templates/ (personal templates)
 *   3. URLs listed under "templates" in ~/.skelpro/config.json
 *
 * Remote templates come only from URLs the user configured. Nothing here
 * fetches a URL that a caller (such as an agent) supplies, so a prompt
 * injection can't point SkelPro at a malicious template.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { SkelproError } from "./errors";

export interface Limits {
  /** Maximum files a template may create. */
  maxFiles: number;
  /** Maximum size of a template, and of everything it writes, in bytes. */
  maxBytes: number;
}

export const DEFAULT_LIMITS: Limits = { maxFiles: 2000, maxBytes: 20 * 1024 * 1024 };

export interface SkelproConfig {
  /** name → URL of a template JSON file. */
  templates?: Record<string, string>;
  limits?: Partial<Limits>;
}

export type TemplateOrigin = "repo" | "user" | "remote";

export interface TemplateEntry {
  name: string;
  origin: TemplateOrigin;
  /** File path, or URL for remote templates. */
  location: string;
}

const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/** ~/.skelpro, or $SKELPRO_HOME (used by tests). */
export function skelproHome(): string {
  return process.env.SKELPRO_HOME || path.join(os.homedir(), ".skelpro");
}

export function loadConfig(home = skelproHome()): SkelproConfig {
  const file = path.join(home, "config.json");
  if (!fs.existsSync(file)) return {};

  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new SkelproError("invalid_input", `${file} is not valid JSON: ${(error as Error).message}`);
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    throw new SkelproError("invalid_input", `${file} must contain a JSON object.`);
  }

  const config = raw as SkelproConfig;
  for (const [name, url] of Object.entries(config.templates ?? {})) {
    if (!NAME.test(name) || typeof url !== "string" || !/^https?:\/\//i.test(url)) {
      throw new SkelproError(
        "invalid_input",
        `${file}: "templates" maps a name (letters, digits, . _ -) to an http(s) URL; "${name}" doesn't.`,
      );
    }
  }
  for (const key of ["maxFiles", "maxBytes"] as const) {
    const v = config.limits?.[key];
    if (v !== undefined && !(Number.isInteger(v) && v > 0)) {
      throw new SkelproError("invalid_input", `${file}: limits.${key} must be a positive whole number.`);
    }
  }
  return config;
}

export function limitsFrom(config: SkelproConfig): Limits {
  return { ...DEFAULT_LIMITS, ...config.limits };
}

/** The nearest .skelpro/templates folder at or above startDir. */
export function findRepoTemplatesDir(startDir: string): string | undefined {
  let dir = path.resolve(startDir);
  for (;;) {
    const candidate = path.join(dir, ".skelpro", "templates");
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

function jsonFilesIn(dir: string | undefined, origin: TemplateOrigin): TemplateEntry[] {
  if (!dir || !fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(".json"))
    .map((d) => ({ name: d.name.slice(0, -".json".length), origin, location: path.join(dir, d.name) }))
    .filter((e) => NAME.test(e.name));
}

/** Every named template, nearest source winning when names clash. */
export function discoverTemplates(cwd: string, home = skelproHome(), config = loadConfig(home)): TemplateEntry[] {
  const all = [
    ...jsonFilesIn(findRepoTemplatesDir(cwd), "repo"),
    ...jsonFilesIn(path.join(home, "templates"), "user"),
    ...Object.entries(config.templates ?? {}).map(([name, url]) => ({ name, origin: "remote" as const, location: url })),
  ];

  const byName = new Map<string, TemplateEntry>();
  for (const entry of all) if (!byName.has(entry.name)) byName.set(entry.name, entry);
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function findTemplate(name: string, entries: TemplateEntry[]): TemplateEntry {
  const entry = entries.find((e) => e.name === name);
  if (!entry) {
    throw new SkelproError(
      "template_not_found",
      `No template named "${name}".`,
      entries.length
        ? `Use one of: ${entries.map((e) => e.name).join(", ")}. list_templates shows them all.`
        : "No templates are available. Add .json templates to .skelpro/templates/ in the repository or ~/.skelpro/templates/.",
    );
  }
  return entry;
}

const tooBig = (where: string, limits: Limits) =>
  new SkelproError(
    "limit_exceeded",
    `${where} is larger than the ${Math.round(limits.maxBytes / 1024 / 1024)} MB limit.`,
    "Raise limits.maxBytes in ~/.skelpro/config.json if this template is trusted.",
  );

/** Reads a template's JSON, enforcing the size limit. */
export async function readTemplateEntry(entry: TemplateEntry, limits: Limits, timeoutMs = 15_000): Promise<unknown> {
  let text: string;

  if (entry.origin === "remote") {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(entry.location, { signal: controller.signal });
      if (!response.ok) {
        throw new SkelproError(
          "remote_fetch_failed",
          `Could not fetch template "${entry.name}": ${response.status} ${response.statusText}.`,
          "Check the URL in ~/.skelpro/config.json.",
        );
      }
      const declared = Number(response.headers.get("content-length") ?? 0);
      if (declared > limits.maxBytes) throw tooBig(`Template "${entry.name}"`, limits);
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > limits.maxBytes) throw tooBig(`Template "${entry.name}"`, limits);
      text = buffer.toString("utf8");
    } catch (error) {
      if (error instanceof SkelproError) throw error;
      throw new SkelproError(
        "remote_fetch_failed",
        `Could not fetch template "${entry.name}": ${(error as Error).name === "AbortError" ? "timed out" : (error as Error).message}.`,
      );
    } finally {
      clearTimeout(timer);
    }
  } else {
    if (fs.statSync(entry.location).size > limits.maxBytes) throw tooBig(`Template "${entry.name}"`, limits);
    text = fs.readFileSync(entry.location, "utf8");
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    throw new SkelproError("invalid_template", `Template "${entry.name}" is not valid JSON: ${(error as Error).message}`);
  }
}
