import { execSync } from "child_process";
import fetch from "node-fetch";
import { tone, toneLevel } from "tonelog";

import type { NewsTypes } from "../types/structures";
import { PACKAGE_NAME, NEWS_URL } from "../utils/constant";

async function getInstalledVersion(): Promise<string | null> {
  try {
    const version = execSync("npm list -g skelpro --json", {
      encoding: "utf-8",
    });
    const parsed = JSON.parse(version);

    return parsed.dependencies?.[PACKAGE_NAME]?.version || null;
  } catch {
    return null; // Silently fail
  }
}

export async function checkNewVersion(): Promise<string | undefined> {
  try {
    // Fetch latest version
    const response = await fetch("https://registry.npmjs.org/skelpro/latest");
    const data = (await response.json()) as { version: string };
    const latestVersion = data.version;

    return latestVersion;
  } catch (error) {
    // Silently fail (do nothing)
    // if unable to fetch news  (e.g., offline)
  }
}

export async function fetchNews() {
  try {
    const response = await fetch(NEWS_URL);
    const data = (await response.json()) as { news: NewsTypes };

    return data;
  } catch (error) {
    // Silently fail (do nothing)
    // if unable to fetch news  (e.g., offline)
  }
}

export async function logUpdates() {
  // logUpdates function will only be called when fetching a remote template.
  const newsData = await fetchNews();
  const localVersion = await getInstalledVersion();
  const latestVersion = await checkNewVersion();

  if (localVersion !== latestVersion) {
    console.log(
      toneLevel.info(`A new version ${latestVersion} is available!`, "update")
    );
    console.log(
      `Run: ${tone.green("npm update -g skelpro")} to get latest version.`
    );
  }

  if (Array.isArray(newsData)) {
    console.log("");

    newsData.forEach((newsItem: NewsTypes) => {
      console.log(toneLevel.info(`${newsItem.title}`));

      console.log(`${newsItem.message}`);
    });
  }
}
