# Gemini Code

[![Gemini Code CI](https://github.com/google-gemini/gemini-code/actions/workflows/ci.yml/badge.svg)](https://github.com/google-gemini/gemini-code/actions/workflows/ci.yml)

**Disclaimer:** This README.md was created by gemini-code and this project was developed rapidly and currently lacks comprehensive testing, and other quality-of-life features common in mature projects.

This repository contains the Gemini Code CLI tool.

## Setup

1.  **Get a Gemini API Key:** Obtain your API key from Google AI Studio: [https://aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2.  **Set Environment Variable:** Set the `GEMINI_API_KEY` environment variable to your obtained key. You can do this temporarily in your current shell session:
    ```bash
    export GEMINI_API_KEY="YOUR_API_KEY"
    ```
    Or add it to your shell's configuration file (like `~/.bashrc`, `~/.zshrc`, or `~/.profile`) for persistence:
    ```bash
    echo 'export GEMINI_API_KEY="YOUR_API_KEY"' >> ~/.bashrc # Or your preferred shell config file
    source ~/.bashrc # Reload the config
    ```
    Replace `"YOUR_API_KEY"` with your actual key.

## Building

To build the entire project, including the CLI package, run the following command from the root directory:

```bash
npm install
npm run build
```

This command installs dependencies and then runs the build script defined in the root `package.json`, which in turn executes the build scripts in all workspaces (including `packages/cli`).

## Running

To start the Gemini Code CLI, run the following command from the root directory:

```bash
npm start
```

This command executes the `start` script defined in the root `package.json`, which specifically targets and runs the `start` script within the `gemini-code-cli` workspace.

## Debugging

To debug the CLI application using VS Code:

1.  Start the CLI in debug mode from the root directory:
    ```bash
    npm run debug
    ```
    This command runs `node --inspect-brk dist/gemini.js` within the `packages/cli` directory, pausing execution until a debugger attaches.
2.  In VS Code, use the "Attach" launch configuration (found in `.vscode/launch.json`). This configuration is set up to attach to the Node.js process listening on port 9229, which is the default port used by `--inspect-brk`.

Alternatively, you can use the "Launch Program" configuration in VS Code if you prefer to launch the currently open file directly, but the "Attach" method is generally recommended for debugging the main CLI entry point.

## Formatting

To format the code in this project, run the following command from the root directory:

```bash
npm run format
```

This command uses Prettier to format the code according to the project's style guidelines.

## Linting

To lint the code in this project, run the following command fro the root directory:

```bash
npm run lint
```

Chances are you will need to manually address errors output. You can also try `npm run lint -- --fix` where some errors may be resolved.

## Sandboxing

To enable sandboxing, set `GEMINI_CODE_SANDBOX=true|docker|podman|<command>` in your environment or `.env` file. Once enabled, `npm run build` will build a minimal container ("sandbox") image and `npm start` will launch inside a fresh instance of that container. Requires the specified command (or if `true` then either `docker` or `podman`) to be available on host machine.

The sandbox (container) mounts the current directory with read-write access and is started/stopped/removed automatically as you start/stop Gemini Code. You can tell you are inside the sandbox with the `cwd` being reported as `/sandbox/<project>`. Files created within the sandbox should be automatically mapped to your user/group on host machine.

The very first build of the container (with `npm run build` or `scripts/build_sandbox.sh`) can take 20-30s (mostly due to downloading of the base image) but after that both build and start overhead should be minimal (1-2s).

You can customize the sandbox in `Dockerfile` (e.g. for pre-installed utilities) or in `scripts/build_sandbox.sh` (e.g. for mounts `-v ...`, ports `-p ...`, or environment variables `-e ...`) and any changes should be automatically picked up by `npm run build` and `npm start` respectively.

## Manual Publish

We publish an artifact for each commit to our internal registry. But if you need to manually cut a local build, then run the following commands:

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```

### Attaching from VSCode

You can have VSCode (or forks) attach to a running sandbox using the [Dev Containers](https://marketplace.cursorapi.com/items?itemName=ms-vscode-remote.remote-containers) extension. Simply use `Dev Containers: Attach to Running Container ...` command and select your container named `gemini-code-sandbox-#`. Once attached you can open the project folder at `/sandbox/<project>`. You may need to set the VSCode setting `dev.containers.dockerPath` (e.g. to `podman`) if you are not using Docker, and otherwise you may be prompted by the extension to install Docker if missing from your system.
