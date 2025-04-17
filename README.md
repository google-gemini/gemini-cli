# Gemini Code

**Disclaimer:** This README.md was created by gemini-code and this project was developed rapidly and currently lacks comprehensive testing, CI/CD pipelines, and other quality-of-life features common in mature projects.

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
    npm run debug --workspace=gemini-code-cli
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
