import fs from "fs";
import path from "path";

import type { JsonStructure } from "../types/structures";
import { isBinaryContent, encodeBinary } from "../utils/files";
import {
  createIgnoreMatcher,
  type IgnoreMatcher,
  type IgnoreOptions,
} from "../utils/ignore";

export interface CreateJSONOptions extends IgnoreOptions {
  /** Receives the relative path of every file or folder that was skipped. */
  skipped?: string[];
}

function walk(
  root: string,
  relDir: string,
  matcher: IgnoreMatcher,
  skipped: string[],
): JsonStructure {
  const result: JsonStructure = {};
  const items = fs.readdirSync(path.join(root, relDir), { withFileTypes: true });

  for (const item of items) {
    const relPath = relDir ? path.join(relDir, item.name) : item.name;
    const itemPath = path.join(root, relPath);
    const isDir = item.isDirectory();

    if (matcher.ignores(relPath, isDir)) {
      skipped.push(relPath.split(path.sep).join("/") + (isDir ? "/" : ""));
      continue;
    }

    if (isDir) {
      result[item.name] = walk(root, relPath, matcher, skipped);
    } else if (item.isFile()) {
      const content = fs.readFileSync(itemPath);

      // Binary files (images, fonts, PDFs...) are stored as base64 data URIs.
      result[item.name] = isBinaryContent(content, item.name)
        ? encodeBinary(content, item.name)
        : content.toString("utf8");
    }
  }

  return result;
}

export default function createJSON(
  dir: string,
  options: CreateJSONOptions = {},
): JsonStructure {
  const root = path.resolve(dir);
  const matcher = createIgnoreMatcher(root, options);
  return walk(root, "", matcher, options.skipped ?? []);
}
