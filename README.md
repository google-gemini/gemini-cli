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

As with most Node projects, major development scripts can be found in the `package.json`. See that for the full list of commands.

### Prerequisites:

The build toolchain requires `npm` and `jq` to be installed. You can use the `scripts/setup-dev.sh` script to install these prerequisites.

To build the entire project, CLI and Sandbox Container Image (if applicable), run the following command from the root directory:

```bash
npm install
npm run build:all
```

This command installs dependencies and builds the entire project, including the CLI and the Sandbox Container Image (if applicable). For a quick build without the sandbox container, you can use `npm run build`.

## Running

To start the Gemini Code CLI, run the following command from the root directory:

```bash
npm start
```

This command starts the Gemini Code CLI.

## Debugging

To debug the CLI application using VS Code:

1.  Start the CLI in debug mode from the root directory:
    ```bash
    npm run debug
    ```
    This command runs `node --inspect-brk dist/gemini.js` within the `packages/cli` directory, pausing execution until a debugger attaches. You can then open `chrome://inspect` in your Chrome browser to connect to the debugger. Alternatively, you can achieve the same effect by running `DEBUG=1 npm run start`.
2.  In VS Code, use the "Attach" launch configuration (found in `.vscode/launch.json`). This configuration is set up to attach to the Node.js process listening on port 9229, which is the default port used by `--inspect-brk`.

Alternatively, you can use the "Launch Program" configuration in VS Code if you prefer to launch the currently open file directly, but the "Attach" method is generally recommended for debugging the main CLI entry point.

## Using Gemini Code source in other directories

To test your local version of `gemini` in other directories on your system, you can use `npm link`. Note, this is not the same as globally installing the released version of Gemini Code via `npm install -g @gemini-code/cli`. Rather, this creates a global symlink to your local project.

From the root of this repository, run:

```bash
npm link packages/cli
```

Then, navigate to any other directory where you want to use your local `gemini` and run:

```bash
gemini
```

To breakpoint inside the sandbox container run:

```bash
DEBUG=1 gemini
```

Note that using `npm link` simulates a production environment. If you are testing sandboxed mode via `npm link`, you must run the full build with `npm run build:all` from the repository root after any code changes to ensure the linked version is up to date.

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

On MacOS, `gemini` uses Seatbelt (`sandbox-exec`) under a `minimal` profile (see `packages/cli/src/utils/sandbox-macos-minimal.sb`) that restricts writes to the project folder but otherwise allows all other operations by default. You can switch to a `strict` profile (see `.../sandbox-macos-strict.sb`) that declines operations by default by setting `SEATBELT_PROFILE=strict` in your environment or `.env` file. You can also switch to a custom profile `SEATBELT_PROFILE=<profile>` if you also create a file `.gemini/sandbox-macos-<profile>.sb` under your project settings directory `.gemini`.

For stronger container-based sandboxing on MacOS or other platforms, you can set `GEMINI_CODE_SANDBOX=true|docker|podman|<command>` in your environment or `.env` file. The specified command (or if `true` then either `docker` or `podman`) must be installed on the host machine. Once enabled, `npm run build:all` will build a minimal container ("sandbox") image and `npm start` will launch inside a fresh instance of that container. The first build can take 20-30s (mostly due to downloading of the base image) but after that both build and start overhead should be minimal. Default builds (`npm run build`) will not rebuild the sandbox.

Container-based sandboxing mounts the project directory (and system temp directory) with read-write access and is started/stopped/removed automatically as you start/stop Gemini Code. Files created within the sandbox should be automatically mapped to your user/group on host machine. You can easily specify additional mounts, ports, or environment variables by setting `SANDBOX_{MOUNTS,PORTS,ENV}` as needed. You can also fully customize the sandbox for your projects by creating the files `.gemini/sandbox.Dockerfile` and/or `.gemini/sandbox.bashrc` under your project settings directory `.gemini`.

### Attaching from VSCode

With container-based sandboxing, you can have VSCode (or forks like Cursor) attach to a running sandbox container using the [Dev Containers](https://marketplace.cursorapi.com/items?itemName=ms-vscode-remote.remote-containers) extension. Simply use `Dev Containers: Attach to Running Container ...` command and select your container named `...-sandbox-#`. Sandbox container name should be displayed in green at the bottom in terminal when running `gemini`. You may need to set the VSCode setting `dev.containers.dockerPath` (e.g. to `podman`) if you are not using Docker, and otherwise you may be prompted by the extension to install Docker if missing from your system.

## Manual Publish

We publish an artifact for each commit to our internal registry. But if you need to manually cut a local build, then run the following commands:

```
npm run clean
npm install
npm run auth
npm run prerelease:dev
npm publish --workspaces
```
