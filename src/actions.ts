import fs from "fs";
import { toneLevel } from "tonelog";
import type { JsonStructure } from "./types/structures";

import createJSON from "./hooks/createJSON";
import scaffoldJSON from "./hooks/scaffoldJSON";
import installDeps from "./hooks/installDeps";

export async function createTemplate(srcPath: string, fileName: string) {        
  console.log("Creating template...");

  const folderStructure = createJSON(srcPath);

  fs.writeFileSync(
    `${fileName}.json`,
    JSON.stringify(folderStructure, null, 2),
    "utf8"
  );
  
  console.log(
    toneLevel.success(`\nTemplate created and saved to ${fileName}.json`, "done")
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
  scaffoldJSON(baseName, jsonFile);
  
  console.log(
    toneLevel.success(`Scaffolding ${baseName} completed.`, "done")
  );

  if (install) {
    installDeps(baseName)
      .then(() => console.log("All dependencies installed."))
      .catch((err) => console.error("Failed to install dependencies:", err));
  }
}

export async function fetchTemplate(url: string, baseName: string, install: boolean) {
  console.log("Fetching...");

  try {
    const response = await fetch(url);
    const jsonFile: JsonStructure = (await response.json()) as JsonStructure;

    // Validate JSON structure
    if (!jsonFile || typeof jsonFile !== "object") {
      throw new Error("Invalid JSON structure or empty response.");
    }
    // const urlObj = new URL(url);
    // const base = path.basename(urlObj.pathname, path.extname(urlObj.pathname));

    console.log("Scaffolding template...");
    scaffoldJSON(baseName, jsonFile); // Scaffold the project
    
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
      .then(() => console.log("All dependencies installed."))
      .catch((err) => console.error("Failed to install dependencies:", err));
  }
}

