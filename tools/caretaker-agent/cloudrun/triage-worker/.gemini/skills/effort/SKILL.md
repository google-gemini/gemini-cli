---
name: effort
description: Estimates the implementation effort required to address the given issue.
---

# Effort Estimator Instructions
Analyze the issue content (title, body) AND the **code exploration output** (the discovered source files, coupled UI components, and test files) to estimate the effort required to implement a fix.

### JSON Output Format:
```json
{
  "effort_estimate": "SMALL" | "MEDIUM" | "LARGE",
  "effort_reasoning": "Detailed explanation of why this estimate was chosen."
}
```

### Effort Levels:
**SMALL** (1 day or less):
- Trivial Logic & Config: Schema updates (Zod), feature flag toggles, adding missing fields to package.json or settings.json.
- UI/Aesthetic Adjustments: Fixing minor layout bugs in Ink components (e.g., adding flexShrink, correcting padding in a single Box), text color changes.
- Documentation & Strings: Typos, log message updates, CLI argument descriptions.
- Localized Bug Fixes: Single-file logic errors, straightforward promise rejections (e.g., wrapping a known failure in a try/catch), simple regex or string parsing fixes.
- Unhandled Errors with Obvious Fixes: Issues with provided stack traces or obvious offending lines where the root cause and fix are clear.
**MEDIUM** (2-3 days):
- React/Ink State Management: Complex component lifecycle issues (memory leaks in the UI), terminal redraw flickering, or state synchronization between the CLI's internal input buffer and the interactive React components.
- Asynchronous Flow & Integration: Resolving complex Promise chains, ERR_STREAM_PREMATURE_CLOSE, debugging IDE companion extensions (VS Code, Android Studio) or resolving hanging HTTP requests/IPC between the CLI and external plugins, timeouts in non-interactive/ACP modes.
- Tooling & Output Parsers: Modifying how tools parse streaming stdout/stderr buffers, adding new built-in tools that don't require native bindings.
- Cross-Component & Cross-Package Refactors: Any fix or change that spans across packages/cli and packages/core (such as unifying event handlers, hooks, or UI state across package boundaries).
**LARGE** (3+ days):
- Platform-Specific Complexities (PTY/Signals): Any issue involving node-pty, child_process.spawn, pseudo-terminal exhaustion (ENXIO), raw mode terminal desyncs, or POSIX signal forwarding (SIGINT/SIGTERM).
- Core Architecture & Protocols: Refactoring the Scheduler, Agent-to-Agent (A2A) protocol implementation, low-level MCP (Model Context Protocol) transport mechanisms.
- CI/CD Infrastructure Overhauls: Major redesign of release pipelines or runner execution environments with a large blast radius across production builds.
- Performance & Memory: Diagnosing massive disk/memory leaks, severe boot time regressions, high-throughput streaming optimizations (e.g., voice streaming pipelines).

Note: Any bug that is described as intermittent, flickering, difficult to reproduce, platform-specific, or requiring cross-environment setups (e.g., involving the VS Code IDE companion, GCA plugin, or Android Studio) MUST NOT be rated as effort/small because of the increased overhead of testing and reproducing.