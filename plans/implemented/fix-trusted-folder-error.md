# Implementation Plan - Fix Context Initialization Mismatch in Core Tools

The Gemini CLI is experiencing various "Cannot read properties of undefined" errors (notably `isTrustedFolder` and `publish`) during tool execution and confirmation. This is caused by a structural mismatch where the global `Config` object is passed to tool constructors that now expect an `AgentLoopContext`.

## Background & Reproducibility Analysis

### Root Cause Analysis (Regression)
The regression was introduced in commit **`de656f01d7`** (PR **#22115**), titled *"feat(core): Fully migrate packages/core to AgentLoopContext"*. 

In this PR:
- Tool constructors (e.g., `ShellTool`, `WebFetchTool`, `WebSearchTool`) were updated to expect an `AgentLoopContext` instead of a `Config` object.
- `AgentLoopContext` is an interface that includes a `.config` property.
- However, in `packages/core/src/config/config.ts`, the global `Config` object still instantiates these tools by passing `this` (the `Config` instance itself).
- While `Config` implements some getters that overlap with `AgentLoopContext` (like `geminiClient`), it does **not** have a `.config` property. 
- Consequently, internal tool calls to `this.context.config.someMethod()` fail because `this.context.config` is undefined.
- Additionally, some parts of the system expect a fully initialized `messageBus` on the context, which can lead to "Cannot read properties of undefined (reading 'publish')" if the context isn't correctly structured or if there's a race in initialization.

### Why this might not be reproducible for all users:
- **Sub-agent Usage:** Sub-agents correctly initialize tools with a full `AgentLoopContext` via `LocalAgentExecutor`.
- **Tool Selection:** The bug only surfaces in tools that specifically access `context.config` or certain context-scoped services.
- **Initialization Order:** Depending on how the CLI is invoked (interactive vs. non-interactive), the `Config` object might be in different states of initialization.

## Objective
Standardize tool initialization so that built-in tools can correctly resolve their required configuration and services whether they are running in the main loop (initialized with `Config`) or as a sub-agent (initialized with `AgentLoopContext`).

## Key Files & Context
- `packages/core/src/config/config.ts`: Where built-in tools are incorrectly instantiated with `this`.
- `packages/core/src/tools/shell.ts`: `ShellTool` constructor expects `AgentLoopContext`.
- `packages/core/src/tools/web-fetch.ts`: `WebFetchTool` constructor expects `AgentLoopContext`.
- `packages/core/src/tools/web-search.ts`: `WebSearchTool` constructor expects `AgentLoopContext`.
- `packages/core/src/scheduler/policy.ts`: Accesses `context.config.isTrustedFolder()`.
- `packages/core/src/scheduler/scheduler.ts`: Initializes its own `messageBus` and `context`.

## Implementation Steps

### Phase 0: Preparation
1. **Update Plan:** (This file) Broaden the scope from just "isTrusted" to "Context Mismatch".
2. **GitHub Issue:** Update GitHub issue #23174 with the refined root cause analysis.

### Phase 1: Robust Tool Context Handling
The built-in tools need to handle being initialized by either the global `Config` or an `AgentLoopContext`.

- **Update `packages/core/src/tools/shell.ts`**, **`web-fetch.ts`**, and **`web-search.ts`**:
    - Update constructors to accept `Config | AgentLoopContext`.
    - Internalize logic to safely resolve `config`, `geminiClient`, and other services.
    - Example:
      ```typescript
      this.config = 'config' in context ? context.config : context;
      ```

### Phase 2: UI and Policy Hardening
- **Update `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx`**: Add safety checks for `config`.
- **Update `packages/core/src/scheduler/policy.ts`**: Ensure `context.config` exists before use.

### Phase 3: Scheduler Verification
- Ensure `Scheduler` and `SchedulerStateManager` are receiving a correctly structured `messageBus`.

## Verification & Testing

### Automated Tests
- Create unit tests that specifically instantiate tools with a raw `Config` object and call methods that access `this.config`.
- Verify `npm run test:core` passes.

### Manual Verification
1. Trigger shell commands in the interactive CLI.
2. Attempt "Allow all" actions.
3. Verify no "undefined" crashes occur.
