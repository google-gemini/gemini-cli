# Integration Tests

This document provides a detailed overview of the integration testing framework used in this project.

## Overview

The integration tests are designed to validate the end-to-end functionality of the Gemini CLI. They execute the built binary in a controlled environment and verify that it behaves as expected when interacting with the file system.

These tests are located in the `integration-tests` directory and are run using a custom test runner that provides a consistent and configurable testing environment.

## Running the Tests

The integration tests are not run as part of the default `npm run test` command. They must be run explicitly using the `npm run test:integration:sandbox:none` script.

Also as a developer for full context a shortcut can be found at

```bash
npm run test:e2e
```

## Running a specfic set of tests

To run a 1 or more test files you can use `npm run <integration test command> <file_name1> ....` where <integration test command> is any of `test:e2e` or `test:integration*` and <file_name> is any of the files in `integration/<file_name>.test.js`

```bash
npm run test:e2e write_file
```

### Running a Single Test by Name

To run a single test by its name, use the `--test-name-pattern` flag:

```bash
npm run test:e2e -- --test-name-pattern "reads a file"
```

### Running All Tests

To run the entire suite of integration tests, use the following command:

```bash
npm run test:integration:all
```

### Sandbox Matrix

The `all` command will run tests for `no sandboxing`, `docker` and `podman`.
Each individual type can be run as

```bash
npm run test:integration:all
```

```bash
npm run test:integration:sandbox-none
```

```bash
npm run test:integration:sandbox:docker
```

```bash
npm run test:integration:sandbox:podman
```

## Diagnostics

The integration test runner provides several options for diagnostics to help track down test failures.

### Keeping Test Output

You can preserve the temporary files created during a test run for inspection. This is useful for debugging issues with file system operations.

To keep the test output, you can either use the `--keep-output` flag or set the `KEEP_OUTPUT` environment variable to `true`.

```bash
# Using the flag
npm run test:integration:sandbox:none -- --keep-output

# Using the environment variable
KEEP_OUTPUT=true npm run test:integration:sandbox:none
```

When output is kept, the test runner will print the path to the unique directory for the test run.

### Verbose Output

For more detailed debugging, the `--verbose` flag will stream the real-time output from the `gemini` command to the console. This is useful for observing the command's behavior as it runs.

```bash
npm run test:integration:sandbox:none -- --verbose
```

When using `--verbose` with `--keep-output`, the output is streamed to the console and also saved to a log file within the test's temporary directory.

The verbose output is formatted to clearly identify the source of the logs:

```
--- TEST: <file-name-without-js>:<test-name> ---
... output from the gemini command ...
--- END TEST: <file-name-without-js>:<test-name> ---
```

## Linting and Formatting

To ensure code quality and consistency, the integration test files are linted as part of the main build process. You can also manually run the linter and auto-fixer.

### Running the Linter

To check for linting errors, run the following command:

```bash
npm run lint
```

### Automatically Fixing Issues

To automatically fix any fixable linting errors, run:

```bash
npm run lint --fix
```

## Directory Structure

The integration tests create a unique directory for each test run inside the `.integration-tests` directory. Within this directory, a subdirectory is created for each test file, and within that, a subdirectory is created for each individual test case.

This structure makes it easy to locate the artifacts for a specific test run, file, or case.

```
.integration-tests/
└── <run-id>/
    └── <test-file-name>.test.js/
        └── <test-case-name>/
            ├── output.log
            └── ...other test artifacts...
```

## Continuous Integration

To ensure the integration tests are always run, a GitHub Actions workflow is defined in `.github/workflows/e2e.yml`. This workflow automatically runs the integration tests on every pull request and push to the `main` branch.

The workflow uses a matrix strategy to run the tests in different sandboxing environments:

- `sandbox:none`: Runs the tests without any sandboxing.
- `sandbox:docker`: Runs the tests in a Docker container.
- `sandbox:podman`: Runs the tests in a Podman container.

This ensures that the Gemini CLI is tested across a variety of environments, improving its robustness and reliability.
