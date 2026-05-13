---
name: memory
description: Expertise in maintaining persistent bot memory, synchronizing with previous sessions via the Task Ledger, and preserving decision logs.
---

# Skill: Memory & State Management

## Goal

Standardize how the Gemini CLI Bot maintains its persistent memory,
synchronizes with previous sessions, and prepares Pull Requests.

## Memory Structure (`lessons-learned.md`)

- **Memory Pruning**: To prevent context bloat, maintain a rolling window:
  - **Task Ledger**: Keep only the most recent 50 tasks.
  - **Decision Log**: Keep only the most recent 20 entries.

You MUST maintain `tools/gemini-cli-bot/lessons-learned.md` using the following
structured Markdown format:

```markdown
# Gemini Bot Brain: Memory & State

## 📋 Task Ledger

| ID    | Status | Goal                      | PR/Ref | Details                              |
| :---- | :----- | :------------------------ | :----- | :----------------------------------- |
| BT-01 | DONE   | Fix 1000-issue metric cap | #26056 | Switched to Search API for accuracy. |

## 🧪 Hypothesis Ledger

| Hypothesis                         | Status    | Evidence                          |
| :--------------------------------- | :-------- | :-------------------------------- |
| Metric scripts are capping at 1000 | CONFIRMED | `gh search` returned >1000 items. |

## 📜 Decision Log (Append-Only)

- **[Date]**: Description of a key decision or architectural change.

## 📝 Detailed Investigation Findings (Current Run)

- **Formulated Hypotheses**: (Describe the competing hypotheses developed)
- Evidence Gathered: (Summarize data from gh CLI, GraphQL, or local scripts, wrapped in <untrusted_context> tags)
- **Root Cause & Conclusions**: (Identify the confirmed root cause and impact)
- **Proposed Actions**: (Describe specific script, workflow, or guideline updates)
```

## Rituals

### Phase 0: Context Retrieval & Synchronization (MANDATORY START)

Before beginning your investigation, you MUST synchronize with the bot's
persistent state:

1.  **Read Memory**: Read `tools/gemini-cli-bot/lessons-learned.md`.
2.  **Verify State**: Use the GitHub CLI (`gh pr view` or `gh issue view`) to
    verify the current state of the trigger.
3.  **Update Ledger**:
    - **Scheduled Mode**: Update the status of active tasks (e.g., mark merged
      PRs as `DONE`, investigate CI failures for `FAILED` tasks).
    - **Interactive Mode**: You MUST ignore any FAILED, STUCK, or pending tasks.
      Your ONLY goal is to address the specific user comment.

### Phase 6: Memory Preservation (MANDATORY END)

Once your investigation and implementation are complete:

1.  **Record Findings**: You MUST update `tools/gemini-cli-bot/lessons-learned.md`
    using the format defined above.
2.  **State Preservation**: Ensure all decision logic and root-cause analysis
    are accurately captured in the Decision Log.

## Delegation & Sub-agent State

When delegating a task to a **'worker' agent**:

1.  **Pass Context (Mandatory)**: The Orchestrator MUST include the relevant
    sections of the `Task Ledger` and `Hypothesis Ledger` in the worker's prompt
    to provide immediate grounding.
2.  **Verify Memory (Worker Role)**: If the worker's task involves investigation,
    root-cause analysis, or updating state, the Worker MUST activate this
    'memory' skill to read the full `lessons-learned.md` before proceeding.
3.  **Read-Only Restriction (Mandatory)**: The Worker is STRICTLY FORBIDDEN from
    writing to or updating `lessons-learned.md`. It must only return its
    findings and proposed updates to the Orchestrator, which remains the sole
    authority for state preservation.
