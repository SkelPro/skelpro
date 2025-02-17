import fs from "fs";
import axios from "axios";
import { toneLevel } from "tonelog";
import type { JsonStructure } from "./types/structures";
import genJsonTemplate from "./hooks/genJsonTemplate";
import makeStructure from "./hooks/makeStructure";
import installDeps from "./hooks/installDeps";

export async function createTemplate(srcPath: string, fileName: string) {        
  console.log("Creating template...");

  const folderStructure = genJsonTemplate(srcPath);
  fs.writeFileSync(
    `${fileName}.skel.json`,
    JSON.stringify(folderStructure, null, 2),
    "utf8"
  );
  
  console.log(
    toneLevel.success(`\nTemplate created and saved to ${fileName}.skel.json`, "done")
  );

}

export async function scaffoldTemplate(srcPath: string, baseName: string, install: boolean) {
  console.log("Scaffolding template...");

  const fileContent = fs.readFileSync(srcPath, 'utf8');
  let jsonFile: JsonStructure;
  
  try {
    jsonFile = JSON.parse(fileContent);
  } catch (parseError) {
    throw new Error("Invalid file content: Unable to parse as FolderStructure.");
  }
  makeStructure(baseName, jsonFile);
  
  console.log(
    toneLevel.success(`Scaffolding ${baseName} completed.`, "done")
  );

  if (install) {
    installDeps(baseName)
      .catch((err) => console.error("Failed to install dependencies:", err));
  }
}

export async function fetchTemplate(url: string, baseName: string, install: boolean) {
  console.log("Fetching...");

  try {
    const response = await axios.get(url, { timeout: 100000 });
    const jsonFile = response.data;

    // Validate JSON structure
    if (!jsonFile || typeof jsonFile !== "object") {
      throw new Error("Invalid JSON structure or empty response.");
    }
    // const urlObj = new URL(url);
    // const base = path.basename(urlObj.pathname, path.extname(urlObj.pathname));

    console.log("Scaffolding template...");
    makeStructure(baseName, jsonFile); // Scaffold the project
    
    console.log(
      toneLevel.success(`\n✅ Successfully scaffolded project "${baseName}".`, "done")
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
    installDeps(baseName)
      .catch((err) => console.error("Failed to install dependencies:", err));
  }
}

