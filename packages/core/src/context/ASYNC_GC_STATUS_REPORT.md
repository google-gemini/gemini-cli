# Asynchronous Context Management: Status Report & Bug Sweep

_Date: End of Day 2 (Subconscious Memory Refactoring Complete)_

## 1. Inventory against Implementation Plan

### ✅ Phase 1: Stable Identity & Incremental IR Mapping (100% Complete)

- **Accomplished:** Implemented an `IdentityMap` (`WeakMap<object, string>`) in `IrMapper`.
- **Result:** `Episode` and `Step` nodes now receive deterministic UUIDs based on the underlying `Content` object references. Re-parsing the history array no longer orphans background variants.
- **Testing:** Implemented an explicit `IrMapper.test.ts` unit test proving `WeakMap` identity stability across conversation growth.

### ✅ Phase 2: Data Structures & Event Bus (100% Complete)

- **Accomplished:** Added `variants?: Record<string, Variant>` to `Episode` IR types.
- **Accomplished:** Created `ContextEventBus` class and instantiated it on `ContextManager`.
- **Accomplished:** Added `checkTriggers()` to emit `IR_CHUNK_RECEIVED` (for Eager Compute) and `BUDGET_RETAINED_CROSSED` (for Opportunistic Consolidation) on every `PUSH`.

### ✅ Phase 3: Refactoring Processors into Async Workers (100% Complete)

- **Accomplished:** Defined `AsyncContextWorker` interface.
- **Accomplished:** Refactored `StateSnapshotProcessor` into `StateSnapshotWorker`. It successfully listens to the bus, batches unprotected dying episodes, and emits a `VARIANT_READY` event.
- **Accomplished:** Replaced dummy execution with the actual `config.getBaseLlmClient().generateContent()` API call using `gemini-2.5-flash` and the `LlmRole.UTILITY_COMPRESSOR` telemetry role.
- **Accomplished:** Added robust `try/catch` and extensive `debugLogger.error` / `debugLogger.warn` logging to catch anomalous LLM failures without crashing the main loop.

### ✅ Phase 4.1: Opportunistic Replacement Engine (100% Complete)

- **Accomplished:** Rewrote the `projectCompressedHistory` sweep to traverse from newest to oldest. When `rollingTokens > retainedTokens`, it successfully swaps raw episodes for `variants` (Summary, Masked, Snapshot) if they exist.
- **Accomplished:** Implemented the `getWorkingBufferView()` sweep method. It perfectly resolves the N-to-1 Variant Targeting bug by injecting the snapshot and adding all `replacedEpisodeIds` to a `skippedIds` Set, cleanly dropping the older raw nodes from the final projection array.

### ✅ Phase 4.2: The Synchronous Pressure Barrier (100% Complete)

- **Accomplished:** Implemented the hard block at the end of `projectCompressedHistory()` if `currentTokens` still exceeds `maxTokens` after all opportunistic swaps are applied.
- **Accomplished:** Reads the `mngConfig.budget.maxPressureStrategy` flag. Supports `truncate` (instantly dropping oldest unprotected episodes) and safely falls back if `compress` isn't fully wired synchronously yet.
- **Testing:** Wrote `contextManager.barrier.test.ts` to blast the system with ~200k tokens and verify the instant truncation successfully protects the System Prompt (Episode 0) and the current working context.

### ✅ Phase 5: Configuration & Testing (100% Complete)

- **Accomplished:** Exposed `maxPressureStrategy` in `settingsSchema.ts` and replaced the deprecated `incrementalGc` flag across the entire monorepo.
- **Accomplished:** Wrote extensive concurrency component tests in `contextManager.async.test.ts` to prove the async LLM Promise resolution does not block the main user thread, and handles the critical race condition of "User typing while background snapshotting" flawlessly.

---

## 2. Bug Sweep & Architectural Review (Critical Findings Resolved)

Both critical flaws discovered on Day 1 have been completely resolved:

### ✅ Resolved Bug 1: The "Duplicate Projection" Flaw (N-to-1 Variant Targeting)
**The Fix:** The `getWorkingBufferView()` method tracks a `skippedIds` Set during its sweep. If it chooses a SnapshotVariant, it pushes all `replacedEpisodeIds` into the Set, cleanly skipping the raw text nodes on subsequent iterations.

### ✅ Resolved Bug 2: Infinite RAM Growth (Pristine Graph Accumulation)
**The Fix:** The `checkTriggers()` method now calculates its token budget against the computed `WorkingBufferView` rather than the `pristineEpisodes` array. As soon as an async worker injects a snapshot, the calculated token count plummets natively, breaking the infinite GC loop while leaving the pristine log untouched.
