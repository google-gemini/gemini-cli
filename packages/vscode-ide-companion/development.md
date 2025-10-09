# Local Development ⚙️

## Running the Extension

To run the extension locally for development, we recommend using the automatic watch process for continuous compilation:

1.  **Install Dependencies** (from the root of the repository):
    ```bash
    npm install
    ```
2.  **Open in VS Code:** Open this directory (`packages/vscode-ide-companion`) in your VS Code editor.
3.  **Start Watch Mode:** Run the watch script to compile the extension and monitor changes in both **esbuild** and **TypeScript**:
    ```bash
    npm run watch
    ```
4.  **Launch Host:** Press **`F5`** (or **`fn+F5`** on Mac) to open a new **Extension Development Host** window with the extension running.

### Manual Build

If you only need to compile the extension once without watching for changes:

```bash
npm run build
```
