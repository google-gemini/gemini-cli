## TLDR

This pull request resolves a build failure caused by dependency conflicts. The primary issues were type mismatches between `@types/glob` and `minimatch`, and a bundling error with `esbuild` being unable to resolve `fast-uri`.

## Dive Deeper

The build process was failing with TypeScript errors in the `gemini-cli-vscode-ide-companion` workspace. This was traced back to an incompatibility between the version of `@types/glob` required by `@types/vscode` and the version of `@types/minimatch` pulled in by other dependencies.

The following steps were taken to resolve the issue:
1.  An `overrides` section was added to the root `package.json` to force a compatible version of `@types/glob` across all workspaces.
2.  The `esbuild.config.js` file was updated to mark `fast-uri` as an external dependency, fixing a bundling error that appeared after a clean install.
3.  A full clean and reinstall of dependencies (`rm -rf node_modules package-lock.json && npm install`) was performed to ensure the changes took effect.

These changes allow the `npm run build` command to complete successfully.

## Reviewer Test Plan

To verify the fix, please follow these steps:
1.  Pull down this branch.
2.  Ensure a clean state by running `rm -rf node_modules package-lock.json`.
3.  Run `npm install`. The command should complete without errors.
4.  Run `npm run build`. The build should succeed.

## Testing Matrix

|          | 🍏  | 🪟  | 🐧  |
| -------- | --- | --- | --- |
| npm run  | ❓  | ❓  | ✅  |
| npx      | ❓  | ❓  | ❓  |
| Docker   | ❓  | ❓  | ❓  |
| Podman   | ❓  | -   | -   |
| Seatbelt | ❓  | -   | -   |

## Linked issues / bugs

*No linked issues.*
