# Behavioral Evaluation Command

## Purpose

The `gemini eval` command provides a lightweight behavioral evaluation harness
for running structured test cases against the Gemini CLI. It enables:

- Evaluating instruction-following behavior
- Detecting hallucination patterns via forbidden token checks
- Enforcing output constraints
- Running regression tests for prompts

## Design Philosophy

- **Minimal**: Under 300 lines of new code, no new dependencies.
- **Token-based validation**: Uses `must_include` / `must_not_include` string
  matching. No LLM-as-judge, no ML scoring.
- **Non-invasive**: Optional command that does not modify core execution flow.
- **Extensible**: The test case format and scoring can be extended in future
  versions.

## Usage

```bash
gemini eval <path_to_test_case.json>
```

The command reads a JSON file containing one or more test cases, sends each test
case's `input` as a prompt to Gemini in headless mode, and validates the
response against the expected behavior constraints.

Exit code is `0` if all tests pass, `1` if any test fails.

## Test Case Format

A test case file is a JSON object (or array of objects) with this structure:

```json
{
  "name": "Basic instruction following",
  "input": "Write a function that adds two numbers.",
  "expected_behavior": {
    "must_include": ["function", "return"],
    "must_not_include": ["I am an AI"]
  }
}
```

### Fields

| Field                                | Type     | Required | Description                                                    |
| ------------------------------------ | -------- | -------- | -------------------------------------------------------------- |
| `name`                               | string   | Yes      | Human-readable test name                                       |
| `input`                              | string   | Yes      | Prompt to send to the model                                    |
| `expected_behavior`                  | object   | Yes      | Validation constraints                                         |
| `expected_behavior.must_include`     | string[] | No       | Tokens that must appear in the response (case-insensitive)     |
| `expected_behavior.must_not_include` | string[] | No       | Tokens that must not appear in the response (case-insensitive) |

### Multiple Test Cases

Pass an array of test case objects in a single file:

```json
[
  {
    "name": "Code generation",
    "input": "Write a hello world function in Python.",
    "expected_behavior": {
      "must_include": ["def", "print"],
      "must_not_include": ["error"]
    }
  },
  {
    "name": "Refusal check",
    "input": "Explain how variables work in JavaScript.",
    "expected_behavior": {
      "must_include": ["var", "let", "const"],
      "must_not_include": ["I cannot"]
    }
  }
]
```

## Output

```
Running Behavioral Evaluation...

  Test: Basic instruction following
    ✓ must_include: "function"
    ✓ must_include: "return"
    ✓ must_not_include: "I am an AI"
  Score: 3/3
  Status: PASS
```

Each check is displayed with a pass (✓) or fail (✗) indicator, followed by the
aggregate score and overall status.

## Future Extension Possibilities

- **Regex matching**: Support regex patterns in addition to string tokens.
- **Batch mode**: Run entire directories of test case files.
- **JSON output**: Machine-readable results for CI integration.
- **Scoring thresholds**: Configure minimum pass rates.
- **Response caching**: Cache model responses for faster re-evaluation.
