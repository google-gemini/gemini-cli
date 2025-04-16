# Gemini Code CLI

This package contains the core command-line interface for Gemini Code.

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
