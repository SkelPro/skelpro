import fs from "fs";
import path from "path";
import axios from "axios";
import ora from "ora";
import { tone, toneLevel, useTimestamp } from "tonelog";
import type { JsonStructure } from "./types/structures";
import genJsonTemplate from "./hooks/genJsonTemplate";
import makeStructure from "./hooks/makeStructure";

export async function createTemplate(srcPath: string, fileName: string) {        
  const spinner = ora("\nCreating template...").start();

  const folderStructure = genJsonTemplate(srcPath);
  fs.writeFileSync(
    `${fileName}.skel.json`,
    JSON.stringify(folderStructure, null, 2),
    "utf8"
  );
  console.log(
    useTimestamp(
      toneLevel.success(`\nTemplate created and saved to ${tone.bg_green(fileName + ".skel.json")}`)
    )
  );
  spinner.succeed("Done.");
}

export async function scaffoldTemplate(srcPath: string) {
  const spinner = ora("\nProcessing...").start();

  const base = path.parse(srcPath).name;
  const fileContent = fs.readFileSync(srcPath, 'utf8');
  let jsonFile: JsonStructure;
  
  try {
    jsonFile = JSON.parse(fileContent);
  } catch (parseError) {
    throw new Error("Invalid file content: Unable to parse as FolderStructure.");
  }
  makeStructure(base, jsonFile);
  console.log(
    useTimestamp(
      toneLevel.success(`\nScaffolding ${tone.bg_green(base)} completed.`)
    )
  );
  spinner.succeed("Done.");
}

export async function fetchTemplate(url: string) {
  const spinner = ora("\nFetching...").start();

  try {
    const response = await axios.get(url, { timeout: 100000 });
    const jsonFile = response.data;

    // Validate JSON structure
    if (!jsonFile || typeof jsonFile !== "object") {
      throw new Error("Invalid JSON structure or empty response.");
    }
    const urlObj = new URL(url);
    const base = path.basename(urlObj.pathname, path.extname(urlObj.pathname));

    makeStructure(base, jsonFile); // Scaffold the project
    console.log(
      useTimestamp(
        toneLevel.success(`\n✅ Successfully scaffolded project "${tone.bg_green(base)}".`)
      )
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error("Error during Fetch and Scaffold:", error.message);
    } else {
      console.error("Error during Fetch and Scaffold:", String(error));
    }
    throw error;
  }
  spinner.succeed("Done.");
}

