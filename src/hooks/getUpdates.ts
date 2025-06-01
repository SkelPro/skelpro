import path from "path";
import { execSync } from "child_process";
import fetch from "node-fetch";
import { readFileSync } from "fs";
import { tone, toneLevel } from "tonelog";

import type { NewsTypes } from "../types/structures";
import { packageName, newsUrl } from "../utils/constant";

async function getInstalledVersion(): Promise<string | null> {
  try {
    const version = execSync("npm list -g skelpro --json", { encoding: "utf-8"});
    const parsed = JSON.parse(version);

    return parsed.dependencies?.[packageName]?.version || null;
  } catch {
    return null; // Silently fail
  }
}

export async function checkNewVersion() {
  try {
    const localVersion = await getInstalledVersion();

    if (!localVersion) return;

    // Fetch latest version
    const response = await fetch("https://registry.npmjs.org/skelpro/latest");
    const data = (await response.json()) as { version: string };
    const latestVersion = data.version;

    if (latestVersion !== localVersion) {
     return latestVersion;
    }

    return 0;
  } catch (error) {
    // Silently fail (do nothing) 
    // if unable to fetch news  (e.g., offline)
  }
}

export async function fetchNews() {
  try {
    const response = await fetch(newsUrl);
    const data = (await response.json()) as { news: NewsTypes[] };

    return data;    
  } catch (error) {
    // Silently fail (do nothing) 
    // if unable to fetch news  (e.g., offline)
  }
}

export function logUpdates(version: number, newsData: NewsTypes) {
  console.log("\nChecking for updates...\nPress CTRL-C to exit.");
  console.log("\n");

  if (version > 0) {
    console.log(
      toneLevel.info(`A new version ${version} is available!`, "update")
    );
    console.log(`Run: ${tone.green("npm update -g skelpro")} to get latest version.`);
  }

  if (Array.isArray(newsData.news)) {
    console.log("");
    
    newsData.news.forEach((newsItem: NewsTypes) => {
      console.log(
        toneLevel.info(`${newsItem.title}`)
      );

      console.log(`${newsItem.message}`);
    })
  }  
}

