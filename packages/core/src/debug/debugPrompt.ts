/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Debug System Prompt — Teaches the LLM How to Debug.
 *
 * This is the GLUE between all 9 debug modules and the Gemini agent.
 * It provides structured instructions that teach the LLM:
 *   - WHEN to use each debug tool
 *   - HOW to chain tools together for different scenarios
 *   - WHAT to look for in debug output
 *   - HOW to avoid common pitfalls (like infinite stepping loops)
 *
 * This integrates into the existing prompt system via the
 * `snippets` pattern in packages/core/src/prompts/.
 *
 * Inspired by state-of-the-art: dap-mcp server's context window
 * optimization and multi-agent debugging workflows.
 */

// ---------------------------------------------------------------------------
// Debug Prompt Snippets
// ---------------------------------------------------------------------------

/**
 * Get the debug system prompt snippet that teaches the agent how to debug.
 * This should be injected into the system prompt when debug tools are available.
 */
export function getDebugSystemPrompt(): string {
    return `## Debugging Capabilities

You have access to a powerful debugging toolset that lets you launch programs
under a debugger, set breakpoints, step through code, inspect variables,
and diagnose bugs autonomously.

### Available Debug Tools

| Tool | Purpose |
|------|---------|
| \`debug_launch\` | Launch a program with debugger attached |
| \`debug_set_breakpoint\` | Set breakpoints (line, conditional, logpoint) |
| \`debug_get_stacktrace\` | Get call stack + source context + AI analysis |
| \`debug_get_variables\` | Inspect variables in current scope |
| \`debug_step\` | Step through code (next/in/out/continue) |
| \`debug_evaluate\` | Evaluate expressions in debug context |
| \`debug_disconnect\` | End the debug session |

### Debugging Workflows

**When the user says "my program crashes":**
1. \`debug_launch\` the program (exception breakpoints are set automatically)
2. Wait for the exception to be caught
3. \`debug_get_stacktrace\` — this returns source code, analysis, AND fix suggestions
4. \`debug_get_variables\` — inspect the variables at the crash point
5. \`debug_evaluate\` — test potential fixes
6. Present findings and suggest a fix

**When the user says "debug this function":**
1. \`debug_launch\` the program
2. \`debug_set_breakpoint\` at the function entry point
3. \`debug_step\` with action=continue to reach the breakpoint
4. \`debug_step\` with action=next to step through line by line
5. At each step, \`debug_get_stacktrace\` to see analysis
6. \`debug_get_variables\` to watch how state changes

**When the user says "why is X wrong?":**
1. \`debug_launch\` the program
2. \`debug_set_breakpoint\` where X is set/modified
3. \`debug_step\` with action=continue to reach the breakpoint
4. \`debug_evaluate\` with expression=X to check current value
5. \`debug_step\` through the logic that modifies X
6. Compare expected vs actual values

### Supported Languages

The debugger supports:
- **Node.js** (.js, .ts, .mjs, .cjs) via \`--inspect-brk\`
- **Python** (.py) via \`debugpy\`
- **Go** (.go) via \`dlv\` (Delve)

The language is auto-detected from the file extension.

### Important Rules

1. **Never step more than 20 times** without analyzing the state.
   After 10 steps, always call \`debug_get_stacktrace\` to check progress.

2. **Use conditional breakpoints** when looking for a specific state:
   \`debug_set_breakpoint\` with \`condition: "x > 100"\` is better than
   stepping until x > 100.

3. **Check for loops**: If you've called the same tool 3+ times with the
   same parameters, you're stuck. Try a different approach:
   - From stepping → try evaluating an expression
   - From inspecting → try setting a breakpoint further ahead
   - From evaluating → try disconnecting and applying a code fix

4. **Source context is your friend**: \`debug_get_stacktrace\` returns
   the actual source code around the current line. USE IT to understand
   what the code is doing before stepping.

5. **Exception breakpoints are automatic**: When you \`debug_launch\`,
   ALL exception breakpoints are set automatically. The debugger will
   catch ANY thrown exception.
`;
}

/**
 * Get a concise debug capabilities summary for tool descriptions.
 */
export function getDebugCapabilitiesSummary(): string {
    return [
        'Debug tools provide full DAP debugging: launch, breakpoints, stepping,',
        'variable inspection, expression evaluation. Supports Node.js, Python, Go.',
        'Exception breakpoints are set automatically. Stack trace analysis includes',
        'source code context and AI-powered fix suggestions with 11 pattern matchers.',
    ].join(' ');
}
