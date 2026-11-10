# Using SkelPro with AI agents (MCP server)

`skelpro mcp` runs SkelPro as an [MCP](https://modelcontextprotocol.io) server, so coding agents such as Claude, Cursor and GitHub Copilot can list your team's templates, create projects from them and check structure as tool calls. One tool call produces the team's exact project layout, instead of an agent improvising dozens of boilerplate files.

## Setup

Most MCP clients accept the same JSON. Print it with:

```bash
npx skelpro mcp --print-config
```

```json
{
  "mcpServers": {
    "skelpro": { "command": "npx", "args": ["-y", "skelpro", "mcp"] }
  }
}
```

The server runs in the folder the client starts it in (usually the open project), finds templates from there, and only creates projects inside it.

### Claude Code

```bash
claude mcp add skelpro -- npx -y skelpro mcp
```

Or share it with the team by putting the JSON above in `.mcp.json` at the repository root.

### Claude Desktop

Add the JSON above to `claude_desktop_config.json` (Settings → Developer → Edit Config), then restart Claude Desktop. Claude Desktop doesn't start in a project folder, so add `--root` with the folder to work in:

```json
{
  "mcpServers": {
    "skelpro": { "command": "npx", "args": ["-y", "skelpro", "mcp", "--root", "/Users/you/code"] }
  }
}
```

### Cursor

Put the JSON above in `.cursor/mcp.json` in the project, or `~/.cursor/mcp.json` for every project.

### VS Code (GitHub Copilot)

VS Code uses a `servers` key. In `.vscode/mcp.json`:

```json
{
  "servers": {
    "skelpro": { "type": "stdio", "command": "npx", "args": ["-y", "skelpro", "mcp"] }
  }
}
```

### Windows

Some clients can't start `npx` directly on Windows. If the server doesn't start, use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "skelpro", "mcp"]`.

## Tools

| Tool | Inputs | Returns |
|---|---|---|
| `list_templates` | `query?` | Name, description, origin and variables of each available template |
| `describe_template` | `template` | Its variables (type, default, pattern, options), files, layout, rules and `AGENTS.md`, if any |
| `scaffold_project` | `template`, `targetDir`, `variables?`, `dryRun?` (default `true`), `overwrite?` (default `false`) | The file plan; with `dryRun: false`, the files written |
| `check_structure` | `projectDir?` (default `.`), `template?`, `variables?` | The `skelpro check` report, plus `passed` |
| `save_template` | `sourceDir`, `name`, `variables?`, `description?`, `include?`, `exclude?`, `overwrite?` | Template path, file count, and every skipped path with the reason |

A typical exchange: the agent calls `list_templates`, picks one, calls `scaffold_project` (a dry run), shows you the plan, calls it again with `dryRun: false`, reads the new project's `AGENTS.md`, and later runs `check_structure` on its own work before saying it's done.

## Where templates come from

The server looks in three places, nearest first. When two have a template with the same name, the nearest one wins.

1. **`.skelpro/templates/` in the repository**: team templates, versioned with the code. SkelPro uses the nearest such folder at or above the server's folder. `save_template` saves here.
2. **`~/.skelpro/templates/`**: your personal templates.
3. **Remote templates listed in `~/.skelpro/config.json`**, for example a team's templates on GitHub:

```json
{
  "templates": {
    "node-api": "https://raw.githubusercontent.com/your-team/templates/main/node-api.json"
  },
  "limits": { "maxFiles": 2000, "maxBytes": 20971520 }
}
```

A template's name is its file name without `.json` (or its key in `templates`). Agents refer to templates by name only.

## Safety

| Rule | Why |
|---|---|
| **Templates by name only.** The server never fetches a URL an agent supplies; remote templates come only from `config.json`. | A prompt injection could otherwise point the agent at a malicious template. |
| **Allowed folders.** Projects are created, saved and checked only inside the folder the server started in, plus any `--root <folder>` (repeatable). Symlinks are resolved first, so a link can't lead outside. | An agent can't write to, or read into a template, anything else on your machine. |
| **Dry run by default.** `scaffold_project` returns the plan unless `dryRun: false`. | You see what will be created before it is. |
| **No overwrites.** Existing files are listed as `conflicts` and kept unless `overwrite: true`. Templates are never replaced by `save_template` unless `overwrite: true`. | Nothing you have is lost by accident. |
| **Limits.** At most 2,000 files and 20 MB per template, changeable with `limits` in `config.json`. | A huge or hostile template can't fill the disk. |
| **Paths stay inside the project**, even when they come from variable values. | Same checks as `skelpro create`. |
| **No scripts.** Templates can't run commands, and the server never installs dependencies. | A template that can run commands can install malware. |
| **Clean stdout.** Nothing but protocol messages is written to stdout: no banners, colours or update checks. | Stray output breaks the protocol. |

## Errors

Every tool error is structured, with a code, a message and usually a fix, so the agent can correct itself:

```json
{
  "error": {
    "code": "missing_variable",
    "message": "Missing required variable:\n  owner (string): owning team\nPass them with --var name=value or --vars file.json.",
    "fix": "Pass the listed variables in `variables`; describe_template shows each one's type and pattern.",
    "details": [{ "variable": "owner", "type": "string", "description": "owning team" }]
  }
}
```

| Code | Meaning |
|---|---|
| `template_not_found` | No template with that name; `fix` lists the available ones |
| `missing_variable`, `invalid_variable`, `unknown_variable` | Variable problems; `details` names each variable with its type, pattern and options |
| `invalid_template` | The template file itself is broken |
| `outside_allowed_roots` | The folder is outside what the server may touch; restart it with `--root` to allow more |
| `conflicts` | Files already exist; `details.conflicts` lists them |
| `limit_exceeded` | Too many files or bytes |
| `unsafe_path` | A template path would leave the project folder |
| `remote_fetch_failed` | A configured remote template couldn't be fetched |
| `not_found`, `invalid_input` | A missing folder, or a bad argument |

## Trying it without an agent

The [MCP Inspector](https://github.com/modelcontextprotocol/inspector) lets you call the tools by hand:

```bash
npx @modelcontextprotocol/inspector npx -y skelpro mcp
```
