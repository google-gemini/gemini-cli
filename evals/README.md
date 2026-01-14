# Behavioral Evals

Behavioral evaluations (evals) are tests designed to validate the agent's
behavior in response to specific prompts. They serve as a critical feedback loop
for changes to system prompts, tool definitions, and other model-steering
mechanisms.

## Why Behavioral Evals?

Unlike traditional **integration tests** which verify that the system functions
correctly (e.g., "does the file writer actually write to disk?"), behavioral
evals verify that the model _chooses_ to take the correct action (e.g., "does
the model decide to write to disk when asked to save code?").

They are also distinct from broad **industry benchmarks** (like SWE-bench).
While benchmarks measure general capabilities across complex challenges, our
behavioral evals focus on specific, granular behaviors relevant to the Gemini
CLI's features.

### Key Characteristics

- **Feedback Loop**: They help us understand how changes to prompts or tools
  affect the model's decision-making.
  - _Did a change to the system prompt make the model less likely to use tool
    X?_
  - _Did a new tool definition confuse the model?_
- **Regression Testing**: They prevent regressions in model steering.
- **Non-Determinism**: Unlike unit tests, LLM behavior can be non-deterministic.
  We distinguish between behaviors that should be robust (`ALWAYS_PASSES`) and
  those that are generally reliable but might occasionally vary
  (`USUALLY_PASSES`).

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

Policies control how strictly a test is validated. Tests should generally use
the ALWAYS_PASSES policy to offer the strictest guarantees.

USUALLY_PASSES exists to enable assertion of less consistent or aspirational
behaviors.

- `ALWAYS_PASSES`: Tests expected to pass 100% of the time. These are typically
  trivial and test basic functionality. These run in every CI.
- `USUALLY_PASSES`: Tests expected to pass most of the time but may have some
  flakiness due to non-deterministic behaviors. These are run nightly and used
  to track the health of the product from build to build.

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

## Reporting

Results for evaluations are available on GitHub Actions:

- **CI Evals**: Included in the
  [E2E (Chained)](https://github.com/google-gemini/gemini-cli/actions/workflows/chained_e2e.yml)
  workflow. These must pass 100% for every PR.
- **Nightly Evals**: Run daily via the
  [Evals: Nightly](https://github.com/google-gemini/gemini-cli/actions/workflows/evals-nightly.yml)
  workflow. These track the long-term health and stability of model steering.

### Nightly Report Format

The nightly workflow executes the full evaluation suite multiple times
(currently 3 attempts) to account for non-determinism. These results are
aggregated into a **Nightly Summary** attached to the workflow run.

#### How to interpret the report:

- **Pass Rate (%)**: Each cell represents the percentage of successful runs for
  a specific test in that workflow instance.
- **History**: The table shows the pass rates for the last 10 nightly runs,
  allowing you to identify if a model's behavior is trending towards
  instability.
- **Total Pass Rate**: An aggregate metric of all evaluations run in that batch.

A significant drop in the pass rate for a `USUALLY_PASSES` test—even if it
doesn't drop to 0%—often indicates that a recent change to a system prompt or
tool definition has made the model's behavior less reliable.

You may be able to investigate the regression using Gemini CLI by giving it the
link to the runs before and after the change and the name of the test and asking
it to investigate what changes may have impacted the test.
