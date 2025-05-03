import fs from "fs";
import path from "path";

import type { JsonStructure } from "../types/structures";
import { getFileExtension, imgExtensions } from "../utils/file";

export default function scaffoldJSON( dir: string, structure: JsonStructure ): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  Object.keys(structure).forEach((key) => {
    const fullPath = path.join(dir, key);
    const value: any = structure[key];

    if (typeof value === "string") {
      const parentDir = path.dirname(fullPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }

      if (imgExtensions.includes(getFileExtension(key))) {
        // Encode image files in base64
        fs.writeFileSync(fullPath, Buffer.from(value.split(",")[1], "base64"));
      } else {
        fs.writeFileSync(fullPath, value, "utf8");
      }
    } else {
      scaffoldJSON(fullPath, value);
    }
  });
}
