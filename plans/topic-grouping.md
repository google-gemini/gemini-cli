# Plan: Linear Semantic Topic Grouping (Chapters)

Implement a semantic topic grouping system to organize tool calls into
sequential "Chapters" in the UI using a dedicated tool and prompt feedback.

## 1. Core Component: Topic Management

Create a lightweight `TopicManager` to maintain the session's current semantic
state.

- **Location:** `packages/core/src/tools/topicTool.ts`
- **Role:** A singleton that stores the `activeTopicTitle`.
- **Logic:**
  - `setTopic(title: string)`: Updates the current title.
  - `getTopic()`: Returns the current title (defaults to `undefined`).

## 2. The `create_new_topic` Tool

A nearly No-OP tool that acts as the trigger for UI "Chapter" breaks.

- **Name:** `create_new_topic`
- **Parameters:** `title: string` (e.g., "Researching Codebase", "Implementing
  Fix").
- **Execution Logic:**
  - Calls `TopicManager.setTopic(title)`.
  - Returns a simple confirmation message: `Topic changed to: "${title}"`.
- **UI Impact:** The UI detects this tool name in the stream and renders a
  visual divider/header.

## 3. Scheduler Ordering (Turn-Ahead Alignment)

Ensure the "Chapter Header" appears before actions in a single turn.

- **Location:** `packages/core/src/scheduler/scheduler.ts`
- **Change:** In `_startBatch`, sort incoming `toolCalls`. Move
  `create_new_topic` to index `0`.
- **Reason:** Correct UI rendering order for simultaneous calls.

## 4. Context Reinjection (Loop Feedback)

Keep the model aware of its current "Chapter" to prevent redundant calls.

- **Location:** `packages/core/src/prompts/promptProvider.ts`
- **Change:** Append the current topic to the system prompt footer (e.g.,
  `[Active Topic: Researching Auth Flow]`).
- **Instruction:** Add mandate: _"If the current active topic no longer
  describes your current phase of work, use `create_new_topic` to start a new
  chapter."_

## 5. System Prompt Refinement

Update `packages/core/src/prompts/snippets.ts` with guidance.

- **Guidance:** "Use `create_new_topic` to organize your work into logical
  chapters. Call it when transitioning between major steps (e.g., Research ->
  Strategy -> Implementation)."
- **Constraint:** Forward-only semantic marker.

## 6. Verification & Evaluation

- **Behavioral Eval:** Create `evals/topic_grouping.eval.ts`.
- **Validation:** Run `npm run preflight` to ensure monorepo-wide stability.
