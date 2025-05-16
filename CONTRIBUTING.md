# How to Contribute

We would love to accept your patches and contributions to this project.

## Before you begin

### Sign our Contributor License Agreement

Contributions to this project must be accompanied by a
[Contributor License Agreement](https://cla.developers.google.com/about) (CLA).
You (or your employer) retain the copyright to your contribution; this simply
gives us permission to use and redistribute your contributions as part of the
project.

If you or your current employer have already signed the Google CLA (even if it
was for a different project), you probably don't need to do it again.

Visit <https://cla.developers.google.com/> to see your current agreements or to
sign a new one.

### Review our Community Guidelines

This project follows [Google's Open Source Community
Guidelines](https://opensource.google/conduct/).

## Contribution Process

### Code Reviews

All submissions, including submissions by project members, require review. We
use [GitHub pull requests](https://docs.github.com/articles/about-pull-requests)
for this purpose.

## Development Setup and Workflow

This section guides contributors on how to build, modify, and understand the development setup of this project.

### Setting Up the Development Environment

- **Prerequisites:**
  - Node.js (version 18 or higher).
  - npm (usually comes with Node.js).
  - Git.
- **Cloning the Repository:**
  ```bash
  git clone https://github.com/google-gemini/gemini-cli.git # Or your fork's URL
  cd gemini-cli
  ```
- **Installing Dependencies:**
  ```bash
  npm install
  ```
  This command will install all necessary dependencies defined in `package.json` for both the server and CLI packages, as well as root dependencies.

### Build Process

To build the entire project (all packages):

```bash
npm run build
```

This command typically compiles TypeScript to JavaScript, bundles assets, and prepares the packages for execution. Refer to `scripts/build.sh` and `package.json` scripts for more details on what happens during the build.

### Running Tests

To execute the test suite for the project:

```bash
npm run test
```

This will run tests located in the `packages/server` and `packages/cli` directories. Ensure tests pass before submitting any changes.

### Linting and Preflight Checks

To ensure code quality, formatting consistency, and run final checks before committing:

```bash
npm run preflight
```

This command usually runs ESLint, Prettier, and potentially other checks as defined in the project's `package.json`.

### Coding Conventions

- Please adhere to the coding style, patterns, and conventions used throughout the existing codebase.
- Consult [GEMINI.md](https://github.com/google-gemini/gemini-cli/blob/main/GEMINI.md) (typically found in the project root) for specific instructions related to AI-assisted development, including conventions for React, comments, and Git usage.
- **Imports:** Pay special attention to import paths. The project uses `eslint-rules/no-relative-cross-package-imports.js` to enforce restrictions on relative imports between packages.

### Project Structure

- `packages/`: Contains the individual sub-packages of the project.
  - `cli/`: The command-line interface.
  - `server/`: The backend server that the CLI interacts with.
- `docs/`: Contains all project documentation.
- `scripts/`: Utility scripts for building, testing, and development tasks.

For more detailed architecture, see `docs/architecture.md`.

### Development Tip: `gemini-cli` Alias

During the development phase, you can use the following to create an alias for the command-line tool after building it:

```bash
# Example:
# npm run build # (if not already done)
# alias gemini-cli="node $(pwd)/packages/cli/dist/index.js"
# gemini-cli
#
#  ██████╗ ███████╗███╗   ███╗██╗███╗   ██╗██╗
# ██╔════╝ ██╔════╝████╗ ████║██║████╗  ██║██║
# ██║  ███╗█████╗  ██╔████╔██║██║██╔██╗ ██║██║
# ██║   ██║██╔══╝  ██║╚██╔╝██║██║██║╚██╗██║██║
# ╚███████╝███████╗██║ ╚═╝ ██║██║██║ ╚████║██║
#  ╚═════╝ ╚══════╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝
#
# Tips for getting started:
# 1. /help for more information.
# 2. Ask coding questions, edit code or run commands.
# 3. Be specific for the best results.
#
# cwd: /path/to/gemini-cli
# ╭────────────────────────────────────────────────────────────────────────────────────────────────────────────────────╮
# │ > Enter your message or use tools...                                                                               │
# ╰───────────────────────────────────────────────────────────────────────────────────────────���────────────────────────╯
```
