# Contributing to SkelPro

Thank you for your interest in contributing to **SkelPro**! 🎉  

SkelPro is an open-source **template scaffolding tool**, and we appreciate all kinds contributions - bug fixing, adding features, improving documentation, or suggesting ideas.  

---

## Ways to Contribute

### Report Issues

If you encounter a bug, unexpected behavior, or have a feature request, please open an [issue](https://github.com/SkelPro/skelpro/issues) and include:  

- **A clear title and description** of the problem.  
- **Steps to reproduce** (if applicable).  
- **Error messages or logs** (if available).  

### Submit Code Contributions

Want to improve SkelPro? Follow the steps below to submit a **pull request (PR)**.  

### Improve Documentation

If you spot a typo, outdated or missing information in the docs, feel free to update the **README.md** or this file!  

---

## Setting Up the Development Environment

### Prerequisites

Before contributing, ensure you have:  

- **Node.js** (LTS recommended)  
- **Git** installed on your machine  

--- 

## Installation & Contribution Workflow

#### 1. Fork the Repository

Click the **Fork** button on the repository page.  

#### 2. Clone Your Fork

```sh
git clone https://github.com/your-username/skelpro.git
cd skelpro
```

#### 3. Create a New Branch

```sh
git checkout -b your-branch-name
```

#### 4. Install Dependencies

```sh
npm ci
```

Use Node.js 18 or newer.

#### 5. Make Your Changes

Modify the code, add features, or fix bugs. Add or update tests in `test/` for anything you change.

#### 6. Build, Test and Try It

```sh
npm run typecheck   # type-check the source and the tests
npm test            # run the test suite (Vitest)
npm run build       # compile to dist/
```

To try the CLI without building, run it from source:

```sh
npx ts-node cli.ts --help
npx ts-node cli.ts create my-app ./template.json
```

To use your local build as the global `skelpro` command:

```sh
npm run build
npm link
skelpro --help
```

Run `npm unlink -g skelpro` when you're done.

#### 7. Commit Your Changes

Write meaningful commit messages, follow this [format](#commit-message-format):  

```sh
git add .
git commit -m "feat: Add support for XYZ"
```

#### 8. Push to Your Fork

```sh
git push origin feature-name
```

#### 9. Open a Pull Request (PR)

- Go to the **Pull Requests** tab in the main repository.  
- Click **New Pull Request**.  
- Select your branch and provide a **clear description** of your changes.  

---

## Code Guidelines

#### Code Style

- Follow **Prettier** and **ESLint** rules.  
- Use **descriptive variable and function names**.  
- Keep code **modular and reusable**.  

#### File Structure

- Organize files logically within the project.  
- Follow existing **folder conventions**.  

#### Commit Message Format

SkelPro uses [Conventional Commits](https://www.conventionalcommits.org/). Releases are automated with semantic-release, which reads commit messages to choose the next version, so CI rejects pull requests whose commits don't follow the format:

```sh
feat: add support for XYZ          # new feature  → minor release
fix(save): keep nested bin folders # bug fix      → patch release
docs: update README for clarity    # no release
```

Allowed types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`. Add `!` after the type (`feat!: ...`) for a breaking change.

---

## Continuous Integration and Releases

- Every pull request runs the type-check, build and tests on Linux, macOS and Windows with Node 18, 20 and 22. Path handling and Python venv paths differ on Windows, so please don't ignore a failure on just one OS.
- **Releases come only from CI.** Merging to `main` runs the tests, then semantic-release bumps the version, publishes to npm with provenance, and creates the GitHub release. Never run `npm publish` from your machine: a local publish can ship code that isn't in the repository.

- Ensure your branch is **up to date** with `main`.  
- Fix any issues.  
- Provide a **clear PR description** and link related issues.  

---

## Getting Help

If you need help:  

- Check the **Discussions** tab on GitHub.  
- Open an issue if something is unclear.  

---

#### Thank you for helping improve SkelPro! 💙 Happy coding! 🚀
