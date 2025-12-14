# Token Usage Display – Design Note

## Overview

This feature adds real-time visibility into token usage for the current Gemini
CLI session. The existing `/stats` command provides aggregate statistics, but it
does not help developers monitor ongoing cost and token consumption as they
work. Many heavy users care about usage efficiency and cost, so this change
surfaces live session metrics (prompt tokens, completion tokens, and estimated
cost) directly in the CLI footer for continuous observability.

The flow is built on top of the existing telemetry pipeline.
`UiTelemetryService` listens to API responses and tracks token counts per model,
emitting updates as usage changes. `SessionStatsProvider` subscribes to those
updates and exposes aggregated session statistics through the
`useSessionStats()` hook. Finally, `TokenUsageDisplay` consumes this hook in the
CLI UI, aggregates tokens across models, computes an estimated cost via
`tokenPricing.ts`, and renders a compact footer display such as
`| ↑12.5K ↓3.2K ~$0.05`. This allows users to adjust their prompts and workflows
in real time based on immediate feedback from the token usage display.

## Display Format

Token usage display is appended to the current Footer component of the Gemini
CLI:

```text
| ↑12.5K ↓3.2K ~$0.05
```

- `↑` = Input/prompt tokens (accent color)
- `↓` = Output/candidate tokens (accent color)
- `~$X.XX` = Estimated cost (secondary color)

## Architecture

```text
┌─────────────────────────────────────────────────────────────────┐
│                     UiTelemetryService                          │
│  (packages/core/src/telemetry/uiTelemetry.ts)                   │
│                                                                 │
│  • Receives API response events                                 │
│  • Tracks tokens per model (prompt, candidates, cached, etc.)   │
│  • Emits 'update' events                                        │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SessionStatsProvider                          │
│  (packages/cli/src/ui/contexts/SessionContext.tsx)              │
│                                                                 │
│  • Listens to telemetry updates                                 │
│  • Maintains React state for UI                                 │
│  • Provides useSessionStats() hook                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   TokenUsageDisplay                             │
│  (packages/cli/src/ui/components/TokenUsageDisplay.tsx)         │
│                                                                 │
│  • Consumes useSessionStats() hook                              │
│  • Aggregates tokens across all models                          │
│  • Calculates cost using tokenPricing.ts                        │
│  • Formats display using formatCompactNumber.ts                 │
└─────────────────────────────────────────────────────────────────┘
```
