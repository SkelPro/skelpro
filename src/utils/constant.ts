import fs from "fs";
import path from "path";

export const PACKAGE_NAME = "skelpro";

/**
 * Reads the version from package.json so semantic-release only has one
 * number to bump. The file sits at a different depth when running from
 * source (ts-node) and from dist/, so walk up until we find it.
 */
function readVersion(): string {
  let dir = __dirname;
  for (;;) {
    const candidate = path.join(dir, "package.json");
    try {
      const pkg = JSON.parse(fs.readFileSync(candidate, "utf8"));
      if (pkg.name === PACKAGE_NAME && typeof pkg.version === "string") {
        return pkg.version;
      }
    } catch {
      // not here; keep walking up
    }
    const parent = path.dirname(dir);
    if (parent === dir) return "0.0.0";
    dir = parent;
  }
}

export const VERSION = readVersion();
export const NEWS_URL =
  "https://raw.githubusercontent.com/SkelPro/new-updates/refs/heads/main/new-updates.json";

export const ASCII_ART = `
\n  ███████╗ ██╗  ██╗ ███████╗ ██╗      ██████╗  ██████╗   ██████╗ 
  ██╔════╝ ██║ ██╔╝ ██╔════╝ ██║      ██╔══██╗ ██╔══██╗ ██╔═══██╗
  ███████╗ █████╔╝  █████╗   ██║      ██████╔╝ ██████═╝ ██║   ██║
        ██║ ██╔═██╗  ██╔══╝   ██║      ██╔═══╝  ██ ██╗   ██║   ██║
  ███████║ ██║  ██╗ ███████╗ ███████╗ ██║      ██║ ██╗  ╚██████╔╝
  ╚══════╝ ╚═╝  ╚═╝ ╚══════╝ ╚══════╝ ╚═╝      ╚═╝ ╚═╝   ╚═════╝  ${VERSION}
`;
