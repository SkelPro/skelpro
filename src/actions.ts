import fs from "fs";
import axios from "axios";
import ora from "ora";
import { tone, toneLevel, useTimestamp } from "tonelog";
import type { JsonStructure } from "./types/structures";
import genJsonTemplate from "./hooks/genJsonTemplate";
import makeStructure from "./hooks/makeStructure";
import installDeps from "./hooks/installDeps";

export async function createTemplate(srcPath: string, fileName: string) {        
  const spinner = ora("Creating template...\n").start();

  const folderStructure = genJsonTemplate(srcPath);
  fs.writeFileSync(
    `${fileName}.skel.json`,
    JSON.stringify(folderStructure, null, 2),
    "utf8"
  );
  console.log(
    useTimestamp(
      tone.success(`\nTemplate created and saved to ${tone.bg_green(fileName)}.skel.json`)
    )
  );

  spinner.succeed("Done.");
}

export async function scaffoldTemplate(srcPath: string, baseName: string, install: boolean) {
  const spinner = ora("Processing...\n").start();

  const fileContent = fs.readFileSync(srcPath, 'utf8');
  let jsonFile: JsonStructure;
  
  try {
    jsonFile = JSON.parse(fileContent);
  } catch (parseError) {
    throw new Error("Invalid file content: Unable to parse as FolderStructure.");
  }
  makeStructure(baseName, jsonFile);
  console.log(
    useTimestamp(
      toneLevel.success(`\nScaffolding ${tone.bg_green(baseName)} completed.`)
    )
  );

  if (install) {
    installDeps(baseName);
  }

  spinner.succeed("Done.");
}

export async function fetchTemplate(url: string, baseName: string, install: boolean) {
  const spinner = ora("Fetching...\n").start();

  try {
    const response = await axios.get(url, { timeout: 100000 });
    const jsonFile = response.data;

    // Validate JSON structure
    if (!jsonFile || typeof jsonFile !== "object") {
      throw new Error("Invalid JSON structure or empty response.");
    }
    // const urlObj = new URL(url);
    // const base = path.basename(urlObj.pathname, path.extname(urlObj.pathname));

    makeStructure(baseName, jsonFile); // Scaffold the project
    console.log(
      useTimestamp(
        toneLevel.success(`\n✅ Successfully scaffolded project "${tone.bg_green(baseName)}".`)
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

  if (install) {
    installDeps(baseName);
  }
  spinner.succeed("Done.");
}

