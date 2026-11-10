import fs from "fs";
import path from "path";
import os from "os";

import { tone, toneLevel } from "tonelog";

import type { NewsTypes } from "../types/structures";
import { NEWS_URL, VERSION } from "../utils/constant";

const CACHE_FILE = path.join(os.homedir(), ".skelpro-update-cache.json");

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

function shouldCheckUpdates(): boolean {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      return true;
    }

    const cache = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));

    const elapsed = Date.now() - cache.lastChecked;

    return elapsed > CACHE_DURATION;
  } catch {
    return true;
  }
}

function saveUpdateCache() {
  try {
    fs.writeFileSync(
      CACHE_FILE,
      JSON.stringify({
        lastChecked: Date.now(),
      }),
      "utf8",
    );
  } catch {
    // Ignore cache errors
  }
}

/**
 * News and update notices are for humans at a terminal. Skip them for
 * --quiet, CI, and anyone who opted out, so agent and CI output stays clean.
 */
export function updatesDisabled(
  quiet?: boolean,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const truthy = (v?: string) => v !== undefined && v !== "" && v !== "0" && v.toLowerCase() !== "false";
  return Boolean(quiet) || truthy(env.CI) || truthy(env.NO_UPDATE_NOTIFIER);
}

async function checkNewVersion(): Promise<string | undefined> {
  try {
    const response = await fetch("https://registry.npmjs.org/skelpro/latest");

    const data = (await response.json()) as {
      version: string;
    };

    return data.version;
  } catch {
    return undefined;
  }
}

async function fetchNews() {
  try {
    const response = await fetch(NEWS_URL);

    const data = (await response.json()) as {
      news: NewsTypes;
    };

    return data;
  } catch {
    return undefined;
  }
}

async function logUpdates() {
  // Skip network request if cache is still valid
  if (!shouldCheckUpdates()) {
    return;
  }

  const newsData = await fetchNews();

  // The running version; `npm list -g` was slow and wrong for npx users.
  const localVersion = VERSION;

  const latestVersion = await checkNewVersion();

  if (localVersion && latestVersion && localVersion !== latestVersion) {
    console.log(
      toneLevel.info(`A new version ${latestVersion} is available!`, "update"),
    );

    console.log(
      `Run: ${tone.green("npm update -g skelpro")} to get latest version.`,
    );
  }

  if (newsData && Array.isArray(newsData.news)) {
    console.log("");

    newsData.news.forEach((newsItem: NewsTypes) => {
      console.log(toneLevel.info(newsItem.title));

      console.log(newsItem.message);
    });
  }

  // Save successful check
  saveUpdateCache();
}

export default logUpdates;
