# Gemini CLI VS Code Companion (`gemini-cli-vscode-ide-companion`)

VS Code extension that pairs with Gemini CLI, providing direct IDE workspace
access to the CLI agent.

## Architecture

- `src/extension.ts`: Extension activation and lifecycle.
- `src/ide-server.ts`: Local server exposing IDE capabilities to the CLI.
- `src/diff-manager.ts`: Diff viewing and application.
- `src/open-files-manager.ts`: Tracks and exposes open editor files.
- `src/utils/`: Shared utility functions.

## Development

- Requires VS Code `^1.99.0`.
- Build: `npm run build` (uses esbuild).
- Launch via VS Code's "Run Extension" debug configuration.

## Testing

- Run tests: `npm test -w gemini-cli-vscode-ide-companion`
- Tests use standard Vitest patterns alongside VS Code test APIs.
