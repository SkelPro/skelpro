# SkelPro template reference

A SkelPro template is a JSON file that describes a project's files and folders. There are two formats:

- **v1**: a plain file tree, copied exactly. This is what `skelpro save` produces without `--var`, and every template made before v1.7 is v1.
- **v2**: the same tree inside an envelope that adds a name, a description and **variables**. File contents and file names can use `{{placeholders}}`, and files can be optional.

A template is v2 when it has `"skelpro": 2`. Anything without a `skelpro` key is read as v1, so existing templates keep working and are never rendered.

## A complete v2 example

```json
{
  "$schema": "https://raw.githubusercontent.com/SkelPro/skelpro/main/schema/template-v2.json",
  "skelpro": 2,
  "name": "node-api",
  "description": "Express API with TypeScript, Vitest and Docker",
  "variables": {
    "projectName": { "type": "string", "description": "npm package name", "pattern": "^[a-z0-9-]+$" },
    "description": { "type": "string", "default": "" },
    "port": { "type": "number", "default": 3000 },
    "includeDocker": { "type": "boolean", "default": true },
    "database": { "type": "enum", "options": ["none", "postgres", "sqlite"], "default": "none" }
  },
  "files": {
    "package.json": "{\n  \"name\": \"{{projectName}}\",\n  \"description\": \"{{description}}\"\n}",
    "src": {
      "server.ts": "app.listen({{port}});",
      "{{pascal projectName}}Service.ts": "export class {{pascal projectName}}Service {}"
    },
    "Dockerfile": { "$when": "includeDocker", "$content": "FROM node:22-alpine\n" },
    "src/db": { "$when": "database != 'none'", "client.ts": "// {{database}} client" }
  }
}
```

`skelpro create my-api ./node-api.json --var database=postgres` creates `my-api/src/MyApiService.ts`, a `Dockerfile` and `src/db/client.ts`, with `my-api` in `package.json` and port `3000` in `server.ts`.

## Envelope fields

| Field | Required | Meaning |
|---|---|---|
| `skelpro` | yes | Always `2`. |
| `files` | yes | The file tree (see below). |
| `name` | no | Shown by `skelpro info`. |
| `description` | no | Shown by `skelpro info`. |
| `variables` | no | Values the template asks for. |
| `worktree` | no | `true` always creates the project as a Git worktree. |
| `$schema` | no | Link to the JSON Schema, for editor autocomplete and checking. |

## Files

Inside `files`, each key is a file or folder name:

- **A string** is a file; the string is its content.
- **An object** is a folder containing more entries.
- **An object with `$content`** is a file that has a condition (see [Optional files](#optional-files-when)).

Names may contain `/` to create nested folders in one key (`"src/db"`). Names starting with `$` are reserved. Absolute paths and `..` segments are refused, even when they come from a variable value, so a template can never write outside the project folder.

Binary files (images, fonts, PDFs) are stored as base64 data URIs (`data:image/png;base64,...`). `skelpro save` does this for you, and they are never rendered.

## Variables

Each variable has a `type`:

| Type | Example definition | Notes |
|---|---|---|
| `string` | `{ "type": "string", "pattern": "^[a-z0-9-]+$" }` | `pattern` is optional. |
| `number` | `{ "type": "number", "default": 3000 }` | |
| `boolean` | `{ "type": "boolean", "default": true }` | Accepts `true/false`, `yes/no`, `1/0`. |
| `enum` | `{ "type": "enum", "options": ["none", "postgres"] }` | Value must be one of `options`. |

Every type can also have a `description` (shown in prompts and by `skelpro info`) and a `default`. A variable without a default is **required**.

### Built-in variables

These are always available, without declaring them:

| Name | Value |
|---|---|
| `projectName` | The project name given to `skelpro create` (the last part of the path). If you declare `projectName`, you can add a `pattern` or `description`, and `--var projectName=...` overrides it. |
| `year` | The current year, for example `2026`. |
| `date` | Today's date as `YYYY-MM-DD`. |

## Placeholders

`{{name}}` inserts a variable's value. It works in file contents **and** in file and folder names.

### Case helpers

`{{helper name}}` inserts the value converted to another naming style. Words are split on spaces, punctuation and camelCase boundaries.

| Placeholder | `my-api` becomes |
|---|---|
| `{{kebab projectName}}` | `my-api` |
| `{{snake projectName}}` | `my_api` |
| `{{camel projectName}}` | `myApi` |
| `{{pascal projectName}}` | `MyApi` |
| `{{upper projectName}}` | `MY_API` |

### Writing a literal `{{`

Vue, Handlebars and GitHub Actions files use `{{ }}` themselves. Write `\{{` to output a literal `{{`. In JSON the backslash itself must be escaped, so it looks like this:

```json
"deploy.yml": "token: \\{{ secrets.TOKEN }}"
```

which produces `token: {{ secrets.TOKEN }}`. `skelpro save --var` escapes existing `{{` for you.

Placeholders are deliberately simple: a name, or a helper and a name. Anything else, such as `{{ name.length }}`, is an error. Templates can't run code.

## Optional files (`$when`)

Add `$when` to a folder, or use `{ "$when": ..., "$content": ... }` for a single file:

```json
"Dockerfile": { "$when": "includeDocker", "$content": "FROM node:22\n" },
"src/db": { "$when": "database != 'none'", "client.ts": "..." }
```

A condition is one of:

| Condition | True when |
|---|---|
| `name` | the value is truthy (not `false`, `0` or empty) |
| `!name` | the value is falsy |
| `name == 'value'` | the value equals `value` |
| `name != 'value'` | the value doesn't equal `value` |

Numbers and `true`/`false` can be written without quotes (`port == 3000`). There are no `&&`, `||` or other expressions.

## Using templates

### Creating a project

```bash
skelpro create my-api ./node-api.json --var port=8080 --var database=postgres
skelpro create my-api ./node-api.json --vars answers.json      # {"port": 8080, "database": "postgres"}
skelpro create my-api ./node-api.json --yes                    # accept all defaults, never prompt
```

`--var` overrides values from `--vars`. Anything still missing is **prompted for** when you're at a terminal. With `--yes`, or when SkelPro isn't running in a terminal (agents, CI), a missing required variable is an error that lists what's needed:

```
Error: Missing required variable:
  owner (string): team that owns it
Pass them with --var name=value or --vars file.json.
```

Values are checked against their type, `pattern` and `options`, and unknown variable names are an error. All of this happens before any file is written.

### Inspecting a template

```bash
skelpro info ./node-api.json          # name, description, variables and files
skelpro info ./node-api.json --json   # the same, as JSON (for scripts and agents)
```

### Turning a project into a v2 template

```bash
skelpro save node-api ./my-api --var projectName=my-api --var port=3000 --description "Express API"
```

Every occurrence of each value is replaced with a placeholder, in file contents and in file names:

- `my-api` becomes `{{projectName}}`, and its case variants become helpers: `MyApi` → `{{pascal projectName}}`, `my_api` → `{{snake projectName}}`, and so on.
- Numbers are replaced only as whole numbers, so `3000` doesn't touch `30001`.
- Existing `{{` in your files is escaped as `\{{`.
- The `variables` block is written for you. Each value becomes the default, except `projectName`, which defaults to the name given to `create`.

`save` prints how many replacements it made for each variable and in which files. **Read it**: a short or common value (such as `api`) can match more than you intended. Booleans can't be substituted this way, since every `true` in the project would change; add boolean variables and `$when` blocks by hand.

## Editor support

Add the `$schema` line to get autocomplete and inline errors in VS Code and other editors that understand JSON Schema:

```json
"$schema": "https://raw.githubusercontent.com/SkelPro/skelpro/main/schema/template-v2.json"
```

`skelpro save --var` adds it automatically. The schema also ships in the npm package at `node_modules/skelpro/schema/template-v2.json`.

## What templates can't do

Templates can't run commands. There are no post-create scripts: a template that can run commands can install malware. Installing dependencies only happens when you pass `--install` to `create`.
