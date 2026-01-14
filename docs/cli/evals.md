# Behavioral Evals

This document describes how to create and run behavioral evaluations for Gemini
CLI.

## Creating an Evaluation

Evaluations are located in the `evals` directory. Each evaluation is a Vitest
test file that uses the `evalTest` function from `evals/test-helper.ts`.

### `evalTest`

The `evalTest` function is a helper that runs a single evaluation case. It takes
two arguments:

1. `policy`: The consistency expectation for this test (`'ALWAYS_PASSES'` or
   `'USUALLY_PASSES'`).
2. `evalCase`: An object defining the test case.

#### Policies

- `ALWAYS_PASSES`: Tests expected to pass 100% of the time. These are typically
  trivial and test basic functionality. These run in every CI.
- `USUALLY_PASSES`: Tests expected to pass most of the time but may have some
  flakiness due to non-deterministic behaviors. These are skipped unless
  explicitly requested.

#### `EvalCase` Properties

- `name`: The name of the evaluation case.
- `prompt`: The prompt to send to the model.
- `params`: An optional object with parameters to pass to the test rig (e.g.,
  settings).
- `assert`: An async function that takes the test rig and the result of the run
  and asserts that the result is correct.
- `log`: An optional boolean that, if set to `true`, will log the tool calls to
  a file in the `evals/logs` directory.

### Example

```typescript
import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('my_feature', () => {
  evalTest('ALWAYS_PASSES', {
    name: 'should do something',
    prompt: 'do it',
    assert: async (rig, result) => {
      // assertions
    },
  });
});
```

## Running Evaluations

### Always Passing Evals

To run the evaluations that are expected to always pass (CI safe):

```bash
npm run test:always_passing_evals
```

### All Evals

To run all evaluations, including those that may be flaky ("usually passes"):

```bash
npm run test:all_evals
```

This command sets the `RUN_EVALS` environment variable to `1`, which enables the
`USUALLY_PASSES` tests.
