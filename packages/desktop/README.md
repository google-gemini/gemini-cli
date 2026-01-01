# Gemini Desktop App

This is the desktop interface for the Gemini CLI, built with Electron, React,
and Vite.

## Prerequisites

- Node.js (v20 or higher recommended)
- npm

## Setup

This package is part of a monorepo. To install dependencies for the entire
project, run the following command from the **root** of the repository:

```bash
npm install
```

This will link the local `@google/gemini-cli-core` package and install all
necessary dependencies for Electron and React.

## Running the App

To start the application in development mode (with Hot Module Replacement):

1. Navigate to the desktop package directory:

   ```bash
   cd packages/desktop
   ```

2. Run the dev script:
   ```bash
   npm run dev
   ```

This will launch the Electron window.

## Building for Production

To create a production build of the desktop application:

```bash
npm run build
```

The output will be generated in the `dist` (renderer) and `dist-electron` (main
process) directories.

## Troubleshooting

- **Module Not Found Errors**: If you encounter errors about missing modules
  (e.g., `electron`), ensure you have run `npm install` in the root directory.
- **WASM Errors**: The build is configured to externalize specific WASM
  dependencies. If you notice issues with `web-tree-sitter`, verify the
  `vite.config.ts` externalization settings.

## Developing with Core

The desktop app depends on `@google/gemini-cli-core`. Since this is a workspace
dependency, changes in the `core` package are **not** automatically reflected in
the running desktop app until the core package is rebuilt.

### Workflow for Core Changes

1. Make changes in `packages/core`.
2. Rebuild the core package:
   ```bash
   npm run build --workspace @google/gemini-cli-core
   ```
3. Restart the desktop app (or reload the window if the change is only in code
   used by the renderer, though most core logic is in the main process).
