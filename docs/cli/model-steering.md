# Model steering (experimental)

Model steering lets you provide real-time guidance and feedback to Gemini CLI
while it is actively executing a task. This lets you correct course, add missing
context, or skip unnecessary steps without having to stop and restart the agent.

<!-- prettier-ignore -->
> [!NOTE]
> This is an experimental feature currently under active development and
> may need to be enabled under `/settings`.

Model steering is particularly useful during complex [Plan Mode](./plan-mode.md)
workflows or long-running subagent executions where you want to ensure the agent
stays on the right track.

## Enabling model steering

Model steering is an experimental feature and is disabled by default. You can
enable it using the `/settings` command or by updating your `settings.json`
file.

1.  Type `/settings` in the Gemini CLI.
2.  Search for **Model Steering**.
3.  Set the value to **true**.

Alternatively, add the following to your `settings.json`:

```json
{
  "experimental": {
    "modelSteering": true
  }
}
```

## Using model steering

When model steering is enabled, Gemini CLI treats any text you type while the
agent is working as a steering hint.

1.  Start a task (for example, "Refactor the database service").
2.  While the agent is working (the spinner is visible), type your feedback in
    the input box.
3.  Press **Enter**.

Gemini CLI acknowledges your hint with a brief message and injects it directly
into the model's context for the very next turn. The model then re-evaluates its
current plan and adjusts its actions accordingly.

### Common use cases

You can use steering hints to guide the model in several ways:

- **Correcting a path:** "Actually, the utilities are in `src/common/utils`."
- **Skipping a step:** "Skip the unit tests for now and just focus on the
  implementation."
- **Adding context:** "The `User` type is defined in `packages/core/types.ts`."
- **Redirecting the effort:** "Stop searching the codebase and start drafting
  the plan now."
- **Handling ambiguity:** "Use the existing `Logger` class instead of creating a
  new one."

## How it works

When you submit a steering hint, Gemini CLI performs the following actions:

1.  **Immediate acknowledgment:** It uses a small, fast model to generate a
    one-sentence acknowledgment so you know your hint was received.
2.  **Context injection:** It prepends an internal instruction to your hint that
    tells the main agent to:
    - Re-evaluate the active plan.
    - Classify the update (for example, as a new task or extra context).
    - Apply minimal-diff changes to affected tasks.
3.  **Real-time update:** The hint is delivered to the agent at the beginning of
    its next turn, ensuring the most immediate course correction possible.

## Next steps

- Tackle complex tasks with [Plan Mode](./plan-mode.md).
- Build custom [Agent Skills](./skills.md).
