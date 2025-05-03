import fs from "fs";
import axios from "axios";
import { toneLevel } from "tonelog";

import type { JsonStructure } from "./types/structures";
<<<<<<< HEAD
import createJSON from "./hooks/createJSON";
import scaffoldJSON from "./hooks/scaffoldJSON";
=======
import genJsonTemplate from "./hooks/genJsonTemplate";
import makeStructure from "./hooks/makeStructure";
>>>>>>> 29fbee78b94a8a10fe58d89f03b05d58bf68a69b
import installDeps from "./hooks/installDeps";

export async function createTemplate(srcPath: string, fileName: string) {        
  console.log("Creating template...");

<<<<<<< HEAD
  const folderStructure = createJSON(srcPath);
=======
  const folderStructure = genJsonTemplate(srcPath);
>>>>>>> 29fbee78b94a8a10fe58d89f03b05d58bf68a69b
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
<<<<<<< HEAD
  scaffoldJSON(baseName, jsonFile);
=======
  makeStructure(baseName, jsonFile);
>>>>>>> 29fbee78b94a8a10fe58d89f03b05d58bf68a69b
  
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
    const response = await axios.get(url, { timeout: 100000 });
    const jsonFile = response.data;

    // Validate JSON structure
    if (!jsonFile || typeof jsonFile !== "object") {
      throw new Error("Invalid JSON structure or empty response.");
    }
    // const urlObj = new URL(url);
    // const base = path.basename(urlObj.pathname, path.extname(urlObj.pathname));

    console.log("Scaffolding template...");
<<<<<<< HEAD
    scaffoldJSON(baseName, jsonFile); // Scaffold the project
=======
    makeStructure(baseName, jsonFile); // Scaffold the project
>>>>>>> 29fbee78b94a8a10fe58d89f03b05d58bf68a69b
    
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

