# Gemini CLI Companion

The Gemini CLI Companion extension pairs with [Gemini CLI](https://github.com/google-gemini/gemini-cli). This is compatible with VS Code and forks of VS Code, and is available in both the VS Code Extensions Marketplace and in the [Open VSX Registry](https://open-vsx.org/extension/Google/gemini-cli-vscode-ide-companion).

# Local Development

## Running the Extension

To run the extension locally for development:

1.  Install the dependencies:
    ```bash
    npm install
    ```
2.  Compile the extension:
    ```bash
    npm run compile
    ```
3.  Open this directory (`packages/vscode-ide-companion`) in VS Code.
4.  Press `F5` (fn+f5 on mac) to open a new Extension Development Host window with the extension running.

To watch for changes and have the extension rebuild automatically, run:

```bash
npm run watch
```

## Running Tests

To run the automated tests, run:

```bash
npm run test
```
