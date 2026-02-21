# Technology Stack

## Core

- **Language:** TypeScript
- **Runtime:** Node.js (>=20.0.0)
- **Architecture:** Monorepo (npm workspaces)

## Frontend (CLI)

- **Framework:** React (Ink)
- **State Management:** React Hooks, Context API
- **Bundler:** esbuild
- **Dependencies:** `ink`, `react`, `react-dom`

## Backend (Core Logic)

- **Package:** `@google/gemini-cli-core`
- **Dependencies:** Standard Node.js libraries and Google Cloud SDKs (inferred)

## Testing & Quality

- **Test Runner:** Vitest
- **E2E Testing:** Custom integration tests (`test:integration`)
- **Linting:** ESLint
- **Formatting:** Prettier

## Build & DevOps

- **CI:** GitHub Actions
- **Containerization:** Docker
