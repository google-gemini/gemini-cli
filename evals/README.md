# Behavioral Evals

Behavioral evaluations (evals) are tests designed to validate the agent's
behavior in response to specific prompts. They serve as a critical feedback loop
for changes to system prompts, tool definitions, and other model-steering
mechanisms, and as a tool for assessing feature reliability by model, and
preventing regressions.

> [!TIP] **Agent Automation**: If you are pair-programming with Gemini CLI, you
> can leverage the **behavioral-evals skill** to automate fixing failing tests
> or promoting incubation candidates.

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

## Best Practices

When designing behavioral evals, aim for scenarios that accurately reflect
real-world usage while remaining small and maintainable.

- **Realistic Complexity**: Evals should be complicated enough to be
  "realistic." They should operate on actual files and a source directory,
  mirroring how a real agent interacts with a workspace. Remember that the agent
  may behave differently in a larger codebase, so we want to avoid scenarios
  that are too simple to be realistic.
  - _Good_: An eval that provides a small, functional React component and asks
    the agent to add a specific feature, requiring it to read the file,
    understand the context, and write the correct changes.
  - _Bad_: An eval that simply asks the agent a trivia question or asks it to
    write a generic script without providing any local workspace context.
- **Maintainable Size**: Evals should be small enough to reason about and
  maintain. We probably can't check in an entire repo as a test case, though
  over time we will want these evals to mature into more and more realistic
  scenarios.
  - _Good_: A test setup with 2-3 files (e.g., a source file, a config file, and
    a test file) that isolates the specific behavior being evaluated.
  - _Bad_: A test setup containing dozens of files from a complex framework
    where the setup logic itself is prone to breaking.
- **Unambiguous and Reliable Assertions**: Assertions must be clear and specific
  to ensure the test passes for the right reason.
  - _Good_: Checking that a modified file contains a specific AST node or exact
    string, or verifying that a tool was called with with the right parameters.
  - _Bad_: Only checking for a tool call, which could happen for an unrelated
    reason. Expecting specific LLM output.
- **Fail First**: Have tests that failed before your prompt or tool change. We
  want to be sure the test fails before your "fix". It's pretty easy to
  accidentally create a passing test that asserts behaviors we get for free. In
  general, every eval should be accompanied by prompt change, and most prompt
  changes should be accompanied by an eval.
  - _Good_: Observing a failure, writing an eval that reliably reproduces the
    failure, modifying the prompt/tool, and then verifying the eval passes.
  - _Bad_: Writing an eval that passes on the first run and assuming your new
    prompt change was responsible.
- **Less is More**: Prefer fewer, more realistic tests that assert the major
  paths vs. more tests that are more unit-test like. These are evals, so the
  value is in testing how the agent works in a semi-realistic scenario.

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
  // New tests MUST start as USUALLY_PASSES and be promoted based on consistency metrics
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
2. **Monitoring**: The test must complete at least 7 nightly runs across all
   supported models.
3. **Promotion**: Promotion to `ALWAYS_PASSES` is conducted by the agent after
   verifying the 100% success rate requirement is met across many runs.

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

## Regression Check Scripts

The project includes several scripts to automate high-signal regression checking
in Pull Requests. These can also be run locally for debugging.

- **`scripts/get_trustworthy_evals.js`**: Analyzes nightly history to identify
  stable tests (80%+ aggregate pass rate).
- **`scripts/run_regression_check.js`**: Runs a specific set of tests using the
  "Best-of-4" logic and "Dynamic Baseline Verification".
- **`scripts/run_eval_regression.js`**: The main orchestrator that loops through
  models and generates the final PR report.

### Running Regression Checks Locally

You can simulate the PR regression check locally to verify your changes before
pushing:

```bash
# Run the full regression loop for a specific model
MODEL_LIST=gemini-3-flash-preview node scripts/run_eval_regression.js
```

To debug a specific failing test with the same logic used in CI:

```bash
# 1. Get the Vitest pattern for trustworthy tests
OUTPUT=$(node scripts/get_trustworthy_evals.js "gemini-3-flash-preview")

# 2. Run the regression logic for those tests
node scripts/run_regression_check.js "gemini-3-flash-preview" "$OUTPUT"
```

### The Regression Quality Bar

Because LLMs are non-deterministic, the PR regression check uses a high-signal
probabilistic approach rather than a 100% pass requirement:

1.  **Trustworthiness (60/80 Filter):** Only tests with a proven track record
    are run. A test must score at least **60% (2/3)** every single night and
    maintain an **80% aggregate** pass rate over the last 6 days.
2.  **The 50% Pass Rule:** In a PR, a test is considered a **Pass** if the model
    correctly performs the behavior at least half the time (**2 successes** out
    of up to 4 attempts).
3.  **Dynamic Baseline Verification:** If a test fails in a PR (e.g., 0/3), the
    system automatically checks the `main` branch. If it fails there too, it is
    marked as **Pre-existing** and cleared for the PR, ensuring you are only
    blocked by regressions caused by your specific changes.

## Fixing Evaluations

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

If an evaluation is failing or has a regressed pass rate, ask the agent to
investigate and fix the issue using the **behavioral-evals skill**. The agent
will automate the following process:

1.  **Investigate**: Fetch the latest results from the nightly workflow using
    the `gh` CLI, identify the failing test, and review test trajectory logs in
    `evals/logs`.
2.  **Fix**: Suggest and apply targeted fixes to the prompt or tool definitions.
    It prioritizes minimal changes to `prompt.ts` and tool instructions,
    avoiding changing the test itself unless necessary.
3.  **Verify**: Re-run the test locally across multiple models to ensure
    stability.
4.  **Report**: Provide a summary of the success rate.

When investigating failures manually, you can enable verbose agent logs by
setting the `GEMINI_DEBUG_LOG_FILE` environment variable.

### Best practices

It's highly recommended to manually review and/or ask the agent to iterate on
any prompt changes, even if they pass all evals. The prompt should prefer
positive traits ('do X') and resort to negative traits ('do not do X') only when
unable to accomplish the goal with positive traits. Gemini is quite good at
instrospecting on its prompt when asked the right questions.

## Promoting evaluations

Evaluations must be promoted from `USUALLY_PASSES` to `ALWAYS_PASSES` by the
agent to ensure that the 100% success rate requirement is empirically met.

The agent automates the promotion by:

1.  **Investigating**: Analyzing the results of the last 7 nightly runs on the
    `main` branch.
2.  **Criteria Check**: Ensuring tests passed 100% of the time for ALL enabled
    models.
3.  **Promotion**: Updating the test file's policy to `ALWAYS_PASSES`.
4.  **Verification**: Running the promoted test locally to ensure correctness.
