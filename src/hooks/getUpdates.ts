import path from "path";
import { execSync } from "child_process";
import fetch from "node-fetch";
import { readFileSync } from "fs";
import type { NewsTypes } from "../types/structures";

import { tone, toneLevel } from "tonelog";

const packageName = "skelpro";

const newsUrl = "https://raw.githubusercontent.com/SkelPro/new-updates/refs/heads/main/new-updates.json";

async function getInstalledVersion(): Promise<string | null> {
  try {
    const version = execSync("npm list -g skelpro --json", { encoding: "utf-8"});
    const parsed = JSON.parse(version);

    return parsed.dependencies?.[packageName]?.version || null;
  } catch {
    return null; // Silently fail
  }
}

async function checkNewVersion() {
  try {
    const localVersion = await getInstalledVersion();

    if (!localVersion) return;

    // Fetch latest version
    const response = await fetch("https://registry.npmjs.org/skelpro/latest");
    const data = (await response.json()) as { version: string };
    const latestVersion = data.version;

    if (latestVersion !== localVersion) {
      console.log("\n");
      
      console.log(
        toneLevel.info(`A new version ${latestVersion} is available!`, "update")
      );

      console.log(`Run: ${tone.green("npm update -g skelpro")} to get latest version.`);
    }
  } catch (error) {
    // Silently fail (do nothing) 
    // if unable to fetch news  (e.g., offline)
  }
}

async function fetchNews() {
  try {
    const response = await fetch(newsUrl);
    const data = (await response.json()) as { news: NewsTypes[] };

    if (Array.isArray(data.news)) {
      console.log("");
      
      data.news.forEach((newsItem: NewsTypes) => {
        console.log(
          toneLevel.info(`${newsItem.title}`)
        );

        console.log(`${newsItem.message}`);
        })
    }
  } catch (error) {
    // Silently fail (do nothing) 
    // if unable to fetch news  (e.g., offline)
  }
}

export default async function getUpdates() {
  await checkNewVersion();
  await fetchNews();
}
