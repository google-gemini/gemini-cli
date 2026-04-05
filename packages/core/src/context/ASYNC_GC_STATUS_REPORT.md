# Asynchronous Context Management: Status Report & Bug Sweep
*Date: End of Day 1*

## 1. Inventory against Implementation Plan

### ✅ Phase 1: Stable Identity & Incremental IR Mapping (100% Complete)
*   **Accomplished:** Implemented an `IdentityMap` (`WeakMap<object, string>`) in `IrMapper`.
*   **Result:** `Episode` and `Step` nodes now receive deterministic UUIDs based on the underlying `Content` object references. Re-parsing the history array no longer orphans background variants.

### ✅ Phase 2: Data Structures & Event Bus (100% Complete)
*   **Accomplished:** Added `variants?: Record<string, Variant>` to `Episode` IR types.
*   **Accomplished:** Created `ContextEventBus` class and instantiated it on `ContextManager`.
*   **Accomplished:** Added `checkTriggers()` to emit `IR_CHUNK_RECEIVED` (for Eager Compute) and `BUDGET_RETAINED_CROSSED` (for Opportunistic Consolidation) on every `PUSH`.

### 🔄 Phase 3: Refactoring Processors into Async Workers (80% Complete)
*   **Accomplished:** Defined `AsyncContextWorker` interface.
*   **Accomplished:** Refactored `StateSnapshotProcessor` into `StateSnapshotWorker`. It successfully listens to the bus, batches unprotected dying episodes, and emits a `VARIANT_READY` event.
*   **Pending:** Replace `setTimeout` dummy execution with the actual `config.getBaseLlmClient().generateContent()` API call.

### 🔄 Phase 4.1: Opportunistic Replacement Engine (100% Complete)
*   **Accomplished:** Rewrote the `projectCompressedHistory` sweep to traverse from newest to oldest. When `rollingTokens > retainedTokens`, it successfully swaps raw episodes for `variants` (Summary, Masked, Snapshot) if they exist.

### ❌ Phase 4.2: The Synchronous Pressure Barrier (0% Complete)
*   **Pending:** Implement the hard block at the end of `projectCompressedHistory()` if `currentTokens` still exceeds `maxTokens` after all opportunistic swaps are applied. Must respect `maxPressureStrategy` (truncate, incrementalGc, compress).

### ❌ Phase 5: Configuration & Telemetry (0% Complete)
*   **Pending:** Expose `maxPressureStrategy` in `settingsSchema.ts`. Write rigorous concurrency tests.

---

## 2. Bug Sweep & Architectural Review (Critical Findings)

During our end-of-day audit, we challenged our assumptions and swept the new code. We discovered two critical logic flaws that must be addressed first thing tomorrow:

### 🚨 Bug 1: The "Duplicate Projection" Flaw (N-to-1 Variant Targeting)
**The Flaw:** 
In `StateSnapshotWorker`, we synthesize `N` episodes (e.g., Episodes 1, 2, 3) into a single `SnapshotVariant`. We currently attach this variant *only* to the newest episode in the batch (Episode 3) via `targetId`.
When the Opportunistic Swapper loops backwards (`i = 3, 2, 1`), it hits Episode 3, sees the Snapshot, and injects it. But then the loop continues to Episode 2 and Episode 1! Since they don't have the variant attached, the swapper injects them as **raw text**. The final projection contains *both* the snapshot AND the raw text it was supposed to replace.
**The Fix (The Working Buffer Architecture):**
Instead of projecting variants on the fly during a backwards sweep, the `ContextManager` will maintain two separate graphs: an immutable `pristineLog` (for future offloading to the Memory Wheel) and a mutable `workingContext`. When the `StateSnapshotWorker` finishes, it structurally *replaces* the N raw episodes with the 1 Snapshot episode directly in the `workingContext` array. This eliminates the duplicate projection bug entirely.

### 🚨 Bug 2: Infinite RAM Growth (Pristine Graph Accumulation)
**The Flaw:**
Async variants only replace text in the *Projected* graph. The *Pristine* graph inside `ContextManager` (`this.pristineEpisodes`) never shrinks. Because `checkTriggers()` calculates tokens based on the pristine graph, once the history crosses `retainedTokens` (65k), it will *always* be over 65k, emitting `BUDGET_RETAINED_CROSSED` on every single turn forever.
Furthermore, if we never delete episodes from the pristine graph, the Node.js process will eventually run out of heap memory (OOM) on extremely long sessions.
**The Fix (The Working Buffer Architecture):**
By calculating the token budget against the mutable `workingContext` (which is actively compacted by background snapshots) rather than the immutable `pristineLog`, the token count will successfully drop back below `retainedTokens` (65k). This breaks the infinite event loop and prevents OOM crashes. The `pristineLog` will just grow until the future Memory Subsystem is built to page it to disk.

### 🚨 Minor Risk: Identity Map Mutation
**The Risk:**
`IrMapper` relies on `WeakMap<Content, string>`. If the user uses a UI command to *edit* a previous message, `AgentChatHistory` might replace the `Content` object reference. This would generate a new UUID, instantly orphaning any background variants currently computing for the old reference.
**The Mitigation:**
We must ensure `ContextManager` handles orphaned `VARIANT_READY` events gracefully (e.g., if `targetId` is not found, simply discard the variant and log a debug warning). (I verified we already wrote `if (targetEp)` checks in `ContextManager`, so this is mitigated).