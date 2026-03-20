# Implementation Plan - Fix Context Initialization Mismatch in Core Tools

The Gemini CLI is experiencing various "Cannot read properties of undefined"
errors (notably `isTrustedFolder` and `publish`) during tool execution and
confirmation. This is caused by a structural mismatch where the global `Config`
object is passed to tool constructors that now expect an `AgentLoopContext`.

## Background & Reproducibility Analysis

### Root Cause Analysis (Regression)

The regression was introduced in commit **`de656f01d7`** (PR **#22115**), titled
_"feat(core): Fully migrate packages/core to AgentLoopContext"_.

In this PR:

- Tool constructors (e.g., `ShellTool`, `WebFetchTool`, `WebSearchTool`) were
  updated to expect an `AgentLoopContext` instead of a `Config` object.
- `AgentLoopContext` is an interface that includes a `.config` property.
- However, in `packages/core/src/config/config.ts`, the global `Config` object
  still instantiates these tools by passing `this` (the `Config` instance
  itself).
- **Critical Discovery:** While `Config` implements the properties of
  `AgentLoopContext`, it previously did so using **getters**. We discovered that
  in various parts of the system (like `LocalAgentExecutor`, `Scheduler`, and
  telemetry loggers), the context is cloned using the **spread operator** (e.g.,
  `{...context}`). Because getters exist on the prototype and are not enumerable
  own properties, they are **lost** during spreading.
- Consequently, internal tool calls to `this.context.config.someMethod()` fail
  because `this.context.config` becomes `undefined` after a spread operation.

## Objective

Standardize tool initialization and ensure the `Config` class is "spread-safe"
so that it correctly satisfies the `AgentLoopContext` interface even after being
cloned via object spread.

## Key Files & Context

- `packages/core/src/config/config.ts`: Refactored to use properties instead of
  getters for `AgentLoopContext` compatibility.
- `packages/core/src/scheduler/policy.ts`: Updated to handle potential context
  mismatches.
- `packages/core/src/tools/shell.ts`, `web-fetch.ts`, `web-search.ts`:
  Refactored constructors to take direct dependencies and handle context safely.

## Implementation Steps

### Phase 1: Centralized "Spread-Safe" Config

Instead of applying surgical fixes to every tool, we refactored the `Config`
class to ensure its `AgentLoopContext` implementation survives cloning.

- **Update `packages/core/src/config/config.ts`**:
  - Converted `config`, `promptId`, `toolRegistry`, `messageBus`,
    `geminiClient`, and `sandboxManager` from getters to actual properties.
  - Ensured these are initialized in the constructor or `initialize()` method.

### Phase 2: Tool and UI Resilience

- **Update Built-in Tools**: Refactored `ShellTool`, `WebFetchTool`, and
  `WebSearchTool` to be more robust during initialization.
- **Update UI**: Added safety checks in `ToolConfirmationMessage.tsx` to handle
  cases where the `config` object might still be partially initialized.

### Phase 3: Policy Hardening

- **Update `packages/core/src/scheduler/policy.ts`**: Added optional chaining
  and guards when accessing `context.config` to prevent crashes during policy
  updates.

## Verification & Testing

### Automated Tests

- Create unit tests that specifically instantiate tools with a raw `Config`
  object and call methods that access `this.config`.
- Verify `npm run test:core` passes.

### Manual Verification

1. Trigger shell commands in the interactive CLI.
2. Attempt "Allow all" actions.
3. Verify no "undefined" crashes occur.
