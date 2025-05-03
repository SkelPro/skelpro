import fs from "fs";
import path from "path";

import type { JsonStructure } from "../types/structures";
import { getFileExtension, ignoreFolders, imgExtensions } from "../utils/file";

export default function createJSON(dir: string): JsonStructure {
  let result: JsonStructure = {};
  const items = fs.readdirSync(dir, { withFileTypes: true });
  
  items.forEach((item) => {
    const itemPath = path.join(dir, item.name);

    if (!ignoreFolders.includes(item.name)) { // Skip files and folders in ignoreFolders
      if (item.isDirectory()) {
        result[item.name] = createJSON(itemPath);
      } else {
        let ext = getFileExtension(item.name);
  
        if (imgExtensions.includes(ext)) {
          const imgContent = fs.readFileSync(itemPath, "base64");
          result[item.name] = `data:image/${ext.slice(1)};base64,${imgContent}`;
        } else {
          const fileContent = fs.readFileSync(itemPath, "utf8");
          result[item.name] = fileContent;
        }
      }
    }
  });

  return result;
}

