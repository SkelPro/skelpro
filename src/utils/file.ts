import path from "path";

export const ignoreFolders: string[] = [
  /*********************************\
   *            Node.js             *
  \*********************************/
  "node_modules",
  ".env",
  ".cache",
  "logs",
  "temp",
  "tmp",
  ".next",
  "dist",
  "build",
  "package-lock.json",

  /*********************************\
   *            Python              *
  \*********************************/
  "venv",
  "__pycache__",
  "*.pyc",
  "*.pyo",
  "*.pyd",
  "*.pyd",
  "*.pyo",
  ".python-version",
  "instance",
  "local_settings.py",
  "db.sqlite3",
  "db.sqlite3-journal",
  ".webassets-cache",
  "site.db",

  /*********************************\
   *             PHP                *
  \*********************************/
  "vendor",
  ".phpunit.result.cache",
  "composer.lock",

  /*********************************\
   *       IDE and Editor files     *
  \*********************************/
  ".vscode",
  ".idea",
  "*.suo",
  "*.ntvs*",
  "*.njsproj",
  "*.sln",
  
  /*********************************\
   *        Miscellaneous           *
  \*********************************/
  ".git",
  "*.log",
  ".db",
  "config.ini",
  "downloads",
  ".DS_Store",
  "thumbs.db",

  /*********************************\
   *       Java and Maven           *
  \*********************************/
  "target",
  ".project",
  ".classpath",
  ".settings",
  ".factorypath",

  /*********************************\
   *            Ruby                *
  \*********************************/
  ".bundle",
  ".ruby-gemset",
  ".ruby-version",
  "Gemfile.lock",
  "node_modules",
  "vendor/bundle",
  "vendor/cache",
  "vendor/rails",
  "vendor/ruby",

  /*********************************\
   *            Rust                *
  \*********************************/
  "target",
  "Cargo.lock",

  /*********************************\
   *            Lua                 *
  \*********************************/
  "*.luac",
  "luarocks",
  ".luarocks",
];

export const imgExtensions: string[] = [
  ".jpeg",
  ".jpg",
  ".png",
  ".PNG"
];

export function getFileExtension(filename: string) {
  return path.extname(filename).toLowerCase();
}

// export const sanitizeJson = (data: string): string => {
//   return data
//     .replace(/'/g, '"') 
//     .replace(/,\s*}/g, '}') 
//     .replace(/,\s*]/g, ']');
// };

export const sanitizeJson = (data: string): string => {
  return data
    .replace(/:\s*'([^']*)'/g, ': "$1"') // Replace single-quoted values with double quotes
    .replace(/'([^']*)'\s*:/g, '"$1":') // Replace single-quoted keys with double quotes
    .replace(/,\s*}/g, '}') // Remove trailing commas in objects
    .replace(/,\s*]/g, ']') // Remove trailing commas in arrays
    .trim(); // Remove whitespace
};

