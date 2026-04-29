# Trace improvements

This document outlines planned improvements to the Gemini CLI tracing
infrastructure to enhance observability of context management decisions, token
estimation, and pipeline transformations.

## Observability goals

The primary goal is to move from "black box" logging to structured,
audit-friendly traces that explain _why_ specific nodes were retained,
summarized, or pruned.

## Planned improvements

### 1. Budget and pressure audit

Every render cycle should log a detailed budget status event to help diagnose
aggressive or insufficient pruning.

- **Target budget:** Capture `maxTokens` and `retainedTokens`.
- **Pre-pruning state:** Log the total tokens detected before any modifications.
- **Pressure metrics:** Calculate the ratio of current tokens to the budget.
- **Action delta:** Log the specific token count targeted for removal.

### 2. Node protection audit

The system applies several complex rules to protect nodes from being pruned or
summarized. We will add a trace to document these decisions for every node.

- **Protection reasons:** Map node IDs to specific protection categories, such
  as `system_prompt`, `active_task`, `in_flight_tool_call`, or `recent_turn`.
- **Visibility:** This allows developers to see exactly why a massive tool
  output was preserved despite being far back in the history.

### 3. Pipeline transformation lineage

When pipelines (like `gc_backstop`) modify the graph, we need to track the
transformation from $N$ nodes to $M$ nodes.

- **Summarization mapping:** When $N$ nodes are replaced by 1 summary node, log
  the IDs of the original nodes and the approximate token savings.
- **Modification tracking:** If a node is modified (for example, by masking long
  lines or truncating output), log the original size and the new size.
- **Lineage pointers:** Ensure summary nodes carry metadata pointing back to the
  original nodes they abstract.

### 4. Estimation calibration

To prevent future "phantom token" bugs, the system will log a breakdown of token
costs by category.

- **Category breakdown:** Log total tokens divided by type: `Text`, `Media`,
  `Tool Metadata` (including `thoughtSignature`), and `System Overhead`.
- **Heuristic verification:** This enables rapid verification that heuristics
  match actual model usage.

### 5. Strategy execution log

Log the high-level intent and strategy chosen by the orchestrator for each
trigger.

- **Trigger intent:** For example, "GC Backstop: Summarizing tool outputs to
  meet budget."
- **Success metrics:** Log whether the chosen strategy successfully brought the
  view under budget or if fallback strategies were required.

## Next steps

These improvements will be implemented incrementally within the `ContextManager`
and `render` orchestration logic. Existing trace assets will be augmented with
these additional structured fields.
