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

Policies control how strictly a test is validated.

- `ALWAYS_PASSES`: Tests expected to pass 100% of the time. These are typically
  trivial and test basic functionality. These run in every CI and can block PRs
  on failure.
- `USUALLY_PASSES`: Tests expected to pass most of the time but may have some
  flakiness due to non-deterministic behaviors. These are run nightly and used
  to track the health of the product from build to build.

**All new behavioral evaluations must be created with the `USUALLY_PASSES`
policy.** A subset that prove to be highly stable over time may be promoted to
`ALWAYS_PASSES`. For more information, see
[Test promotion process](#test-promotion-process).

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
  // New tests MUST start as USUALLY_PASSES and be promoted via /promote-behavioral-eval
  evalTest('USUALLY_PASSES', {
    name: 'should do something',
    prompt: 'do it',
    assert: async (rig, result) => {
      // assertions
    },
  });
});
```

## Running Evaluations

First, build the bundled Gemini CLI. You must do this after every code change.

```bash
npm run build
npm run bundle
```

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

## Ensuring Eval is Stable Prior to Check-in

The
[Evals: Nightly](https://github.com/google-gemini/gemini-cli/actions/workflows/evals-nightly.yml)
run is considered to be the source of truth for the quality of an eval test.
Each run of it executes a test 3 times in a row, for each supported model. The
result is then scored 0%, 33%, 66%, or 100% respectively, to indicate how many
of the individual executions passed.

Googlers can schedule a manual run against their branch by clicking the link
above.

Tests should score at least 66% with key models including Gemini 3.1 pro, Gemini
3.0 pro, and Gemini 3 flash prior to check in and they must pass 100% of the
time before they are promoted.

## Test promotion process

To maintain a stable and reliable CI, all new behavioral evaluations follow a
mandatory deflaking process.

1. **Incubation**: You must create all new tests with the `USUALLY_PASSES`
   policy. This lets them be monitored in the nightly runs without blocking PRs.
2. **Monitoring**: The test must complete at least 10 nightly runs across all
   supported models.
3. **Promotion**: Promotion to `ALWAYS_PASSES` happens exclusively through the
   `/promote-behavioral-eval` slash command. This command verifies the 100%
   success rate requirement is met across many runs before updating the test
   policy.

This promotion process is essential for preventing the introduction of flaky
evaluations into the CI.

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
- **History**: The table shows the pass rates for the last 7 nightly runs,
  allowing you to identify if a model's behavior is trending towards
  instability.
- **Total Pass Rate**: An aggregate metric of all evaluations run in that batch.

A significant drop in the pass rate for a `USUALLY_PASSES` test—even if it
doesn't drop to 0%—often indicates that a recent change to a system prompt or
tool definition has made the model's behavior less reliable.

## Fixing Evaluations

If an evaluation is failing or has a regressed pass rate, you can use the
`/fix-behavioral-eval` command within Gemini CLI to help investigate and fix the
issue.

### `/fix-behavioral-eval`

This command is designed to automate the investigation and fixing process for
failing evaluations. It will:

1.  **Investigate**: Fetch the latest results from the nightly workflow using
    the `gh` CLI, identify the failing test, and review test trajectory logs in
    `evals/logs`.
2.  **Fix**: Suggest and apply targeted fixes to the prompt or tool definitions.
    It prioritizes minimal changes to `prompt.ts`, tool instructions, and
    modules that contribute to the prompt. It generally tries to avoid changing
    the test itself.
3.  **Verify**: Re-run the test 3 times across multiple models (e.g., Gemini
    3.0, Gemini 3 Flash, Gemini 2.5 Pro) to ensure stability and calculate a
    success rate.
4.  **Report**: Provide a summary of the success rate for each model and details
    on the applied fixes.

To use it, run:

```bash
gemini /fix-behavioral-eval
```

You can also provide a link to a specific GitHub Action run or the name of a
specific test to focus the investigation:

```bash
gemini /fix-behavioral-eval https://github.com/google-gemini/gemini-cli/actions/runs/123456789
```

When investigating failures manually, you can also enable verbose agent logs by
setting the `GEMINI_DEBUG_LOG_FILE` environment variable.

### Best practices

It's highly recommended to manually review and/or ask the agent to iterate on
any prompt changes, even if they pass all evals. The prompt should prefer
positive traits ('do X') and resort to negative traits ('do not do X') only when
unable to accomplish the goal with positive traits. Gemini is quite good at
instrospecting on its prompt when asked the right questions.

## Promoting evaluations

Evaluations must be promoted from `USUALLY_PASSES` to `ALWAYS_PASSES`
exclusively using the `/promote-behavioral-eval` slash command. Manual promotion
is not allowed to ensure that the 100% success rate requirement is empirically
met.

### `/promote-behavioral-eval`

This command automates the promotion of stable tests by:

1.  **Investigating**: Analyzing the results of the last 7 nightly runs on the
    `main` branch using the `gh` CLI.
2.  **Criteria Check**: Identifying tests that have passed 100% of the time for
    ALL enabled models across the entire 7-run history.
3.  **Promotion**: Updating the test file's policy from `USUALLY_PASSES` to
    `ALWAYS_PASSES`.
4.  **Verification**: Running the promoted test locally to ensure correctness.

To run it:

```bash
gemini /promote-behavioral-eval
```
