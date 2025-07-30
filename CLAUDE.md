# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project: Gemini CLI

A command-line AI workflow tool that interfaces with Google's Gemini API, supporting multimodal interactions, file operations, and tool integrations.

### Development Commands

```bash
# Essential development workflow
npm run preflight      # ALWAYS run before submitting changes (format, lint, build, test)

# Building and running
npm install           # Install dependencies (uses npm workspaces)
npm run build         # Build main project
npm run build:all     # Build everything including sandbox and VSCode companion
npm start            # Start the Gemini CLI
npm run debug        # Start with Node.js inspector

# Testing
npm run test         # Run unit tests with Vitest
npm run test:e2e     # Run end-to-end integration tests
npm run test:ci      # Run tests in CI mode

# Code quality
npm run lint         # Check ESLint (must have zero warnings)
npm run lint:fix     # Auto-fix linting issues
npm run format       # Format with Prettier
npm run typecheck    # TypeScript type checking
```

### Architecture Overview

**Monorepo Structure**: Uses npm workspaces with packages in `packages/*`:

- `packages/cli/` - User-facing CLI with React (Ink) terminal UI
- `packages/core/` - Backend logic, Gemini API client, and tool implementations
- `packages/vscode-ide-companion/` - VS Code extension

**Tech Stack**:

- Node.js 20+ with ES modules throughout
- TypeScript 5.0+ with strict mode
- React (Ink framework) for terminal UI
- Vitest for testing
- esbuild for bundling

**Key Directories**:

- `packages/cli/src/ui/` - React components for terminal UI
- `packages/cli/src/commands/` - CLI commands (auth, chat, help)
- `packages/core/src/core/` - Gemini API client
- `packages/core/src/tools/` - File system, shell, web fetch tools
- `packages/core/src/mcp/` - Model Context Protocol integration
- `integration-tests/` - End-to-end test suites

### Code Style Requirements

These are STRICT requirements that must be followed:

1. **NO JavaScript classes** - Use plain objects with TypeScript interfaces
2. **NO `any` types** - Always use `unknown` when type is truly unknown
3. **Functional components only** - No class components in React
4. **Immutable data patterns** - Never mutate arrays/objects, create new instances
5. **ES modules** - Use for encapsulation, don't export internals
6. **Zero ESLint warnings** - CI will fail with any warnings
7. **Hyphen-case for flags** - Use `my-flag` not `my_flag`
8. **Comments policy** - Only write high-value comments if at all. Avoid talking to the user through comments

### JavaScript/TypeScript Best Practices

**Prefer Plain Objects over Classes**:

- Classes introduce unnecessary complexity and friction with React's component-based architecture
- Plain objects are inherently immutable (when used thoughtfully) and easily passed as props
- TypeScript interfaces provide powerful static type checking without runtime overhead
- Plain objects encourage immutable approach - create new objects rather than mutating
- Better serialization/deserialization to JSON for API communication

**ES Module Encapsulation**:

- Use `import`/`export` for clear public API definition
- Anything exported is public, anything not exported is private
- Test only public APIs, not internal implementation details
- If you need to test unexported functions, consider extracting them to separate modules
- Reduces coupling between different parts of the codebase

**Type Safety with `unknown`**:

- NEVER use `any` - it opts out of TypeScript's type checking
- Use `unknown` when type cannot be determined at compile time
- Perform type narrowing before operations on `unknown` values:
  ```typescript
  function processValue(value: unknown) {
    if (typeof value === 'string') {
      // value is now safely a string
      console.log(value.toUpperCase());
    }
  }
  ```
- Use type assertions (`as Type`) sparingly and with extreme caution
- Type assertions in tests often indicate code structure issues

**Array Operators and Functional Programming**:

- Use `.map()`, `.filter()`, `.reduce()`, `.slice()`, `.sort()` for data transformations
- These operators promote immutability by returning new arrays
- Chain operators for concise, expressive code
- Avoid traditional for loops and imperative logic
- Create pure functions that take inputs and produce outputs without side effects

### Testing Patterns

This project uses **Vitest** as its primary testing framework. Key conventions include:

**Test Structure and Framework**:

- Framework: All tests use Vitest (`describe`, `it`, `expect`, `vi`)
- File Location: Test files (`*.test.ts` for logic, `*.test.tsx` for React components) are co-located with source files
- Configuration: Test environments defined in `vitest.config.ts` files
- Setup/Teardown: Use `beforeEach` and `afterEach`. Commonly call `vi.resetAllMocks()` in `beforeEach` and `vi.restoreAllMocks()` in `afterEach`

**Vitest Mocking**:

```typescript
// Place mocks at the very top of test files, before other imports
vi.mock('fs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('fs')>()),
  // Mock implementations
}));

// Use vi.hoisted() for functions needed before module execution
const mockFunction = vi.hoisted(() => vi.fn());
```

**Mocking Best Practices**:

- ES Modules: Mock with `vi.mock('module-name', async (importOriginal) => { ... })`. Use `importOriginal` for selective mocking
- Mocking Order: For critical dependencies (e.g., `os`, `fs`) that affect module-level constants, place `vi.mock` at the very top of the test file
- Mock Functions: Create with `vi.fn()`. Define behavior with `mockImplementation()`, `mockResolvedValue()`, or `mockRejectedValue()`
- Spying: Use `vi.spyOn(object, 'methodName')`. Restore spies with `mockRestore()` in `afterEach`

**Commonly Mocked Modules**:

- Node.js built-ins: `fs`, `fs/promises`, `os` (especially `os.homedir()`), `path`, `child_process` (`execSync`, `spawn`)
- External SDKs: `@google/genai`, `@modelcontextprotocol/sdk`
- Internal Project Modules: Dependencies from other project packages

**React Component Testing (CLI UI - Ink)**:

- Use `render()` from `ink-testing-library`
- Assert output with `lastFrame()`
- Wrap components in necessary `Context.Provider`s
- Mock custom React hooks and complex child components using `vi.mock()`

**Asynchronous Testing**:

- Use `async/await`
- For timers, use `vi.useFakeTimers()`, `vi.advanceTimersByTimeAsync()`, `vi.runAllTimersAsync()`
- Test promise rejections with `await expect(promise).rejects.toThrow(...)`

### React Guidelines

Follow these strict React best practices in all code:

**Core Principles**:

- Use functional components with Hooks - NO class components or old lifecycle methods
- Keep components pure and side-effect-free during rendering
- Respect one-way data flow - pass data down through props, avoid global mutations
- Never mutate state directly - always use immutable updates with state setters
- Follow the Rules of Hooks - call Hooks unconditionally at the top level

**useEffect Best Practices**:

- Use useEffect primarily for synchronization with external state
- NEVER setState within useEffect as it degrades performance
- Include all necessary dependencies in the dependency array
- Always return cleanup functions where appropriate
- For user actions (form submissions, clicks), use event handlers NOT useEffect

**Performance and Optimization**:

- Write code that remains correct even if components render multiple times
- Use functional state updates (e.g., `setCount(c => c + 1)`) to prevent race conditions
- Optimize for concurrency - assume React may render components multiple times
- Reduce network waterfalls - use parallel data fetching, leverage Suspense
- Rely on React Compiler - avoid premature optimization with manual memoization

**Component Design**:

- Prefer composition and small components over large monolithic ones
- Abstract repetitive logic into custom Hooks
- Use refs only when necessary (focus, animations, non-React integrations)
- Never read/write ref.current during rendering

**User Experience**:

- Provide clear, minimal, non-blocking UI states
- Show lightweight placeholders (skeleton screens) rather than intrusive spinners
- Handle errors gracefully with error boundaries or friendly messages
- Render partial data as it becomes available

### Integration Points

- **Google Cloud**: Artifact Registry, Docker/Podman sandbox
- **Authentication**: Multiple methods (Google account, API keys)
- **MCP Servers**: Support for Model Context Protocol
- **VS Code**: Companion extension in `packages/vscode-ide-companion/`

### Before Submitting Changes

ALWAYS run `npm run preflight` which performs:

1. Clean install of dependencies
2. Code formatting with Prettier
3. ESLint checking (zero warnings tolerance)
4. Full build
5. TypeScript type checking
6. All tests

This ensures code quality and prevents CI failures.
