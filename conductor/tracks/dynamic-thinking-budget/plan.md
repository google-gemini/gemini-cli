# Dynamic Thinking Budget Plan

## Context

The current Gemini CLI implementation uses static thinking configurations
defined in `settings.json` (or defaults).

- **Gemini 2.x**: Uses a static `thinkingBudget` (e.g., 8192 tokens).
- **Gemini 3**: Uses a static `thinkingLevel` (e.g., "HIGH").

This "one-size-fits-all" approach is inefficient. Simple queries waste compute,
while complex queries might not get enough reasoning depth. The goal is to
implement an "Adaptive Budget Manager" that dynamically adjusts the
`thinkingBudget` (for v2) or `thinkingLevel` (for v3) based on the complexity of
the user's request.

## Goals

- Implement a **Complexity Classifier** using a lightweight model (e.g., Gemini
  Flash) to analyze the user's prompt and history.
- **Map complexity levels** to:
  - `thinkingBudget` token counts for Gemini 2.x models.
  - `thinkingLevel` enums for Gemini 3 models.
- **Dynamically update** the `GenerateContentConfig` in `GeminiClient` before
  the main model call.
- Ensure **fallback mechanisms** if the classification fails.
- (Optional) **Visual feedback** to the user regarding the determined
  complexity.

## Strategy

### 1. Adaptive Budget Manager Service

Create a new service `AdaptiveBudgetService` in
`packages/core/src/services/adaptiveBudgetService.ts`.

- **Functionality**:
  - Takes `userPrompt` and `recentHistory` as input.
  - Calls Gemini Flash (using `config.getBaseLlmClient()`) with a specialized
    system prompt.
  - Returns a `ComplexityLevel` (1-4).

### 2. Budget/Level Mapping

| Complexity Level | Gemini 2.x (`thinkingBudget`) | Gemini 3 (`thinkingLevel`) | Description                    |
| :--------------- | :---------------------------- | :------------------------- | :----------------------------- |
| **1 (Simple)**   | 1,024 tokens                  | `LOW`                      | Quick fixes, syntax questions. |
| **2 (Moderate)** | 4,096 tokens                  | `MEDIUM` (or `LOW`)        | Function-level logic.          |
| **3 (High)**     | 16,384 tokens                 | `HIGH`                     | Module-level refactoring.      |
| **4 (Extreme)**  | 32,768+ tokens                | `HIGH`                     | Architecture, deep debugging.  |

### 3. Integration Point

Modify `packages/core/src/core/client.ts` to invoke the `AdaptiveBudgetService`
before `sendMessageStream`.

- **Flow**:
  1.  User sends message.
  2.  `GeminiClient` identifies the target model family (v2 or v3).
  3.  Call `AdaptiveBudgetService.determineComplexity()`.
  4.  If **v2**: Calculate `thinkingBudget` based on complexity. Update config.
  5.  If **v3**: Calculate `thinkingLevel` based on complexity. Update config.
  6.  Proceed with `sendMessageStream`.

### 4. Configuration

Add settings to `packages/core/src/config/config.ts` and `settings.schema.json`:

- `adaptiveThinking.enabled`: boolean (default true)
- `adaptiveThinking.classifierModel`: string (default "gemini-2.0-flash")

## Insights from "J1: Exploring Simple Test-Time Scaling (STTS)"

The paper (arXiv:2505.xxxx / 2512.19585) highlights that models trained with
Reinforcement Learning (like Gemini 3) exhibit strong scaling trends when
allocated more inference-time compute.

- **Budget Forcing**: The "Adaptive Budget Manager" implements this by forcing
  higher `thinkingLevel` or `thinkingBudget` for harder tasks, maximizing the
  "verifiable reward" (correct code) for complex problems while saving latency
  on simple ones.
- **Best-of-N**: The paper suggests that generating N solutions and selecting
  the best one is a powerful STTS method. While out of scope for _this_ specific
  track, the "Complexity Classifier" we build here is the _prerequisite_ for
  that future feature. We should only trigger expensive "Best-of-N" flows when
  the Complexity Level is 3 or 4.

## Files to Modify

- `packages/core/src/services/adaptiveBudgetService.ts` (New)
- `packages/core/src/core/client.ts`
- `packages/core/src/config/config.ts`

## Verification Plan

1.  **Unit Tests**: Verify `AdaptiveBudgetService` returns correct mappings for
    both model families.
2.  **Integration Tests**: Mock API calls to ensure `thinkingLevel` is sent for
    v3 and `thinkingBudget` for v2.
3.  **Manual Verification**: Use debug logs to verify the correct parameters are
    being sent to the API.
