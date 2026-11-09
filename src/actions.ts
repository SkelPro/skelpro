import fs from "fs";
import { toneLevel } from "tonelog";
import type { JsonStructure } from "./types/structures";
import type { IgnoreOptions } from "./utils/ignore";

import createJSON from "./hooks/createJSON";
import scaffoldJSON from "./hooks/scaffoldJSON";
import installDeps from "./hooks/installDeps";
import { createGitWorktree } from "./hooks/createWorktree";

async function createTemplate(
  srcPath: string,
  fileName: string,
  options: IgnoreOptions = {},
) {
  console.log("Creating template...");

  const skipped: string[] = [];
  const folderStructure = createJSON(srcPath, { ...options, skipped });

  if (skipped.length) {
    console.log(
      toneLevel.info(
        `Skipped ${skipped.length} ignored path(s): ${skipped.slice(0, 10).join(", ")}` +
          (skipped.length > 10 ? `, and ${skipped.length - 10} more` : ""),
      ),
    );
    console.log("Use --include <glob> to keep any of them.");
  }

  fs.writeFileSync(
    `${fileName}.json`,
    JSON.stringify(folderStructure, null, 2),
    "utf8",
  );

  console.log(
    toneLevel.success(`Template created and saved to ${fileName}.json`, "done"),
  );
}

/** Scaffolds a parsed template, then optionally installs dependencies. */
async function buildProject(
  jsonFile: JsonStructure,
  baseName: string,
  install: boolean,
  useWorktree: boolean,
  branchName: string,
) {
  if (!jsonFile || typeof jsonFile !== "object" || Array.isArray(jsonFile)) {
    throw new Error("Invalid template: expected a JSON object.");
  }

  if (jsonFile.worktree === true) {
    useWorktree = true;
  }

  if (useWorktree) {
    if (!branchName) {
      throw new Error("A branch name is required to create a worktree (use --branch).");
    }
    await createGitWorktree(baseName, jsonFile, branchName);
  } else {
    scaffoldJSON(baseName, jsonFile);
  }

  console.log(toneLevel.success(`Scaffolding ${baseName} completed.`, "done"));

  if (install) {
    await installDeps(baseName);
    console.log("All dependencies installed.");
  }
}

async function scaffoldTemplate(
  srcPath: string,
  baseName: string,
  install: boolean,
  useWorktree: boolean = false,
  branchName: string,
) {
  console.log("Scaffolding template...");

  const fileContent = fs.readFileSync(srcPath, "utf8");

  let jsonFile: JsonStructure;
  try {
    jsonFile = JSON.parse(fileContent);
  } catch {
    throw new Error(`Invalid template: ${srcPath} is not valid JSON.`);
  }

  await buildProject(jsonFile, baseName, install, useWorktree, branchName);
}

async function fetchTemplate(
  url: string,
  baseName: string,
  install: boolean,
  useWorktree: boolean = false,
  branchName: string,
) {
  console.log("Fetching template skeleton...");

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not fetch template: ${response.status} ${response.statusText} (${url})`);
  }

  let jsonFile: JsonStructure;
  try {
    jsonFile = (await response.json()) as JsonStructure;
  } catch {
    throw new Error(`Invalid template: ${url} did not return valid JSON.`);
  }

  console.log("Scaffolding template...");
  await buildProject(jsonFile, baseName, install, useWorktree, branchName);
}

export { createTemplate, fetchTemplate, scaffoldTemplate };
