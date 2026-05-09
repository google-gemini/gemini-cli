<!--
 Copyright 2026 Google LLC
 SPDX-License-Identifier: Apache-2.0
-->

# Writing Behavioral Eval Tests — Contributor Guide

This guide walks you through writing your first behavioral eval from scratch.
It assumes you have read [`evals/README.md`](./README.md) for the conceptual
background (why evals exist, policies, the promotion process). This document
focuses entirely on the **how**.

---

## Prerequisites

Before writing an eval, build the bundled CLI. The eval harness runs the
compiled bundle, so you must rebuild after every code change:

```bash
npm run build
npm run bundle
```

---

## Step 1 — Decide what behaviour you are testing

A good eval target is a **model-steering decision**: something the agent is
_instructed_ to do but where you want a regression signal if the instruction
stops working.

Ask yourself:
- Does the agent use the right tool for this situation?
- Does the agent read a file before overwriting it?
- Does the agent call `save_memory` when asked to remember something?

If the behaviour is purely mechanical (e.g. "does `write_file` actually write
bytes to disk?"), write a unit test instead, not an eval.

---

## Step 2 — Create the eval file

Create a new file in `evals/` named `<feature>.eval.ts`. Vitest automatically
discovers any `*.eval.ts` file.

Minimal skeleton:

```typescript
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('my_feature', () => {
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'should do something specific',
    prompt: 'Your prompt to the agent here.',
    assert: async (rig, result) => {
      // assertions go here
    },
  });
});
```

**All new evals must use `USUALLY_PASSES`.** They are promoted to
`ALWAYS_PASSES` only after 7 nightly runs at 100% — the agent does this
automatically. See [`README.md#test-promotion-process`](./README.md#test-promotion-process).

---

## Step 3 — Understand the `EvalCase` properties

| Property | Required | Description |
|---|---|---|
| `suiteName` | Yes | Always `'default'` unless you are building a named sub-suite. |
| `suiteType` | Yes | `'behavioral'` for agent-level evals (most common), `'component-level'` for direct component tests, `'hero-scenario'` for end-to-end flows. |
| `name` | Yes | Unique, descriptive test name shown in CI output. |
| `prompt` | Yes | The exact text sent to the agent. |
| `assert` | Yes | Async function that receives `(rig, result)` and throws on failure. |
| `files` | No | Initial workspace files — a `Record<string, string>` of `relativePath → content`. |
| `params.settings` | No | Deep-merged settings override (e.g. to enable an experimental flag). Cannot restrict available tools. |
| `approvalMode` | No | Defaults to `'yolo'` (auto-approve all tool calls). Use `ApprovalMode.PLAN` to test plan mode. |
| `messages` | No | Pre-seeded conversation history loaded via `--resume`. Useful for multi-turn tests. |
| `sessionId` | No | Fixed session ID for the resumed session. Auto-generated if omitted. |
| `timeout` | No | Per-test timeout in ms. Vitest config sets a global 5-minute limit. |

---

## Step 4 — Set up a realistic workspace with `files`

Pass `files` as a `Record<string, string>` of relative paths to file content.
The harness writes these files to a temporary directory and initialises a git
repo, so the agent behaves as if it is working in a real project.

```typescript
evalTest('USUALLY_PASSES', {
  suiteName: 'default',
  suiteType: 'behavioral',
  name: 'should add a feature to an existing component',
  files: {
    'package.json': JSON.stringify({ name: 'my-app', version: '1.0.0', type: 'module' }),
    'src/Button.tsx': `export function Button({ label }: { label: string }) {
  return <button>{label}</button>;
}`,
  },
  prompt: 'Add an onClick prop to the Button component in src/Button.tsx.',
  assert: async (rig) => {
    const content = rig.readFile('src/Button.tsx');
    expect(content).toContain('onClick');
  },
});
```

**Sizing guidance:** 2–3 files is the sweet spot. Enough to be realistic;
small enough to reason about. Never check in dozens of files.

---

## Step 5 — Write assertions using the `rig` API

The `rig` object (`TestRig`) is your window into what the agent did. It reads
telemetry events written by the CLI during the run.

### Read a file the agent modified

```typescript
const content = rig.readFile('src/index.ts');
expect(content).toContain('myNewFunction');
```

### Check that a specific tool was called

```typescript
const wasToolCalled = await rig.waitForToolCall('save_memory');
expect(wasToolCalled, 'Expected save_memory to be called').toBe(true);
```

### Check that a tool was called with specific arguments

```typescript
const called = await rig.waitForToolCall('save_memory', undefined, (args) => {
  try {
    return JSON.parse(args).scope === 'project';
  } catch {
    return false;
  }
});
expect(called).toBe(true);
```

### Inspect the ordered list of all tool calls

```typescript
const logs = rig.readToolLogs();
// Each entry: { toolRequest: { name, args, success, duration_ms } }

const writeCalls = logs.filter((l) => l.toolRequest.name === 'write_file');
expect(writeCalls.length).toBeGreaterThanOrEqual(1);
```

### Assert tool call ordering (e.g. read before write)

```typescript
const logs = rig.readToolLogs();
const readIdx  = logs.findIndex((l) => l.toolRequest.name === 'read_file');
const writeIdx = logs.findIndex((l) => l.toolRequest.name === 'write_file');

expect(readIdx).toBeGreaterThanOrEqual(0);
if (writeIdx !== -1) {
  expect(readIdx).toBeLessThan(writeIdx);
}
```

### Assert the agent produced output

```typescript
import { assertModelHasOutput, checkModelOutputContent } from './test-helper.js';

assertModelHasOutput(result); // throws if result is empty

checkModelOutputContent(result, {
  expectedContent: ['blue'],           // strings or RegExp
  forbiddenContent: [/error|fail/i],   // warns, does not throw
});
```

> **Note:** `checkModelOutputContent` only warns — it does not fail the test.
> Use it for soft checks on model prose; use `expect` for hard assertions on
> tool calls and file contents.

### Wait for telemetry to flush (for negative assertions)

When asserting that a tool was **not** called, the telemetry file may not yet
be written. Await `waitForTelemetryReady()` first:

```typescript
await rig.waitForTelemetryReady();
const called = rig.readToolLogs().some((l) => l.toolRequest.name === 'save_memory');
expect(called).toBe(false);
```

### Verify a tool call succeeded (not just ran)

```typescript
await rig.expectToolCallSuccess(['write_file']);
```

---

## Step 6 — Choose assertion strategy by what you are testing

| What you are testing | Recommended approach |
|---|---|
| Agent uses the right tool | `rig.waitForToolCall(toolName)` + `expect(called).toBe(true)` |
| Agent writes correct content | `rig.readFile(path)` + `expect(content).toContain(...)` |
| Agent avoids a tool | `await rig.waitForTelemetryReady()` then check `readToolLogs()` |
| Tool call order | Index into `readToolLogs()` and compare indices |
| Agent's prose output | `checkModelOutputContent` (soft) or `expect(result).toMatch(...)` |
| Tool called with right args | `waitForToolCall(name, undefined, argsMatcher)` |

**Prefer hard assertions (file content, specific tool args) over soft ones
(prose output).** Model responses vary; file system state does not.

---

## Step 7 — Test multi-turn conversations with `messages`

Use `messages` to pre-seed conversation history. The harness writes a session
file and passes `--resume <sessionId>` to the CLI automatically.

```typescript
evalTest('USUALLY_PASSES', {
  suiteName: 'default',
  suiteType: 'behavioral',
  name: 'should recall a preference from earlier in the session',
  messages: [
    {
      id: 'msg-1',
      type: 'user',
      content: [{ text: 'I always prefer tabs over spaces.' }],
      timestamp: '2026-01-01T00:00:00Z',
    },
    {
      id: 'msg-2',
      type: 'gemini',
      content: [{ text: 'Got it, I will use tabs.' }],
      timestamp: '2026-01-01T00:00:05Z',
    },
  ],
  prompt: 'What indentation style should you use for me?',
  assert: async (rig, result) => {
    assertModelHasOutput(result);
    checkModelOutputContent(result, { expectedContent: [/tabs/i] });
  },
});
```

---

## Step 8 — Run the eval locally

First confirm it fails **without** your change (see _"Fail First"_ in
`README.md`). Then apply your change and verify it passes.

```bash
# Run just your new eval file (fastest iteration loop)
npm run test:all_evals -- --testPathPattern evals/my_feature.eval.ts

# Run all always-passing evals (CI-safe, no API key required for golden tests)
npm run test:always_passing_evals

# Run the full eval suite (slow, requires GEMINI_API_KEY)
npm run test:all_evals
```

To override the model:

```bash
GEMINI_MODEL=gemini-3-flash-preview npm run test:all_evals -- --testPathPattern evals/my_feature.eval.ts
```

To keep output and logs after the run:

```bash
KEEP_OUTPUT=true npm run test:all_evals -- --testPathPattern evals/my_feature.eval.ts
# Logs land in evals/logs/
```

To enable verbose output during debugging:

```bash
VERBOSE=true npm run test:all_evals -- --testPathPattern evals/my_feature.eval.ts
```

---

## Step 9 — Alternative test helpers for non-subprocess evals

`evalTest` (in `test-helper.ts`) spawns a real CLI subprocess and is the right
choice for the majority of behavioral evals. Two additional helpers exist for
specialised cases:

### `appEvalTest` — in-process UI testing

Defined in `evals/app-test-helper.ts`. Runs the Ink UI inside the test
process using `AppRig`. Useful when you need to test interactive UI behaviour
(e.g. streaming output, breakpoints) without subprocess overhead.

```typescript
import { appEvalTest } from './app-test-helper.js';

appEvalTest('USUALLY_PASSES', {
  suiteName: 'default',
  suiteType: 'behavioral',
  name: 'should show streaming output',
  prompt: 'Say hello.',
  assert: async (rig, output) => {
    expect(output).toContain('hello');
  },
});
```

### `componentEvalTest` — direct component testing

Defined in `evals/component-test-helper.ts`. Initialises a real `Config`
with real API access but no UI or subprocess. Use this when testing a specific
backend component (e.g. context graph, memory routing) in isolation.

```typescript
import { componentEvalTest } from './component-test-helper.js';

componentEvalTest('USUALLY_PASSES', {
  suiteName: 'default',
  suiteType: 'component-level',
  name: 'should initialise config correctly',
  assert: async (config) => {
    expect(config.getModel()).toBeDefined();
  },
});
```

### `LLMJudge` — semantic assertion via a model

When you cannot write a deterministic assertion on output prose, use
`LLMJudge` (in `evals/llm-judge.ts`) to ask a model a Yes/No question.
`LLMJudge` requires a `BaseLlmClient`, which is available on the `Config`
object provided by `componentEvalTest`:

```typescript
import { componentEvalTest } from './component-test-helper.js';
import { LLMJudge } from './llm-judge.js';

componentEvalTest('USUALLY_PASSES', {
  suiteName: 'default',
  suiteType: 'component-level',
  name: 'agent response correctly explains recursion',
  assert: async (config) => {
    const llmClient = config.getLlmClient();
    const judge = new LLMJudge(llmClient);
    const agentOutput = '...'; // result from your component under test
    const verdict = await judge.judgeYesNo(
      `The following agent response correctly explains recursion. Answer YES or NO.\n\n${agentOutput}`,
      { selfConsistencyRuns: 3 },
    );
    expect(verdict.verdict).toBe(true);
  },
});
```

Use `LLMJudge` sparingly — it adds latency and cost. Prefer file content or
tool-call assertions wherever possible.

---

## Complete worked example

This eval tests that the agent prefers `write_file` over shell redirection when
asked to create a file. It is structured to **fail first** (the agent
occasionally uses echo for simple requests), then pass after a prompt change.

```typescript
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('file_tool_preference', () => {
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'should use write_file instead of shell redirection to create a file',
    files: {
      'package.json': JSON.stringify({ name: 'demo', version: '1.0.0', type: 'module' }),
    },
    prompt: 'Create a file called notes.txt containing the text "hello world".',
    assert: async (rig) => {
      const logs = rig.readToolLogs();

      // Hard assertion: write_file must have been called at least once
      const writeFileCalls = logs.filter((l) => l.toolRequest.name === 'write_file');
      expect(
        writeFileCalls.length,
        'Expected write_file to be used for file creation',
      ).toBeGreaterThanOrEqual(1);

      // Hard assertion: shell echo/redirection must not have been used
      const shellCalls = logs.filter((l) => l.toolRequest.name === 'run_shell_command');
      const echoRedirectCalls = shellCalls.filter((l) => {
        let cmd = '';
        if (typeof l.toolRequest.args === 'string') {
          try {
            cmd = JSON.parse(l.toolRequest.args).command ?? l.toolRequest.args;
          } catch {
            cmd = l.toolRequest.args;
          }
        } else {
          cmd = (l.toolRequest.args as any).command ?? '';
        }
        return cmd.includes('echo') || cmd.includes('>');
      });
      expect(
        echoRedirectCalls.length,
        'Shell redirection must not be used for simple file creation',
      ).toBe(0);

      // Verify the file actually exists with the right content
      const content = rig.readFile('notes.txt');
      expect(content).toContain('hello world');
    },
  });
});
```

---

## Common pitfalls

| Pitfall | Fix |
|---|---|
| Asserting exact model prose | Use regex / `checkModelOutputContent` instead; prose varies. |
| Negative tool assertions without flushing | Always `await rig.waitForTelemetryReady()` before checking tool absence. |
| Parsing `toolRequest.args` without a try/catch | Args may be JSON or a plain string — handle both. |
| Setting `ALWAYS_PASSES` on a new eval | Start with `USUALLY_PASSES`; promotion is handled automatically. |
| Restricting tools via `params.settings` | The `coreTools`, `allowedTools`, `excludeTools` fields are forbidden in evals. |
| Writing a test that passes on the first run | Verify it fails _before_ your prompt/tool change, then re-run after. |

---

## Checklist before opening a PR

- [ ] File named `evals/<feature>.eval.ts`
- [ ] Apache-2.0 license header present
- [ ] Policy set to `USUALLY_PASSES`
- [ ] `suiteName: 'default'` and `suiteType` set correctly
- [ ] Eval **failed** before your prompt/tool change, **passes** after
- [ ] Assertions target tool calls or file content, not only prose
- [ ] Ran `npm run build && npm run bundle` before each local test run
- [ ] `npm run preflight` passes
