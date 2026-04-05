# Context Management Testing Plan

This document outlines the multi-layered testing strategy for the asynchronous context management architecture. Our goal is to ensure high coverage, prevent race conditions, and verify that the LLM is always presented with accurate, well-formatted state.

## Testing Strategy Heuristics

1.  **Golden Tests:** Used to verify *formatting* and *structural stability*. Whenever we want to answer the question, "What exact JSON/Content array will the Gemini API receive?", we use a golden test. 
2.  **Component Tests:** Used to verify *logic, system invariants, and concurrency*. These tests instantiate multiple classes (e.g., `ContextManager` + `AgentChatHistory` + `Workers`) and use mocks for the network (LLM) and timers. This is our primary defense against race conditions.
3.  **Unit Tests:** Used to verify *isolated, complex algorithms* and *corner cases*. If a method involves math, string manipulation, or complex isolated logic (like iterating and skipping nodes), it gets a unit test.

---

## 1. ContextManager (The Orchestrator)

The `ContextManager` sits at the center, maintaining the View and enforcing the Synchronous Pressure Barrier.

### Component Tests
*   **[COMPLETED] Race Condition: User Typing:** The user pushes new history while a background snapshot is computing. Ensure the snapshot is applied to older nodes, but the new nodes are preserved at the tail.
*   **[COMPLETED] Async GC Trigger:** Pushing history past `retainedTokens` triggers the `StateSnapshotWorker` without blocking the main thread.
*   **Sync Barrier - Truncate Strategy:** If history is pushed past `maxTokens` (e.g., pasting a massive file) and `maxPressureStrategy = 'truncate'`, the `projectCompressedHistory` method must instantly drop the oldest unprotected episodes until the budget is satisfied.
*   **Sync Barrier - Compress Strategy:** If history is pushed past `maxTokens` and strategy is `compress`, it blocks and falls back (or synchronously calls the worker).
*   **Protection Boundaries:** Ensure the System Prompt (Episode 0) and the Latest Turn (working context) are never dropped or heavily compressed, even under severe max token pressure.

### Unit Tests
*   **The View Generator Sweep (`getWorkingBufferView`):**
    *   Test N-to-1 Replacement: If a snapshot covers IDs `[A, B, C]`, ensure all three are completely omitted from the resulting array and replaced by the single snapshot node.
    *   Test Priority: If an episode has both a `snapshot` and a `summary` variant ready, ensure `snapshot` wins.

---

## 2. IrMapper (The Translation Layer)

The `IrMapper` translates flat `Content[]` arrays into the pristine `Episode[]` graph, and vice-versa.

### Golden Tests
*   **Multi-turn Flattening:** Ensure that `prompt -> thought -> toolCall -> toolResponse -> thought -> yield` translates back into a perfectly ordered `Content[]` array that the Gemini API accepts.

### Unit Tests
*   **WeakMap Node Pinning (ID Stability):** Call `toIr(history)` -> get Episode IDs. Push one more message to history. Call `toIr(history)` again. Assert that the IDs of the older episodes are identical (proving the `WeakMap` successfully pinned the reference). This is critical; if this fails, async variants will orphan.
*   **Token Estimation Integration:** Verify that `metadata.currentTokens` and `metadata.originalTokens` are populated accurately during mapping.

---

## 3. Async Workers (The Subconscious)

Workers listen to the Event Bus, do heavy LLM lifting, and emit ready variants.

### Component Tests
*   **StateSnapshotWorker Batching:** When triggered, it should gather the *oldest unprotected* episodes. It must stop gathering once `tokensToSynthesize >= targetDeficit`.
*   **StateSnapshotWorker Telemetry & Role:** Ensure the API call is dispatched using the `gemini-2.5-flash` model and the `LlmRole.UTILITY_COMPRESSOR` role.
*   **(Future) AsyncSemanticCompressor:** Testing the eager-compute summarization of large files.

---

## 4. Sync Processors (The Fallback / Bloom Filter)

Processors execute synchronously during `projectCompressedHistory` if the background workers haven't caught up, or to squash tokens down to the `retainedTokens` floor.

### Unit Tests
*   **HistorySquashingProcessor:** Test proportional truncation math. If an episode is 10k tokens and the budget demands saving 5k tokens, ensure the text is sliced cleanly without breaking formatting.
*   **ToolMaskingProcessor:** Verify the leaf-node deep JSON truncation logic. Ensure deeply nested massive arrays are masked (`"[1000 items hidden]"`), but the outer schema remains valid JSON.
*   **SemanticCompressionProcessor:** Verify it skips episodes that already have `summary` variants in the View.

### Golden Tests
*   **Masked Output Shapes:** Verify the visual presentation of a squashed or masked node (e.g., ensuring `[System: Truncated...]` headers are formatted nicely).
