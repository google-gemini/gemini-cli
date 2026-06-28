# Gemini CLI A2A Server (`@google/gemini-cli-a2a-server`)

Experimental Agent-to-Agent (A2A) server that exposes Gemini CLI capabilities
over HTTP for inter-agent communication.

## Architecture

- `src/agent/`: Agent session management for A2A interactions.
- `src/commands/`: CLI command definitions for the A2A server binary.
- `src/config/`: Server configuration.
- `src/http/`: HTTP server and route handlers.
- `src/persistence/`: Session and state persistence.
- `src/utils/`: Shared utility functions.
- `src/types.ts`: Shared type definitions.

## Running

- Binary entry point: `gemini-cli-a2a-server`

## Testing

- Run tests: `npm test -w @google/gemini-cli-a2a-server`
