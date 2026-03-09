## Summary

Extract a generic `ExecutionLifecycleService` that owns background-execution state (create, stream, background, complete, kill) so that **any tool** — not just shell — can be backgrounded via Ctrl+B. This is a pure abstraction/renaming refactor with no new features; the follow-up PR (stacked on this branch) wires remote agents into the same lifecycle.

## Details

### Why this change

Background execution was deeply coupled to `ShellExecutionService`: resolver maps, listener maps, exit-info TTL, and the `background()` / `subscribe()` / `onExit()` API all lived inside the shell service. Adding Ctrl+B support for remote agents (or MCP tools, local agents, etc.) would have required either duplicating that machinery or reaching into shell internals. This PR pulls the lifecycle out into a standalone service that shell delegates to.

### Recommended reading order

This is a large diff (13 files, ~1500 insertions) but the bulk is mechanical delegation. Read in this order:

1. **`executionLifecycleService.ts`** — the new abstraction. Two execution kinds:
   - *virtual*: tool calls `createExecution()`, gets an ID + result promise, streams via `appendOutput()`, completes via `completeExecution()`. Used by the upcoming remote-agent wiring.
   - *external*: shell calls `attachExecution(pid, {...hooks})` to attach lifecycle tracking to a real OS process. Same lifecycle, but with write/kill/isActive hooks delegated back to the PTY/child_process owner.
   - Shared: `background()` resolves the result promise early with `backgrounded: true` but keeps the execution active for continued streaming. `subscribe()` replays a snapshot for late joiners. `onExit()` fires on completion or replays from a 5-minute TTL cache.

2. **`shellExecutionService.ts`** — the main deletion site. All background-state maps (`activeResolvers`, `activeListeners`, `exitedPidInfo`) are removed. Shell now calls `attachExecution()` at spawn time and `completeWithResult()` at exit. The public `background()`, `subscribe()`, `onExit()`, `kill()`, `isActive()`, `writeInput()` methods become one-line delegates.

3. **`tool-executor.ts` + `coreToolHookTriggers.ts`** — the `setPidCallback` → `setExecutionIdCallback` rename chain. `ToolExecutor` no longer checks `instanceof ShellToolInvocation`; every tool gets the callback. `executeToolWithHooks` passes it through to `invocation.execute()`.

4. **`tools.ts` + `shell.ts`** — `ToolInvocation.execute()` signature gains optional `setExecutionIdCallback`. `BackgroundExecutionData` interface + `isBackgroundExecutionData` / `getBackgroundExecutionId` helpers added. Shell tool populates `data.executionId` alongside the existing `data.pid`.

5. **`useGeminiStream.ts` + `shellCommandProcessor.ts`** — UI generalization. The `activePtyId` computation no longer filters on `request.name === 'run_shell_command'`; any executing tool with a numeric `pid` (execution ID) qualifies for Ctrl+B. Background registration uses the core `isBackgroundExecutionData` / `getBackgroundExecutionId` helpers. Parameter renamed `activeToolPtyId` → `activeBackgroundExecutionId`.

### Key design decisions

- **Static class, not singleton instance**: `ExecutionLifecycleService` uses static methods and maps, matching the existing `ShellExecutionService` pattern. This avoids DI plumbing changes across the codebase.
- **`pid` field as backward-compat alias**: `ExecutionHandle.pid` and `BackgroundExecutionData.pid` remain for existing shell consumers. New code should use `executionId` / `getBackgroundExecutionId()`.
- **`NON_PROCESS_EXECUTION_ID_START = 2_000_000_000`**: Virtual execution IDs start above any realistic OS PID. `isActive()` short-circuits for IDs in this range to avoid spurious `process.kill()` syscalls.
- **No `finalizeExecution`**: The deprecated alias was removed (zero callers).

## Related Issues

<!-- Use keywords to auto-close issues (Closes #123, Fixes #456). If this PR is
only related to an issue or is a partial fix, simply reference the issue number
without a keyword (Related to #123). -->

## How to Validate

1. **Read the new service first**: `packages/core/src/services/executionLifecycleService.ts` — verify the create → stream → background → complete lifecycle makes sense in isolation.

2. **Verify shell delegation**: `shellExecutionService.ts` should have no background-state maps of its own. Every public lifecycle method should be a one-liner delegating to `ExecutionLifecycleService`.

3. **Run the targeted test suites**:
   ```bash
   npm run test --workspace @google/gemini-cli-core -- --run \
     src/services/executionLifecycleService.test.ts \
     src/services/shellExecutionService.test.ts \
     src/core/coreToolHookTriggers.test.ts \
     src/scheduler/tool-executor.test.ts

   npm run test --workspace @google/gemini-cli -- --run \
     src/ui/hooks/useGeminiStream.test.tsx
   ```

4. **Typecheck and lint**:
   ```bash
   npm run typecheck --workspace @google/gemini-cli-core
   npm run lint --workspace @google/gemini-cli-core
   npm run lint --workspace @google/gemini-cli
   ```

5. **Verify no behavioral change**: Existing shell backgrounding (Ctrl+B during a `run_shell_command`) should work identically. The UI background panel, `onExit` notifications, and kill behavior are unchanged.

## Pre-Merge Checklist

- [ ] Updated relevant documentation and README (if needed)
- [x] Added/updated tests (if needed)
- [ ] Noted breaking changes (if any)
- [ ] Validated on required platforms/methods:
  - [ ] MacOS
    - [ ] npm run
    - [ ] npx
    - [ ] Docker
    - [ ] Podman
    - [ ] Seatbelt
  - [ ] Windows
    - [ ] npm run
    - [ ] npx
    - [ ] Docker
  - [ ] Linux
    - [ ] npm run
    - [ ] npx
    - [ ] Docker
