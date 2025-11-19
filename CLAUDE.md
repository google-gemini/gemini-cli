# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

Gemini CLI is an open-source AI agent that brings the power of Gemini directly
into the terminal. It's built with TypeScript, Node.js, and React (via Ink for
terminal UI).

## Essential Commands

### Development Setup

```bash
npm install                    # Install all dependencies
npm run build                  # Build all packages
npm run build:all              # Build project + sandbox container + vscode extension
npm start                      # Start Gemini CLI from source
```

### Testing

```bash
npm run test                   # Run unit tests (packages/core and packages/cli)
npm run test:e2e               # Run integration tests without sandbox
npm run test:integration:all   # Run all integration tests (none, docker, podman)
npm run preflight              # Run full validation (clean, install, format, lint, build, typecheck, test)
```

### Code Quality

```bash
npm run lint                   # Lint TypeScript files
npm run lint:fix               # Auto-fix linting issues and format
npm run format                 # Format code with Prettier
npm run typecheck              # Type check all packages
```

### Debugging

```bash
npm run debug                  # Start CLI with Node inspector
DEV=true npm start             # Enable React DevTools connection
DEBUG=1 gemini                 # Debug inside sandbox container
GEMINI_DEV_TRACING=true gemini # Enable OpenTelemetry dev traces
```

### Sandboxing

```bash
GEMINI_SANDBOX=true npm run build:all   # Build with sandbox container
GEMINI_SANDBOX=docker npm start         # Run with Docker sandbox
GEMINI_SANDBOX=podman npm start         # Run with Podman sandbox
```

## Architecture

### Package Structure

This is a monorepo with workspaces in `packages/`:

- **`cli/`**: Frontend - Terminal UI built with React/Ink. Handles user input,
  output rendering, history, themes, and CLI configuration.

- **`core/`**: Backend - Core logic for Gemini API interaction, tool
  orchestration, state management, and server-side configuration. Contains tool
  implementations in `src/tools/`.

- **`a2a-server/`**: A2A (Agent-to-Agent) server implementation (experimental).

- **`test-utils/`**: Shared testing utilities for temporary file system
  operations.

- **`vscode-ide-companion/`**: VS Code extension that pairs with Gemini CLI.

### Interaction Flow

1. User input → CLI package captures command
2. CLI sends request → Core package
3. Core constructs prompt → Sends to Gemini API
4. Gemini responds (text or tool request)
5. If tool requested → Core executes (with user approval for write operations) →
   Result sent back to API
6. Final response → Core → CLI → User display

### Key Design Principles

- **Modularity**: CLI (frontend) separated from Core (backend)
- **Extensibility**: Tool system designed for adding new capabilities
- **User Experience**: Rich interactive terminal experience via React/Ink
- **Security**: Sandboxing support (macOS Seatbelt, Docker, Podman)

## Code Conventions

### TypeScript Style

- **Prefer plain objects + interfaces over classes**: Better for React
  integration, immutability, and serialization
- **Use ES module encapsulation**: Export public API, keep internals private to
  module
- **Avoid `any`**: Use `unknown` when type is uncertain, then narrow with type
  guards
- **Minimize type assertions (`as Type`)**: Code smell if needed for testing
  private internals - refactor instead
- **Type narrowing in switches**: Use `checkExhaustive` helper (in
  `packages/cli/src/utils/checks.ts`) in default clause
- **Embrace array operators**: Use `.map()`, `.filter()`, `.reduce()`,
  `.slice()`, `.sort()` for immutability

### React/Ink Conventions

The CLI UI is built with React (via Ink). Follow these guidelines:

- **Functional components only**: No class components. Use Hooks (`useState`,
  `useEffect`, `useContext`)
- **Pure render functions**: No side effects in component body. Use `useEffect`
  for side effects, but avoid `useEffect` when possible
- **NEVER `setState` inside `useEffect`**: Degrades performance. Use event
  handlers or derive state
- **Respect Rules of Hooks**: Call hooks unconditionally at top level only
- **Minimal `useRef` usage**: Only for DOM interactions, not reactive state
- **Composition over monoliths**: Small, reusable components and custom hooks
- **Functional state updates**: Use `setCount(c => c + 1)` for updates based on
  previous state
- **Include effect cleanup functions**: Return cleanup from `useEffect`
- **Leverage React Compiler**: Skip manual `useMemo`, `useCallback`,
  `React.memo` - let compiler optimize
- **Optimize data fetching**: Parallel requests, Suspense for loading, co-locate
  data needs

### Testing with Vitest

- **Framework**: Use Vitest (`describe`, `it`, `expect`, `vi`)
- **File location**: Co-locate tests (`*.test.ts`, `*.test.tsx`) with source
  files
- **Mock ES modules**: `vi.mock('module', async (importOriginal) => { ... })`
- **Mock placement**: Critical mocks (e.g., `os`, `fs`) at top of file before
  imports
- **Hoisting**: Use `vi.hoisted(() => vi.fn())` for functions needed in mock
  factory
- **Setup/teardown**: `beforeEach` with `vi.resetAllMocks()`, `afterEach` with
  `vi.restoreAllMocks()`
- **Async testing**: Use `async/await`, `vi.useFakeTimers()`,
  `vi.advanceTimersByTimeAsync()`
- **React testing**: Use `render()` from `ink-testing-library`, assert with
  `lastFrame()`

### Import Restrictions

- ESLint enforces import restrictions between packages
- Pay attention to import paths - use relative imports within package, package
  imports across packages

### Comments

- Only write high-value comments
- Avoid talking to users through comments

### Flag Naming

- Use hyphens, not underscores: `--my-flag` not `--my_flag`

## Development Workflow

### Node.js Version

- **Development**: Use Node.js `~20.19.0` (specific version required for dev
  dependencies - use nvm)
- **Production**: Any Node.js `>=20.0.0`

### Running from Source

```bash
npm start                                           # From root
alias gemini="node path/to/gemini-cli/packages/cli" # Create alias
npm link path/to/gemini-cli/packages/cli            # Use npm link
```

### React DevTools Setup

1. `DEV=true npm start`
2. Install: `npm install -g react-devtools@4.28.5` or run:
   `npx react-devtools@4.28.5`
3. DevTools connects to CLI automatically

### Git Hooks

Husky is configured for pre-commit hooks. Optionally create custom pre-commit:

```bash
echo "if ! npm run preflight; then exit 1; fi" > .git/hooks/pre-commit && chmod +x .git/hooks/pre-commit
```

### Integration Testing

- Located in `integration-tests/`
- Run with various sandbox configs: `npm run test:integration:all`
- Detailed docs: `/docs/integration-tests.md`

### Documentation

- Located in `docs/` with `sidebar.json` as TOC
- Follow
  [Google Developer Documentation Style Guide](https://developers.google.com/style)
- Lint with `npm run preflight`
- Update docs when adding user-facing changes

## Key Technical Details

### Sandboxing Options

1. **macOS Seatbelt**: Default on macOS. Profiles:
   `{permissive,restrictive}-{open,closed,proxied}`. Configure via
   `SEATBELT_PROFILE`.
2. **Container-based**: Set `GEMINI_SANDBOX=true|docker|podman`. Custom sandbox:
   Create `.gemini/sandbox.Dockerfile` and `.gemini/sandbox.bashrc`, run with
   `BUILD_SANDBOX=1`.
3. **Proxied networking**: Set `GEMINI_SANDBOX_PROXY_COMMAND` to restrict
   outbound traffic.

### Environment Variables

- `GEMINI_SANDBOX`: Enable/configure sandboxing
- `GEMINI_DEV_TRACING`: Enable OpenTelemetry traces
- `DEV`: Enable React DevTools connection
- `DEBUG`: Debug mode (affects sandbox)
- `GOOGLE_CLOUD_PROJECT`: For Code Assist license users
- `GEMINI_API_KEY` or `GOOGLE_API_KEY`: API authentication

### Release Cadence

- **Nightly**: Daily at UTC 0000 from main branch (`@nightly`)
- **Preview**: Weekly Tuesdays at UTC 2359 (`@preview`)
- **Stable**: Weekly Tuesdays at UTC 2000 (`@latest`)

### Important Files

- `esbuild.config.js`: Bundling configuration
- `Makefile`: Common build/test commands
- `tsconfig.json`: Strict TypeScript configuration
- `.github/pull_request_template.md`: PR template with validation checklist
- `GEMINI.md`: Additional development guidelines (React, testing, TypeScript)

## Before Submitting Changes

1. **Run preflight**: `npm run preflight` (builds, tests, lints, type checks)
2. **Link to existing issue**: All PRs must reference an issue
3. **Update documentation**: If user-facing changes exist
4. **Follow PR template**: Use checklist in `.github/pull_request_template.md`
5. **Keep PRs focused**: One issue/feature per PR
6. **Use Conventional Commits**: e.g., `feat(cli): Add --json flag`
7. **Sign CLA**: Required for all contributions

## Common Gotchas

- Don't use `GEMINI_SANDBOX=false` in `.env` files within gemini-cli repo
  (auto-excluded)
- Use `.gemini/.env` for gemini-cli specific settings
- Never use `git` flags requiring interactive input (`-i`)
- Integration tests require `GEMINI_API_KEY` secret in forked repos
- First sandbox build takes 20-30s (base image download), then fast
- since you are doing a lot of work on behalf of me, I would like to know what
  exactly did you do and why so that when others ask me I am in a position to
  answer them. So I want you to maintain a markdown file (at the exact file path
  /Users/r.amogh/Desktop/geminiContribution.md). whenever you sucessfully
  complete a PR, update the file which should tell me what ws done, why , and
  how did you approach the problem in detail (make sure to exaplin the features
  or other things that might be specific to the repo or project since I am a
  beginner). when you update a PR , maybe because some CI checks failed or some
  maintainer asked you to change something, update the file also to now include
  what was wrong and how you fixed it. The goal is that you work on behalf of me
  but also I have the insights and the experience of woking without actually
  working.
