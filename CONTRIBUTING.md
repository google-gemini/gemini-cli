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

**Prerequisites:**

1. Install [Node 18+](https://nodejs.org/en/download)
2. Git

### Build Process

To clone the repository:

```bash
git clone https://github.com/google-gemini/gemini-cli.git # Or your fork's URL
cd gemini-cli
```

To install dependencies defined in `package.json` as well as root dependencies:

```bash
npm install
```

To build the entire project (all packages):

```bash
npm run build
```

This command typically compiles TypeScript to JavaScript, bundles assets, and prepares the packages for execution. Refer to `scripts/build.sh` and `package.json` scripts for more details on what happens during the build.

### Enabling Sandboxing

Container-based [sandboxing](#sandboxing) is highly recommended and requires, at a minimum, setting `GEMINI_SANDBOX=true` in your `~/.env` and ensuring a container engine (e.g. `docker` or `podman`) is available. See [Sandboxing](#sandboxing) for details.

To build both the `gemini` CLI utility and the sandbox container, run `build:all` from the root directory:

```bash
npm run build:all
```

To skip building the sandbox container, you can use `npm run build` instead.

### Running

To start the Gemini CLI from the source code (after building), run the following command from the root directory:

```bash
npm start
```

If you’d like to run the source build outside of the gemini-cli folder you can utilize `npm link path/to/gemini-cli/packages/cli` (see: [docs](https://docs.npmjs.com/cli/v9/commands/npm-link)) or `alias gemini="node path/to/gemini-cli/packages/cli"` to run with `gemini`

### Running Tests

To execute the test suite for the project:

```bash
npm run test
```

This will run tests located in the `packages/core` and `packages/cli` directories. Ensure tests pass before submitting any changes.

#### Important Note for Sandbox Users on macOS/Windows

This project uses native dependencies (e.g., `tree-sitter`) that are compiled for a specific operating system.

When you run the application in the development sandbox via `npm start`, these dependencies are automatically rebuilt for the container's Linux environment.

Because of this, if you then try to run `npm run test` directly on your host machine (e.g., macOS), the tests will fail with an error similar to `dlopen` or `not a valid mach-o file`. This is because the test runner on your Mac cannot load the Linux-compiled dependencies from your `node_modules` folder.

#### The Solution:

To fix this, you must rebuild the native dependencies for your host machine's architecture before running the tests.

```bash
npm rebuild
```

#### Recommended Workflow:

1. After using the sandboxed `npm start`, and before you want to run tests locally, run `npm rebuild` in your terminal.
2. Then, run `npm run test` as usual.

You will need to repeat the npm rebuild step any time you switch from running the sandboxed application back to running local tests.

### Linting and Preflight Checks

To ensure code quality, formatting consistency, and run final checks before committing:

```bash
npm run preflight
```

This command usually runs ESLint, Prettier, and potentially other checks as defined in the project's `package.json`.

#### Formatting

To separately format the code in this project by running the following command from the root directory:

```bash
npm run format
```

This command uses Prettier to format the code according to the project's style guidelines.

#### Linting

To separately lint the code in this project, run the following command fro the root directory:

```bash
npm run lint
```

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

## Debugging

### VS Code:

1.  Start the CLI in debug mode from the root directory:
    ```bash
    npm run debug
    ```
    This command runs `node --inspect-brk dist/gemini.js` within the `packages/cli` directory, pausing execution until a debugger attaches. You can then open `chrome://inspect` in your Chrome browser to connect to the debugger.
2.  In VS Code, use the "Attach" launch configuration (found in `.vscode/launch.json`).

Alternatively, you can use the "Launch Program" configuration in VS Code if you prefer to launch the currently open file directly, but the "Attach" method is generally recommended for debugging the main CLI entry point.

To hit a breakpoint inside the sandbox container run:

```bash
DEBUG=1 gemini
```

### React DevTools

To debug the CLI's React-based UI, you can use React DevTools. Ink, the library used for the CLI's interface, is compatible with React DevTools version 4.x.

1.  **Start the Gemini CLI in development mode:**

    ```bash
    DEV=true npm start
    ```

2.  **Install and run React DevTools version 4.28.5 (or the latest compatible 4.x version):**

    You can either install it globally:

    ```bash
    npm install -g react-devtools@4.28.5
    react-devtools
    ```

    Or run it directly using npx:

    ```bash
    npx react-devtools@4.28.5
    ```

    Your running CLI application should then connect to React DevTools.
    ![](/docs/assets/connected_devtools.png)

## Sandboxing

### MacOS Seatbelt

On MacOS, `gemini` uses Seatbelt (`sandbox-exec`) under a `minimal` profile (see `packages/cli/src/utils/sandbox-macos-minimal.sb`) that restricts writes to the project folder but otherwise allows all other operations by default. You can switch to a `strict` profile (see `.../sandbox-macos-strict.sb`) that declines operations by default by setting `SEATBELT_PROFILE=strict` in your environment or `.env` file. You can also switch to a custom profile `SEATBELT_PROFILE=<profile>` if you also create a file `.gemini/sandbox-macos-<profile>.sb` under your project settings directory `.gemini`.

### Container-based Sandboxing (All Platforms)

For stronger container-based sandboxing on MacOS or other platforms, you can set `GEMINI_SANDBOX=true|docker|podman|<command>` in your environment or `.env` file. The specified command (or if `true` then either `docker` or `podman`) must be installed on the host machine. Once enabled, `npm run build:all` will build a minimal container ("sandbox") image and `npm start` will launch inside a fresh instance of that container. The first build can take 20-30s (mostly due to downloading of the base image) but after that both build and start overhead should be minimal. Default builds (`npm run build`) will not rebuild the sandbox.

Container-based sandboxing mounts the project directory (and system temp directory) with read-write access and is started/stopped/removed automatically as you start/stop Gemini CLI. Files created within the sandbox should be automatically mapped to your user/group on host machine. You can easily specify additional mounts, ports, or environment variables by setting `SANDBOX_{MOUNTS,PORTS,ENV}` as needed. You can also fully customize the sandbox for your projects by creating the files `.gemini/sandbox.Dockerfile` and/or `.gemini/sandbox.bashrc` under your project settings directory (`.gemini`) and running `gemini` with `BUILD_SANDBOX=1` to trigger building of your custom sandbox.

## Manual Publish

We publish an artifact for each commit to our internal registry. But if you need to manually cut a local build, then run the following commands:

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```
