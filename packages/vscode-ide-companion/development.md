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
