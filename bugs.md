# Context Management Bugs & Anomalies

This document tracks verified bugs and architectural anomalies identified during
the dogfooding phase.

## 1. GC Backstop Failure

- **Status:** FIXED.
- **Root Cause:** Node protection logic was scattered and inconsistent.
  Background async pipelines were only protecting "in-flight" tool calls,
  meaning the system prompt and other critical turns could be partially
  truncated before rendering, leading to structural violations and sentinel
  injections.
- **Fix:** Centralized node protection in
  `ContextManager.getProtectedNodeIds()`. This ensures the System Prompt (first
  logical episode) and Recent Context (last logical episode) are globally pinned
  across both background async and final sync backstop pipelines.
- **Verification:** Verified with `contextManager.barrier.test.ts` and
  `lifecycle.golden.test.ts`.

## 2. Sync/Async Pipeline Race Condition

- **Status:** FIXED.
- **Root Cause:** `renderHistory` executed synchronously immediately after a
  push, often finishing before the background async management pipelines could
  update the context.
- **Fix:** Implemented a **Synchronous Pressure Barrier** in `renderHistory`.
  The `PipelineOrchestrator` now tracks pending async promises, and
  `renderHistory` will `await orchestrator.waitForPipelines()` before generating
  the LLM view.
- **Verification:** Confirmed in `lifecycle.golden.test.ts` Scenario 3
  (Async-Driven Background GC).

## 3. Redundant Render Overhead

- **Status:** FIXED.
- **Root Cause:** Multiple calls to `renderHistory` (e.g. from safety checkers)
  triggered expensive graph-to-history conversions even when the history hadn't
  changed.
- **Fix:** Implemented a `lastRenderCache` in `ContextManager`. It uses a join
  of node IDs as a cheap "graph hash" to skip redundant processing if the
  context is stable.
- **Verification:** Verified with debug logs showing "Render cache hit" during
  multi-tool turns.

## 4. Normalization Sensitivity Mismatch

- **Status:** FIXED.
- **Root Cause:** Processor thresholds (3k distillation, 2k truncation) were too
  high for typical tool responses, allowing context pressure to reach 90%+
  without triggering management.
- **Fix:** Refined the generalist profile in `profiles.ts`. Lowered distillation
  threshold to 1,000 tokens and truncation threshold to 1,200 tokens.
- **Verification:** Verified in Scenario 1 of `lifecycle.golden.test.ts`,
  showing earlier and more frequent management of medium-sized tool responses.

## 5. Re-sync Loop Inefficiency

- **Status:** FIXED.
- **Root Cause:** Management-driven `setHistory()` calls triggered `SYNC_FULL`
  events, causing the `HistoryObserver` to rebuild the context graph from
  scratch redundantly.
- **Fix:** Implemented `SILENT_SYNC` event type in `AgentChatHistory`.
  `GeminiClient` now passes `{ silent: true }` when updating history with
  managed results. `HistoryObserver` ignores these events as the context is
  already up-to-date.
- **Verification:** Verified in `lifecycle.golden.test.ts` and confirmed via
  reduced log noise.
