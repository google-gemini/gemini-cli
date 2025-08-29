# Gemini CLI Electron App

This package contains the Electron application for the Gemini CLI, providing a desktop experience for interacting with the Gemini model.

## Overview

The app is built using [Electron](https://www.electronjs.org/), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), and [Vite](https://vitejs.dev/). It uses [xterm.js](https://xtermjs.org/) to render a terminal interface and [node-pty](https://github.com/microsoft/node-pty) to spawn the Gemini CLI as a child process.

## How it Works

The application consists of three main parts: the main process, the renderer process, and a preload script.

1.  **Main Process (`src/main/index.ts`):**
    - This is the entry point of the Electron app. It creates the `BrowserWindow` that will display the UI.
    - It uses `node-pty` to spawn the Gemini CLI as a child process. The command `node ../../packages/cli/dist/index.js --launch-electron` is used to ensure the CLI runs in a mode that's compatible with the Electron app.
    - It listens for data from the Gemini CLI process and forwards it to the renderer process using `mainWindow.webContents.send('terminal.incomingData', data)`.
    - It listens for keystrokes from the renderer process and sends them to the Gemini CLI process using `ipcMain.on('terminal.keystroke', ...)`.

2.  **Renderer Process (`src/renderer/App.tsx`):**
    - This is the React application that runs inside the Electron window.
    - It uses `xterm.js` to create a terminal component.
    - It listens for data from the main process using `window.electron.terminal.onData(...)` and writes it to the xterm.js terminal, effectively displaying the output from the Gemini CLI.
    - It captures keystrokes from the user in the terminal and sends them to the main process using `window.electron.terminal.sendKey(...)`.

3.  **Preload Script (`src/preload/index.ts`):**
    - This script acts as a bridge between the renderer process and the main process.
    - It securely exposes the necessary `ipcRenderer` functions to the renderer process using `contextBridge.exposeInMainWorld`. This allows the renderer to communicate with the main process without having direct access to Node.js APIs.

## Project Structure

- `src/main`: Contains the main process code for the Electron app.
- `src/preload`: Contains the preload script.
- `src/renderer`: Contains the React application that is rendered in the Electron window.
- `electron.vite.config.ts`: The configuration file for `electron-vite`, which is used to build and bundle the app.

## Development

To run the app in development mode, use the following command:

```bash
npm run dev --workspace=packages/electron-app
```

This will start a Vite development server for the renderer process and launch the Electron app.

## Building and Packaging

To build the app for production, use the following command:

```bash
npm run build --workspace=packages/electron-app
```

To package the app for distribution (e.g., creating a `.app` or `.exe` file), use the following command:

```bash
npm run package --workspace=packages/electron-app
```

The packaged application will be located in the `packages/electron-app/dist/electron` directory.
