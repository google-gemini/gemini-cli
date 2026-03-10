# Gemini CLI Strict Development Rules

These rules apply strictly to all code modifications and additions within the
Gemini CLI project.

## Testing Guidelines

- **Async/Await**: Always use `waitFor` from
  `packages/cli/src/test-utils/async.ts` instead of `vi.waitFor` for all
  `waitFor` calls within `packages/cli`. NEVER use fixed waits (e.g.,
  `await delay(100)`). Always use `waitFor` with a predicate to ensure tests are
  stable and fast. Using the wrong `waitFor` can result in flaky tests and `act`
  warnings.
- **React Testing**: Use `act` to wrap all blocks in tests that change component
  state. Use `render` or `renderWithProviders` from
  `packages/cli/src/test-utils/render.tsx` instead of `render` from
  `ink-testing-library` directly. This prevents spurious `act` warnings. If test
  cases specify providers directly, consider whether the existing
  `renderWithProviders` should be modified.
- **Snapshots**: Use `toMatchSnapshot` to verify that rendering works as
  expected rather than matching against the raw content of the output. When
  modifying snapshots, verify the changes are intentional and do not hide
  underlying bugs.
- **Parameterized Tests**: Use parameterized tests where it reduces duplicated
  lines. Give the parameters explicit types to ensure the tests are type-safe.
- **Mocks Management**:
  - Mock critical dependencies (`fs`, `os`, `child_process`) ONLY at the top of
    the file. Ideally, avoid mocking these dependencies altogether.
  - Reuse existing mocks and fakes rather than creating new ones.
  - Avoid mocking the file system whenever possible. If using the real file
    system is too difficult, consider writing an integration test instead.
  - Always call `vi.restoreAllMocks()` in `afterEach` to prevent test pollution.
  - Use `vi.useFakeTimers()` for tests involving time-based logic to avoid
    flakiness.
- **Typing in Tests**: Avoid using `any` in tests; prefer proper types or
  `unknown` with narrowing.

## React Guidelines (`packages/cli`)

- **`setState` and Side Effects**: NEVER trigger side effects from within the
  body of a `setState` callback. Use a reducer or `useRef` if necessary. These
  cases have historically introduced multiple bugs; typically, they should be
  resolved using a reducer.
- **Rendering**: Do not introduce infinite rendering loops. Avoid synchronous
  file I/O in React components as it will hang the UI. Do not implement new
  logic for custom string measurement or string truncation. Use Ink layout
  instead, leveraging `ResizeObserver` as needed.
- **Keyboard Handling**: Keyboard handling MUST go through `useKeyPress.ts` from
  the Gemini CLI package rather than the standard ink library. This library
  supports reporting multiple keyboard events sequentially in the same React
  frame (critical for slow terminals). Handling this correctly often requires
  reducers to ensure multiple state updates are handled gracefully without
  overriding values. Refer to `text-buffer.ts` for a canonical example.
- **Logging**: Do not leave `console.log`, `console.warn`, or `console.error` in
  the code.
- **State & Effects**: Ensure state initialization is explicit (e.g., use
  `undefined` rather than `true` as a default if the state is truly unknown).
  Carefully manage `useEffect` dependencies. Prefer a reducer whenever
  practical. NEVER disable `react-hooks/exhaustive-deps`; fix the code to
  correctly declare dependencies instead.
- **Context & Props**: Avoid excessive property drilling. Leverage existing
  providers, extend them, or propose a new one if necessary. Only use providers
  for properties that are consistent across the entire application.
- **Code Structure**: Avoid complex `if` statements where `switch` statements
  could be used. Keep `AppContainer` minimal; refactor complex logic into React
  hooks. Evaluate whether business logic should be added to `hookSystem.ts` or
  integrated into `packages/core` rather than `packages/cli`.

## Core Guidelines (`packages/core`)

- **Services**: Implement services as classes with clear lifecycle management
  (e.g., `initialize()` methods). Services should be stateless where possible,
  or use the centralized `Storage` service for persistence.
- **Cross-Service Communication**: Prefer using the `coreEvents` bus (from
  `packages/core/src/utils/events.ts`) for asynchronous communication between
  services or to notify the UI of state changes. Avoid tight coupling between
  services.
- **Utilities**: Use `debugLogger` from `packages/core/src/utils/debugLogger.ts`
  for internal logging instead of `console`. Ensure all shell operations use
  `spawnAsync` from `packages/core/src/utils/shell-utils.ts` for consistent
  error handling and promise management. Handle filesystem errors gracefully
  using `isNodeError` from `packages/core/src/utils/errors.ts`.
- **Exports & Tooling**: Add new tools to `packages/core/src/tools/` and
  register them in `packages/core/src/tools/tool-registry.ts`. Export all new
  public services, utilities, and types from `packages/core/src/index.ts`.

## Architectural Audit (Package Boundaries)

- **Logic Placement**: Non-UI logic (e.g., model orchestration, tool
  implementation, git/filesystem operations) MUST reside in `packages/core`.
  `packages/cli` should ONLY contain UI/Ink components, command-line argument
  parsing, and user interaction logic.
- **Environment Isolation**: Core logic must not assume a TUI environment. Use
  the `ConfirmationBus` or `Output` abstractions for communicating with the user
  from Core.
- **Decoupling**: Actively look for opportunities to decouple services using
  `coreEvents`. If a service imports another just to notify it of a change, use
  an event instead.

## General Gemini CLI Design Principles

- **Settings**: Use settings for user-configurable options rather than adding
  new command line arguments. Add new settings to
  `packages/cli/src/config/settingsSchema.ts`. If a setting has
  `showInDialog: true`, it MUST be documented in
  `docs/get-started/configuration.md`. Ensure `requiresRestart` is correctly
  set.
- **Logging**: Use `debugLogger` for rethrown errors to avoid duplicate logging.
- **Keyboard Shortcuts**: Define all new keyboard shortcuts in
  `packages/cli/src/config/keyBindings.ts` and document them in
  `docs/cli/keyboard-shortcuts.md`. Be careful of keybindings that require the
  `Meta` key, as only certain meta key shortcuts are supported on Mac. Avoid
  function keys and shortcuts commonly bound in VSCode.

## TypeScript Best Practices

- Use `checkExhaustive` in the `default` clause of `switch` statements to ensure
  all cases are handled.
- Avoid using the non-null assertion operator (`!`) unless absolutely necessary.
- **STRICT TYPING**: Strictly forbid `any` and `unknown` in both CLI and Core
  packages. `unknown` is only allowed if it is immediately narrowed using type
  guards or Zod validation.
- NEVER disable `@typescript-eslint/no-floating-promises`.
- Avoid making types nullable unless strictly necessary, as it hurts
  readability.

## TUI Best Practices

- **Terminal Compatibility**: Consider how changes might behave differently
  across terminals (e.g., VSCode terminal, SSH, Kitty, default Mac terminal,
  iTerm2, Windows terminal). If modifying keyboard handling, integrate deeply
  with existing files like `KeypressContext.tsx` and
  `terminalCapabilityManager.ts`.
- **iTerm**: Be aware that `ITERM_SESSION_ID` may be present when users run
  VSCode from within iTerm, even if the terminal is not iTerm.

## Code Cleanup

- **Refactoring**: Actively clean up code duplication, technical debt, and
  boilerplate ("AI Slop") when working in the codebase.
- **Prompts**: Be aware that changes can impact the prompts sent to Gemini CLI
  and affect overall quality.
