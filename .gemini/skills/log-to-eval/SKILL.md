---
name: log-to-eval
description:
  Convert a chat session log into a behavioral eval scaffold. Use when you want
  to capture an observed agent behavior as a regression test, generate an eval
  from a real session, or turn a bug reproduction into a behavioral eval.
  Trigger when the user mentions converting logs to evals, generating evals
  from sessions, or capturing agent behavior as a test.
---

# Log-to-Eval Conversion

Converts a recorded Gemini CLI session into a behavioral eval scaffold. The
agent reads a session file, presents the key interactions, and generates an
eval that reproduces the observed behavior.

> [!IMPORTANT]
> The generated eval is a **scaffold**. You must review and refine the
> assertions before submitting. Follow the
> [Fail First](evals/README.md) principle — the eval should fail before your
> prompt/tool change and pass after.

## Workflow

### 1. Find the session

Session files are stored at `~/.gemini/tmp/<project_id>/chats/`. List
available sessions:

```bash
ls -lt ~/.gemini/tmp/*/chats/session-*.json | head -10
```

The user can also provide a direct path to a session file.

### 2. Parse the session

Run the parse script to extract a readable summary of the session:

```bash
node .gemini/skills/log-to-eval/scripts/parse-session.js <path-to-session.json>
```

This outputs a JSON summary with:

- each user prompt
- each tool call the agent made (name, key args, success/failure)
- files the agent read or wrote

### 3. Select the behavior to capture

Present the parsed summary to the user. Ask which interaction they want to turn
into an eval. A good eval candidate is:

- a specific tool call sequence that should always happen (e.g., read before edit)
- a decision the agent made correctly that could regress (e.g., choosing the
  right tool)
- a mistake the agent made that a prompt change should fix

### 4. Generate the eval scaffold

Create the eval file at `evals/<behavior_name>.eval.ts` with:

- Apache-2.0 license header (Copyright 2026 Google LLC)
- `evalTest('USUALLY_PASSES', { ... })` from `evals/test-helper.js`
- `files:` object populated from the session's file interactions. Extract only
  the relevant portions of files — not full contents. If the agent read a
  1000-line file but only edited lines 50-60, include just enough context
  around those lines.
- `prompt:` from the original user message in the session
- `assert:` function with tool call checks matching the session's tool sequence.
  Use patterns from existing evals (see
  [references/session-format.md](references/session-format.md) for the data
  structures).
- `timeout: 180000` (3 minutes, matching other evals)

### 5. Remind about fail-first

After generating, remind the user:

- the eval should **fail** before their prompt/tool change
- if it already passes, it may be asserting behavior the agent gets for free
- review `evals/README.md` for best practices before submitting

## Key files

| File                                               | Purpose                              |
| -------------------------------------------------- | ------------------------------------ |
| `~/.gemini/tmp/<id>/chats/session-*.json`          | recorded session data                |
| `evals/test-helper.ts`                             | EvalCase interface for generated code |
| `.gemini/skills/behavioral-evals/SKILL.md`         | how to write evals (companion skill) |
| `packages/core/src/services/chatRecordingService.ts` | ConversationRecord type definitions |

## References

- **[session-format.md](references/session-format.md)**: data structures for
  ConversationRecord, MessageRecord, and ToolCallRecord
