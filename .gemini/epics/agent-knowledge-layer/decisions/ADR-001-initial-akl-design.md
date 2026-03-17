# ADR-001: Initial Design of the Agent Knowledge Layer (AKL)

## Status

Proposed

## Context

Gemini CLI agents lack persistent, high-level situational awareness across
long-running workstreams (Epics/Features) and tend to repeat mistakes (loops) or
lose track of established patterns. Current hierarchical memory (`GEMINI.md`) is
rarely updated by agents.

## Decision

We will implement an "Agent Knowledge Layer" (AKL) that provides:

1.  **Multi-Layered Storage:**
    - `machine-learnings.md` at Global, Project, and Micro levels for patterns
      and optimizations.
    - `.gemini/epics/<id>/` for situational awareness tied to branches/issues.
2.  **GitHub-Aware Discovery:** Syncing context from GitHub issues (including
    parent issues) at session start.
3.  **Active Synthesis:** Tools for agents to record ADRs (`record_decision`),
    update Epic state (`update_epic_state`), and record learnings
    (`record_learning`).
4.  **Experimental Gating:** Feature flag `experimental.akl`.

## Consequences

- **Pros:** Improved consistency across complex task loops, reduced repetition
  of failure patterns, clear documentation of architectural decisions.
- **Cons:** Slight overhead at session start for discovery; potential for
  context pollution if not indexed effectively.
