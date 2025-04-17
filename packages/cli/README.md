# Gemini Code CLI

This package contains the core command-line interface for Gemini Code.

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

To build only the CLI package, navigate to this directory (`packages/cli`) and run:

```bash
npm run build
```

This command executes the TypeScript compiler (`tsc`) as defined in this package's `package.json`. Ensure dependencies have been installed from the root directory (`npm install`) first.

## Running

To start the Gemini Code CLI directly from this directory:

```bash
npm start
```

This command executes `node dist/gemini.js` as defined in this package's `package.json`.

## Debugging

To debug the CLI application using VS Code:

1.  Start the CLI in debug mode from this directory (`packages/cli`):
    ```bash
    npm run debug
    ```
    This command runs `node --inspect-brk dist/gemini.js`, pausing execution until a debugger attaches.
2.  In VS Code (opened at the root of the monorepo), use the "Attach" launch configuration (found in `.vscode/launch.json`). This configuration is set up to attach to the Node.js process listening on port 9229, which is the default port used by `--inspect-brk`.
