#!/bin/bash

# bisect_run.sh
# Automated test script for git bisect run.
# Expects the test command as the first argument.

TEST_COMMAND=$1

if [ -z "$TEST_COMMAND" ]; then
  echo "Error: No test command provided."
  exit 125 # Skip this commit
fi

echo "Running test: $TEST_COMMAND"

# Execute the test command
eval "$TEST_COMMAND"
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo ">>> COMMIT IS GOOD"
  exit 0
else
  echo ">>> COMMIT IS BAD (Exit Code: $EXIT_CODE)"
  exit 1
fi
