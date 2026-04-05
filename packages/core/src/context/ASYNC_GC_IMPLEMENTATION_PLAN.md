# Asynchronous Context Management Implementation Plan

This document outlines the step-by-step implementation plan for refactoring `ContextManager` into a fully asynchronous, event-driven dataflow graph (Eager Subconscious Compute).

---

## Phase 1: Stable Identity & Incremental IR Mapping
**The Problem:** Currently, `IrMapper.toIr()` is stateless. It generates random UUIDs for `Episode` and `Step` nodes every time it parses the `Content[]` array. If the array is rebuilt while an asynchronous processor is computing a summary, the target ID will be lost, and the variant will be orphaned.
**The Goal:** Episodes must maintain a stable identity across turns so background workers can confidently attach variants to them.

**Tasks:**
1.  **Deterministic Hashing or Stateful Mapping:** Update `IrMapper` to either generate deterministic UUIDs (e.g., hashing the part text/timestamp) OR make `ContextManager`'s pristine graph mutable, where new `PUSH` events are mapped *incrementally* onto the tail of `this.pristineEpisodes` rather than rebuilding the whole array.
2.  **Test Update:** Ensure `IrMapper` tests verify stable IDs across successive parse events.

---

## Phase 2: Data Structures & Event Bus
**The Problem:** The system lacks the internal types and communication channels to support asynchronous variant generation.
**The Goal:** Define the `Variant` schemas and the internal `EventEmitter` that will broadcast graph updates to the async workers.

**Tasks:**
1.  **Variant Types:** Update `packages/core/src/context/ir/types.ts`.
    *   Add a `variants?: Record<string, Variant>` property to `Episode` and `Step` (where `Variant` is a discriminated union of `SummaryVariant`, `MaskedVariant`, `SnapshotVariant`, etc.).
    *   Include metadata on the variant: `status: 'computing' | 'ready' | 'failed'`, `promise?: Promise<void>`, `recoveredTokens: number`.
2.  **Event Bus (`ContextEventBus`):**
    *   Create an internal event emitter in `ContextManager` (using `events.EventEmitter` or a lightweight alternative).
    *   Define Events:
        *   `IR_NODE_CREATED`: Fired when a new Episode/Step is mapped. (Triggers eager compute).
        *   `VARIANT_READY`: Fired by a worker when it finishes computing a summary/snapshot.
        *   `BUDGET_RETAINED_CROSSED`: Fired when `currentTokens > retainedTokens`.
        *   `BUDGET_MAX_CROSSED`: Fired when `currentTokens > maxTokens`.

---

## Phase 3: Refactoring Processors into Async Workers
**The Problem:** Processors currently implement a synchronous `process(episodes, state) -> Promise<Episode[]>` interface and block the main loop.
**The Goal:** Convert them into background workers that listen to the `ContextEventBus`, perform LLM tasks asynchronously, and emit `VARIANT_READY`.

**Tasks:**
1.  **Define `AsyncContextWorker` Interface:**
    *   `start(bus: ContextEventBus): void`
    *   `stop(): void`
2.  **Implement `SemanticCompressionWorker`:**
    *   Listens to `IR_NODE_CREATED` (or `BUDGET_RETAINED_CROSSED` for lazier eager compute).
    *   Batches old `USER_PROMPT` nodes.
    *   Calls LLM in background.
    *   Emits `VARIANT_READY` with the summary string and target Node IDs.
3.  **Implement `StateSnapshotWorker`:**
    *   Listens to `BUDGET_RETAINED_CROSSED`.
    *   Identifies the N oldest raw episodes.
    *   Synthesizes them into a single `world_state_snapshot`.
    *   Emits `VARIANT_READY` containing the new Snapshot Episode and the IDs of the N episodes it replaces.
4.  **Wire Event Listeners:** `ContextManager` listens to `VARIANT_READY` and updates the pristine graph's `variants` dictionary.

---

## Phase 4: The Projection Engine & Pressure Barrier
**The Problem:** `projectCompressedHistory()` currently runs the synchronous pipeline. It needs to become the non-blocking opportunistic swapper and the blocking pressure barrier.
**The Goal:** Serve the LLM request instantly using pre-computed variants, or block strictly according to the user's `maxPressureStrategy`.

**Tasks:**
1.  **Opportunistic Swap (`retainedTokens`):**
    *   When traversing `this.pristineEpisodes` to build the projected array, if `currentTokens > retainedTokens`, check the oldest episodes.
    *   If an episode has a `variant.status === 'ready'`, use the variant's tokens and text *instead* of the raw episode.
2.  **Pressure Barrier (`maxTokens`):**
    *   If the projected array is *still* `> maxTokens` after all ready variants are applied, hit the Barrier.
    *   Read `config.getContextManagementConfig().budget.maxPressureStrategy`.
    *   **If `truncate`:** Instantly drop the oldest episodes from the projection until under budget. (Fastest).
    *   **If `incrementalGc`:** Await any variants that are `status === 'computing'` for the oldest nodes until the deficit is cleared. If none are computing, force a synchronous masking/truncation.
    *   **If `compress`:** Await the `StateSnapshotWorker`'s active `Promise`. If it hasn't started, synchronously invoke it and block until the N-to-1 snapshot is ready.

---

## Phase 5: Configuration & Telemetry
**The Goal:** Expose the new strategies to the user and ensure we can observe the background workers.

**Tasks:**
1.  **Config Schema:** Update `settingsSchema.ts` to include `maxPressureStrategy: 'truncate' | 'incrementalGc' | 'compress'`.
2.  **Telemetry:** Log events when background workers start/finish, including the tokens saved and the latency of the background task.
3.  **Testing:** Write concurrency tests simulating a user typing rapidly while background summaries are still resolving, ensuring no data corruption or dropped variants.

---

## Open Questions & Risks
*   **API Cost:** Eager compute means we might summarize an episode that the user *never* actually hits the context limit for. Should Eager Compute only begin when `current > retained`, or truly immediately? (Recommendation: Start at `retained` to save money, but `max` must be high enough above `retained` to give the async workers time to finish).
*   **Race Conditions:** If the user deletes a message via the UI (triggering `AgentChatHistory.map/flatMap`), we must cleanly abort any pending Promises in the background workers for those deleted IDs.