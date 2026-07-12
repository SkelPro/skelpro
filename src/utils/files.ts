import path from "path";
import { minimatch } from "minimatch"; 

export const ignorePatterns: string[] = [
  // ==================== Build & Dist ====================
  "**/dist",
  "**/build",
  "**/out",
  "**/target",
  "**/.next",
  "**/.nuxt",
  "**/.output",

  // ==================== Dependencies ====================
  "**/node_modules",
  "**/bower_components",
  "**/vendor",
  "**/venv",
  "**/.venv",
  "**/env",

  // ==================== Lockfiles ====================
  "**/package-lock.json",
  "**/yarn.lock",
  "**/pnpm-lock.yaml",
  "**/composer.lock",
  "**/Gemfile.lock",
  "**/Cargo.lock",
  "**/poetry.lock",
  "**/Pipfile.lock",

  // ==================== Secrets & Config ====================
  "**/.env",
  "**/.env.*",
  "**/*.pem",
  "**/*.key",
  "**/secrets.*",

  // ==================== Caches & Temp ====================
  "**/.cache",
  "**/logs",
  "**/log",
  "**/tmp",
  "**/temp",
  "**/*.log",
  "**/*.tmp",

  // ==================== Language Specific ====================

  // Python
  "**/__pycache__",
  "**/*.pyc",
  "**/*.pyo",
  "**/*.pyd",
  "**/.python-version",

  // Java / JVM
  "**/*.class",
  "**/*.jar",
  "**/*.war",
  "**/.gradle",

  // .NET
  "**/bin",
  "**/obj",
  "**/*.user",
  "**/*.suo",

  // Rust
  "**/target",

  // Go
  "**/vendor",

  // Dart/Flutter
  "**/.dart_tool",
  "**/build",

  // Swift/iOS
  "**/Pods",
  "**/DerivedData",
  "**/*.xcworkspace",

  // ==================== IDE & Editors ====================
  "**/.vscode",
  "**/.idea",
  "**/.vs",
  "**/*.suo",
  "**/*.swp",
  "**/*.swo",

  // ==================== OS ====================
  "**/.DS_Store",
  "**/Thumbs.db",
  "**/desktop.ini",

  // ==================== Version Control ====================
  "**/.git",
  "**/.svn",
  "**/.hg",

  // ==================== Testing & Coverage ====================
  "**/coverage",
  "**/.nyc_output",
  "**/.jest",
  "**/test-results",

  // ==================== Modern Tooling ====================
  "**/.turbo",
  "**/.vercel",
  "**/.eslintcache",
  "**/.stylelintcache",
  "**/storybook-static",
  "**/.angular",
  "**/.svelte-kit",

  // ==================== Aggressive Extras ====================
  "**/.*.lock",
  "**/*.backup",
  "**/*.bak",
  "**/*.orig",
  "**/*.rej",
  "**/._*",
  "**/Icon?",
  "**/._DS_Store",
];

export const imgExtensions: string[] = [
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
  ".bmp",
  ".ico",
  ".JPG",
  ".PNG",
];

export function shouldIgnore(filePath: string, baseDir: string = ""): boolean {
  const relativePath = path.relative(baseDir, filePath);

  return ignorePatterns.some((pattern) =>
    minimatch(relativePath, pattern, { dot: true, nocase: true }),
  );
}

export function getFileExtension(filename: string): string {
  return path.extname(filename).toLowerCase();
}
