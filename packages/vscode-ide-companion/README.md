# Gemini CLI Companion

The Gemini CLI Companion extension pairs with [Gemini CLI](https://github.com/google-gemini/gemini-cli). This is compatible with VS Code and forks of VS Code, and is available in both the VS Code Extensions Marketplace and in the [Open VSX Registry](https://open-vsx.org/extension/Google/gemini-cli-vscode-ide-companion).

# Features

- Open Editor File Context: Gemini CLI gains awareness of the files you have open in your editor, providing it with a richer understanding of your project's structure and content.

- Selection Context: Gemini CLI can easily access your cursor's position and selected text within the editor, giving it valuable context directly from your current work.

- Native Diffing: Seamlessly view, modify, and accept code changes suggested by Gemini CLI directly within the editor.

- Launch Gemini CLI: Quickly start a new Gemini CLI session from the Command Palette (Cmd+Shift+P or Ctrl+Shift+P) by running the "Gemini CLI: Run" command.

To use this extension, you'll need:

- VS Code version 1.99.0 or newer
- Gemini CLI (installed separately) running within the integrated terminal

# Terms of Service and Privacy Notice

By installing this extension, you agree to the [Terms of Service](https://github.com/google-gemini/gemini-cli/blob/main/docs/tos-privacy.md).

# Local Development

## Running the Extension

To run the extension locally for development:

1.  From the root of the repository, install dependencies:
    ```bash
    npm install
    ```
2.  Open this directory (`packages/vscode-ide-companion`) in VS Code.
3.  Compile the extension:
    ```bash
    npm run compile
    ```
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
