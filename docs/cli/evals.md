# Behavioral Evals

This document describes how to create and run behavioral evaluations for Gemini
CLI.

## Creating an Evaluation

Evaluations are located in the `evals` directory. Each evaluation is a Vitest
test file that uses the `runEval` and `conditionalDescribe` functions from
`evals/test-helper.ts`.

### `conditionalDescribe`

The `conditionalDescribe` function is a wrapper around the Vitest `describe`
function. It will only run the tests if the `RUN_EVALS` environment variable is
set to `true`.

### `runEval`

The `runEval` function is a helper function that runs a single evaluation case.
It takes an object with the following properties:

- `name`: The name of the evaluation case.
- `prompt`: The prompt to send to the model.
- `params`: An optional object with parameters to pass to the test rig.
- `assert`: An async function that takes the test rig and the result of the run
  and asserts that the result is correct.
- `log`: An optional boolean that, if set to `true`, will log the tool calls to
  a file in the `evals/logs` directory.

## Running Evaluations

To run the evaluations, you must set the `RUN_EVALS` environment variable to
`true`. You can then run the tests using the `test:evals` script:

```bash
RUN_EVALS=true npm run test:evals
```
