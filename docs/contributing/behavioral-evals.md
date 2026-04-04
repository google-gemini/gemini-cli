# Writing Behavioral Eval Tests

This guide walks you through writing a behavioral eval test for Gemini CLI from
scratch. It is intended for OSS contributors who want to help improve agent
quality by adding eval coverage.

For the internal eval framework reference, see
[evals/README.md](../../evals/README.md).

## What Are Behavioral Evals?

Behavioral evals test whether Gemini CLI's agent behaves correctly from a
**user's perspective**. Unlike unit tests that verify a function returns the
right value, behavioral evals verify that the agent makes the right decisions:

- Does it call the right tool for a given prompt?
- Does it avoid modifying files when only asked to inspect?
- Does it use `google_web_search` for real-time information instead of guessing?

Each eval runs the full agent loop: prompt → model → tool calls → response.

## When to Write a Behavioral Eval vs. a Unit Test

| Use a **behavioral eval** when...                  | Use a **unit test** when...               |
| -------------------------------------------------- | ----------------------------------------- |
| Testing agent decision-making (which tool to call) | Testing a function's return value         |
| Testing prompt-dependent behavior                  | Testing deterministic logic               |
| Testing multi-step tool sequences                  | Testing error handling in a single module |
| Testing that file edits match user intent          | Testing argument parsing                  |

## Prerequisites

1. **Node.js ~20.19.0** — see [CONTRIBUTING.md](../../CONTRIBUTING.md) for setup
2. **A `GEMINI_API_KEY` environment variable** — evals run against the live
   Gemini API
3. **Built project** — run `npm install && npm run build` from the repo root

## The `evalTest()` API

All behavioral evals use the `evalTest()` function from `evals/test-helper.ts`.
Here is the core API:

```typescript
// Policy: how reliably must this test pass?
type EvalPolicy = 'ALWAYS_PASSES' | 'USUALLY_PASSES';

// The evaluation case definition
interface EvalCase {
  name: string;
  prompt: string;
  files?: Record<string, string>; // Files to create in the test workspace
  setup?: (rig: TestRig) => Promise<void> | void; // Custom setup logic
  params?: {
    settings?: Record<string, unknown>; // Override settings for this test
    [key: string]: unknown;
  };
  timeout?: number; // Override default timeout (ms)
  approvalMode?: 'default' | 'auto_edit' | 'yolo' | 'plan';
  assert: (rig: TestRig, result: string) => Promise<void>;
}

// Entry point — wraps vitest's `it()` with policy-based skipping
function evalTest(policy: EvalPolicy, evalCase: EvalCase): void;
```

### Choosing a Policy

- **`ALWAYS_PASSES`** — The test must pass on every single run. Use for
  deterministic behaviors: tool invocation for unambiguous prompts, refusal
  triggers, file-not-modified assertions. These run in every CI pipeline.

- **`USUALLY_PASSES`** — The test should pass most of the time but may have
  occasional model variance. Use for behaviors that depend on response quality,
  reasoning chains, or ambiguous prompts. These run nightly (with `RUN_EVALS=1`)
  and serve as quality trendlines.

**Rule of thumb:** Start with `USUALLY_PASSES`. After the eval passes
consistently in nightly runs (3+ consecutive runs, no failures), promote it to
`ALWAYS_PASSES`. See [evals/README.md](../../evals/README.md) for the promotion
process.

## Step-by-Step: Writing Your First Eval

### Step 1: Identify the Behavior

Pick a concrete, testable agent behavior. Good examples:

- "When the user asks 'What is the current price of AAPL stock?', the agent
  should use `google_web_search` rather than answering from training data."
- "When asked to fix a specific bug, the agent should call the `replace` edit
  tool."
- "When asked a factual question about an existing file, the agent should read
  the file first."

### Step 2: Create the Eval File

Create a new file in the `evals/` directory:

```
evals/your-behavior-name.eval.ts
```

Every eval file needs the Apache-2.0 license header and these imports:

```typescript
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';
```

If you need tool name constants, import them from `@google/gemini-cli-core`:

```typescript
import {
  WEB_SEARCH_TOOL_NAME, // 'google_web_search'
  WEB_FETCH_TOOL_NAME, // 'web_fetch'
  EDIT_TOOL_NAMES, // Set containing edit tool names
  READ_FILE_TOOL_NAME, // 'read_file'
} from '@google/gemini-cli-core';
```

### Step 3: Write Your EvalCase

```typescript
describe('Web search eval', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should use web search for real-time information',
    prompt: 'What are the latest headlines about AI today?',
    assert: async (rig, result) => {
      // Check that the agent called the web search tool
      const toolLogs = rig.readToolLogs();
      const searchCalls = toolLogs.filter(
        (log) => log.toolRequest.name === WEB_SEARCH_TOOL_NAME,
      );
      expect(searchCalls.length).toBeGreaterThanOrEqual(1);
    },
  });
});
```

### Step 4: Write Good Assertions

The `rig` parameter gives you access to:

| Method                             | Use For                                        |
| ---------------------------------- | ---------------------------------------------- |
| `rig.readToolLogs()`               | Get all tool invocations (name, args, success) |
| `rig.readFile('path')`             | Check file contents after agent runs           |
| `rig.waitForToolCall('tool_name')` | Wait for a specific tool to be called          |

**Do:**

- Assert on tool invocations (`rig.readToolLogs()`) — these are deterministic
- Assert on file state changes (`rig.readFile()`) — verifiable
- Assert that specific tools were NOT called (negative tests)

**Don't:**

- Assert on exact model output text — this is brittle and breaks on model
  updates
- Assert on the number of tokens or response length
- Use regex matching on model prose unless absolutely necessary

### Step 5: Run Locally

Run your specific eval file:

```bash
cd evals
RUN_EVALS=1 npx vitest run your-behavior-name.eval.ts
```

For `ALWAYS_PASSES` tests only (faster, no `RUN_EVALS` needed):

```bash
cd evals
npx vitest run your-behavior-name.eval.ts
```

### Step 6: Submit Your PR

Follow the [contribution guide](../../CONTRIBUTING.md):

1. Link your PR to an issue
2. Use Conventional Commits: `test: Add behavioral eval for [behavior]`
3. Run `npm run preflight` before submitting
4. Include the vitest output in your PR description

## Common Mistakes

1. **Asserting on exact model text.** Model outputs change across versions.
   Assert on tool calls and file state instead.

2. **Starting with `ALWAYS_PASSES`.** New evals should start at `USUALLY_PASSES`
   and be promoted after demonstrating stability.

3. **Overly complex prompts.** Keep prompts simple and unambiguous. If a human
   would find the prompt confusing, the model will too.

4. **Missing file setup.** If your eval tests file operations, always provide
   the files via the `files` field. The test workspace starts empty.

5. **Not running locally before submitting.** Evals hit the live Gemini API.
   Verify locally that your test passes before opening a PR.

## Resources

- [evals/README.md](../../evals/README.md) — Internal eval framework reference
- [evals/test-helper.ts](../../evals/test-helper.ts) — `evalTest()` and
  `EvalCase` source code
- [evals/answer-vs-act.eval.ts](../../evals/answer-vs-act.eval.ts) — Example of
  a well-structured eval with multiple test cases
- [CONTRIBUTING.md](../../CONTRIBUTING.md) — PR submission guidelines
