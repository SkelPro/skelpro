# Skeleton Project (SkelPro) 💀 

SkelPro helps developers create consistent project structures quickly using reusable templates.

## Sentencified Overview

> **Note:** This document uses the Sentencification technique, a proposed technical writing pattern for creating sentence-level overviews that improve document comprehension.
>
> Learn more: [Introducing Sentencification: A New Technical Writing Pattern](https://open.substack.com/pub/sydney2o5/p/introducing-sentencification-a-new)

1. SkelPro is a command-line tool that generates complete project structures from JSON templates.
2. Developers define project structures using simple JSON template files.
3. SkelPro reads these templates and automatically creates folders and files.
4. Existing projects can be converted into reusable templates.
5. Projects can be generated from local templates or remote templates hosted online.
6. SkelPro supports Git worktrees for isolated AI agent environments and parallel development.
7. Each worktree can have its own custom Git branch.
8. SkelPro initializes independent Git repositories for generated projects.
9. Interactive prompts and command-line options support different project creation workflows.
10. Dependencies can be installed automatically after project generation.
11. Temporary files, dependencies, and build outputs are ignored when creating templates.
12. SkelPro provides update notifications for new releases.
13. Developers can contribute improvements through the contribution guidelines.
14. SkelPro is licensed under the Apache License 2.0.

---

## Overview

SkelPro is a fast command-line tool that creates project structures from reusable JSON templates.

It helps developers avoid repetitive setup tasks by generating consistent development environments in seconds.

With built-in Git worktree support, SkelPro also enables developers and AI agents to work on isolated branches without interfering with the main project.

---

## Features

- **JSON Templates** — Define complete project structures using simple JSON files.
- **Template Variables** — One template, many projects: `{{placeholders}}`, case helpers and optional files.
- **Agent-Ready Projects** — Every project starts with `AGENTS.md`, pointer files and a `.skelpro.json` manifest.
- **Structure Checks** — `skelpro check` reports drift from the layout, in CI, pre-commit hooks or by agents.
- **MCP Server** — Coding agents (Claude, Cursor, Copilot) list templates, create projects and check structure as tool calls.
- **Quick Scaffolding** — Generate folders and files instantly from templates.
- **Interactive Mode** — Guided prompts for common project setup workflows.
- **Remote Templates** — Fetch templates from online sources such as GitHub raw URLs.
- **Independent Git Projects** — Generated projects are initialized with their own Git repositories.
- **Git Worktree Support** — Create isolated environments for AI agents or parallel development.
- **Custom Agent Branches** — Assign unique Git branches to worktrees.
- **Dependency Installation** — Automatically install project dependencies after generation.
- **Smart Ignoring** — Skip temporary files, dependencies, and build directories when creating templates.
- **Worktree Cleanup** — Safely remove completed agent environments and clean Git references.
- **Update Notifications** — Receive information about new SkelPro releases.

---

## Installation

Install SkelPro globally using npm:

```bash
npm install -g skelpro
```

> **Prerequisite:** Node.js version 18 or higher is required.

---

## Basic Usage

Start the interactive interface:

```bash
skelpro launch
```

SkelPro displays available actions and guides users through common workflows.

---

## Available Commands

| Command | Description |
|---------|-------------|
| `skelpro launch` | Start the interactive CLI interface |
| `skelpro save <name> <path>` | Save an existing project as a reusable JSON template |
| `skelpro create <project> <template>` | Generate a project from a template |
| `skelpro info <template>` | Show a template's name, description, variables and files |
| `skelpro init-agents [path]` | Add `AGENTS.md`, pointer files and `.skelpro.json` to an existing project |
| `skelpro check [path]` | Check a project's structure against its layout and rules |
| `skelpro mcp` | Start the MCP server for coding agents |
| `skelpro agents spawn\|list\|cleanup` | Isolated Git worktrees for coding agents, one per task |
| `skelpro cleanup <repoPath> <worktreePath>` | Remove a worktree made by `create --worktree` (deprecated) |
| `skelpro --help` | Display available commands |

---

## Common Options

### `create`

| Option | Description |
|--------|-------------|
| `--var <name=value>` | Set a template variable (repeatable) |
| `--vars <file>` | Read template variables from a JSON file |
| `-y, --yes` | Use defaults and never prompt; missing variables are an error |
| `-i, --install` | Install dependencies after scaffolding |
| `-w, --worktree` | Create as a new repository with a worktree (deprecated; use `skelpro agents spawn`) |
| `-b, --branch <name>` | Specify the Git branch name for a worktree |

### `save`

| Option | Description |
|--------|-------------|
| `--var <name=value>` | Replace this value with `{{name}}`, making a v2 template (repeatable) |
| `--description <text>` | Description for a v2 template |
| `--include <glob>` | Always keep matching paths, even if ignored (repeatable) |
| `--exclude <glob>` | Also skip matching paths (repeatable) |

### `info`

| Option | Description |
|--------|-------------|
| `--json` | Print machine-readable JSON |

### `init-agents`

| Option | Description |
|--------|-------------|
| `--pointer <file>` | Pointer file linking to `AGENTS.md` (repeatable; default `CLAUDE.md`) |
| `--no-pointers` | Don't add any pointer files |
| `--dry-run` | Show what would change without writing anything |
| `-f, --force` | Regenerate an existing `.skelpro.json` |

### `check`

| Option | Description |
|--------|-------------|
| `--template <path>` | Check against a template instead of `.skelpro.json` |
| `--var <name=value>` | Template variable, with `--template` (repeatable) |
| `--json` | Print the report as JSON |
| `--format <format>` | `text` (default), `json` or `github` (pull request annotations) |
| `--strict` | Fail on warnings too, not just errors |
| `--fix` | Create missing required folders (never moves, renames or deletes) |
| `--staged` | Only report problems in staged files (for pre-commit hooks) |
| `--changed` | Only report problems in staged, unstaged and untracked files |

### `cleanup`

| Option | Description |
|--------|-------------|
| `-b, --branch <name>` | Also delete this branch |
| `-f, --force` | Discard uncommitted changes and delete the branch even if unmerged |

### `agents spawn`

| Option | Description |
|--------|-------------|
| `--from <ref>` | Branch, tag or commit to start from (default: the current branch) |
| `--count <n>` | Create n numbered worktrees for parallel attempts |
| `--prefix <prefix>` | Name prefix for `--count` (default `try`) |
| `--scaffold <template>` | Add a feature skeleton from a named template |
| `--var <name=value>` | Template variable for `--scaffold` (repeatable) |
| `-i, --install` | Install dependencies in each worktree |

### `agents cleanup`

| Option | Description |
|--------|-------------|
| `--merged` | Remove every agent worktree whose branch has nothing unmerged |
| `-f, --force` | Discard uncommitted changes and delete unmerged branches |

### `mcp`

| Option | Description |
|--------|-------------|
| `--root <folder>` | Another folder the server may create projects in (repeatable) |
| `--print-config` | Print the JSON most MCP clients need, then exit |

### Global

| Option | Description |
|--------|-------------|
| `-q, --quiet` | Don't print news or update notices |
| `-v, --version` | Show the installed SkelPro version |

---

## Working With Templates

### Create a Template

Convert an existing project into a reusable template:

```bash
skelpro save my-template ./my-project
```

This creates a JSON template containing the project's structure. Files listed in the project's `.gitignore`, plus things that are never source (`node_modules`, `.git`, `.env` files, keys and top-level build folders), are skipped, and SkelPro prints what it skipped.

### Create a Project

#### From a Local Template

```bash
skelpro create my-new-app ./my-template.json
```

#### From a Remote Template

```bash
skelpro create my-new-app https://raw.githubusercontent.com/user/repository/main/template.json
```

With `--worktree`, SkelPro also initializes the generated project as an independent Git repository (see [Git Worktrees for AI Agents](#git-worktrees-for-ai-agents)).

### Template Variables

Templates in format v2 declare variables and use `{{placeholders}}` in file contents and file names, so one template can produce differently named projects:

```bash
skelpro info ./node-api.json                                   # see which variables it takes
skelpro create my-api ./node-api.json --var port=8080          # missing values are prompted for
skelpro create my-api ./node-api.json --vars answers.json --yes # no prompts (agents, CI)
```

Turn an existing project into a v2 template by naming the values to replace:

```bash
skelpro save node-api ./my-api --var projectName=my-api --var port=3000
```

`my-api` (and variants such as `MyApi`) becomes `{{projectName}}` everywhere, and SkelPro prints every replacement so you can check it.

Templates without variables keep working exactly as before. See the [template reference](docs/templates.md) for the full format: variable types, case helpers, optional files with `$when`, escaping, and the JSON Schema for editor autocomplete.

### Agent-Ready Templates

A v2 template can describe what each folder is for (`layout`), structure rules (`rules`) and instructions for coding agents (`agents`). Every project created from it then starts with:

- **`AGENTS.md`**: the template's instructions plus a generated "Project layout" section that coding agents read.
- **Pointer files** such as `CLAUDE.md`: one line linking to `AGENTS.md`, for tools that read their own file.
- **`.skelpro.json`**: a manifest of the template, the variable values used, and the layout and rules.

See [Agent-ready templates](docs/templates.md#agent-ready-templates) for the format.

For a project that wasn't made with SkelPro, run `skelpro init-agents` in its folder. It adds the same three files, with a starting layout guessed from the folders that exist and a TODO for each one to fill in. It never overwrites an existing `AGENTS.md` or pointer file; use `--dry-run` to preview. See [Existing projects](docs/templates.md#existing-projects-skelpro-init-agents).

### Checking Structure

`skelpro check` compares a project with the layout and rules in its `.skelpro.json` and reports drift: missing required folders, forbidden files, naming problems, missing companion files such as tests, and folders that aren't in the layout.

```bash
skelpro check                  # exit code 0 = clean, 1 = errors, 2 = SkelPro couldn't run
skelpro check --format github  # annotations on pull requests
skelpro check --json           # for agents and tools
skelpro check --fix            # create missing required folders
skelpro check --staged         # in a pre-commit hook
```

Generated `AGENTS.md` files tell coding agents to run it before they finish. See [Checking a project](docs/templates.md#checking-a-project-skelpro-check), including copy-paste setup for [CI](docs/templates.md#in-ci) and [pre-commit hooks](docs/templates.md#as-a-pre-commit-hook).

---

## Use With AI Agents

SkelPro includes an [MCP](https://modelcontextprotocol.io) server, so coding agents can use your team's templates instead of improvising boilerplate. Agents can list templates, see their variables and conventions, create projects (as a dry run first), check a project's structure, and save a project as a new template.

Add it to your agent:

```bash
claude mcp add skelpro -- npx -y skelpro mcp   # Claude Code
npx skelpro mcp --print-config                 # the JSON for Cursor, Claude Desktop and others
```

Templates come from `.skelpro/templates/` in the repository, `~/.skelpro/templates/`, and URLs you list in `~/.skelpro/config.json`. The server never fetches a URL an agent supplies, only writes inside the folder it was started in (plus any `--root`), never overwrites files unless asked, and caps template size.

See [Using SkelPro with AI agents](docs/mcp.md) for setup in each client, the tools, and the safety rules.

---

## Git Worktrees for AI Agents

`skelpro agents` gives each coding agent (or each task) its own isolated Git worktree in an existing repository, on its own branch, optionally with a feature skeleton from a template, set up the same way every time.

```bash
# One worktree per task, each on its own branch from main
skelpro agents spawn invoices-api auth-refactor --from main

# Three numbered worktrees for parallel attempts at the same task
skelpro agents spawn --count 3 --prefix try --from main

# A worktree plus a feature skeleton from a template
skelpro agents spawn invoices-api --scaffold feature-module --var featureName=invoices

skelpro agents list                      # name, branch, base, commits ahead, uncommitted changes
skelpro agents cleanup invoices-api      # remove the worktree and its branch
skelpro agents cleanup --merged          # remove every agent worktree with nothing unmerged
```

Example `list` output:

```
NAME           BRANCH               BASE  AHEAD  CHANGES  PATH
auth-refactor  agent/auth-refactor  main  1      3 files  ../myrepo.agents/auth-refactor
invoices-api   agent/invoices-api   main  4      clean    ../myrepo.agents/invoices-api
```

How it works:

- **Location:** worktrees go in a sibling folder, `../<repo>.agents/<name>`, so they never show up inside the repository or its search results.
- **Branches:** `agent/<name>`, validated with `git check-ref-format`.
- **Per-worktree setup:** `--install` installs dependencies. `--scaffold <template>` adds files from a named template (from `.skelpro/templates/`, `~/.skelpro/templates/` or your configured remote templates).
- **Untracked files:** worktrees start without untracked files such as `.env.local`. List the ones agents need in `.skelpro/config.json` (shared with the team) or `~/.skelpro/config.json`, and they're copied into each new worktree. `dir` changes where worktrees go:

```json
{ "agents": { "copy": [".env.local"], "dir": "../my-agents" } }
```

- **Tracking:** spawned worktrees are recorded in `.git/skelpro-agents.json` (inside `.git`, so never committed). `list` and `cleanup` only touch worktrees SkelPro created.

Safety:

- `cleanup` refuses a worktree with uncommitted changes, and refuses to delete a branch with commits that aren't in its base. Both need `--force`, and the message says exactly what would be lost. It exits with code 1 when it keeps anything.
- It never deletes a folder that Git doesn't list as one of its worktrees.
- Every Git command runs with argument arrays, never through a shell.

### Worktrees for new projects (deprecated)

`skelpro create <project> <template> --worktree --branch <name>` creates a new project as its own repository with a worktree beside it, and `skelpro cleanup <repoPath> <worktreePath> --branch <name>` removes it. It still works in v1.9, with a deprecation notice, and will be removed in v2.0: use `skelpro agents spawn` instead.

---

## Remote Template Requirements

Remote templates must:

- Return valid JSON.
- Follow the SkelPro template structure format.
- Be accessible through a direct URL.

Recommended format:

```
https://raw.githubusercontent.com/user/repository/main/template.json
```

---

## Update Notifications

SkelPro can notify users about new releases and important updates.

Update checks are cached to reduce unnecessary network requests and improve CLI performance.

---

## Contributing

Contributions, improvements, and bug reports are welcome.

1. Read [CONTRIBUTING.md](CONTRIBUTING.md).
2. Open an issue or submit a pull request.
3. Suggest new features and improvements.

Future versions may introduce additional AI-powered development workflows.

---

## License

SkelPro is licensed under the Apache License 2.0.

See the [LICENSE](LICENSE) file for details.
