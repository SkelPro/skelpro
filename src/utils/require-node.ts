/**
 * SkelPro needs Node.js 20 or newer (its dependencies minimatch 11 and
 * zod 4 don't support older versions). cli.ts imports this module first,
 * so on an older Node the user gets a clear message instead of a confusing
 * crash from deep inside a dependency.
 */

export const MIN_NODE_MAJOR = 20;

/** True if a version string like "v20.11.1" or "18.20.4" is supported. */
export function isSupportedNode(version: string): boolean {
  const major = Number(/^v?(\d+)\./.exec(version)?.[1]);
  return Number.isFinite(major) && major >= MIN_NODE_MAJOR;
}

if (!isSupportedNode(process.version)) {
  process.stderr.write(
    `SkelPro requires Node.js ${MIN_NODE_MAJOR} or newer; you are running ${process.version}.\n` +
      `Upgrade Node.js (https://nodejs.org), or use skelpro@1.6.0 on older versions.\n`,
  );
  process.exit(1);
}
