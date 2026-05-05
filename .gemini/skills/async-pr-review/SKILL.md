---
name: async-pr-review
description: Trigger this skill when the user wants to start an asynchronous PR review, run background checks on a PR, or check the status of a previously started async PR review.
---

# Async PR Review

This skill provides a set of tools to asynchronously review a Pull Request. It will create a background job to run the project's preflight checks, execute Gemini-powered test plans, and perform a comprehensive code review using custom prompts.

This skill is designed to showcase an advanced "Agentic Asynchronous Pattern":
1.  **Native Background Shells vs Headless Inference**: While Gemini CLI can natively spawn and detach background shell commands (using the `run_shell_command` tool with `is_background: true`), a standard bash background job cannot perform LLM inference. To conduct AI-driven code reviews and test generation in the background, the shell script *must* invoke the `gemini` executable headlessly using `-p`. This offloads the AI tasks to independent worker agents.
2.  **Dynamic Git Scoping**: The review scripts avoid hardcoded paths. They use `git rev-parse --show-toplevel` to automatically resolve the root of the user's current project.
3.  **Ephemeral Worktrees**: Instead of checking out branches in the user's main workspace, the skill provisions temporary git worktrees in `.gemini/tmp/async-reviews/pr-<number>`. This prevents git lock conflicts and namespace pollution.
4.  **Agentic Evaluation (`check-async-review.sh`)**: The check script outputs clean JSON/text statuses for the main agent to parse. The interactive agent itself synthesizes the final assessment dynamically from the generated log files.

## Workflow

1.  **Determine Action**: Establish whether the user wants to start a new async review or check the status of an existing one.
    *   If the user says "start an async review for PR #123" or similar, proceed to **Start Review**.
    *   If the user says "check the status of my async review for PR #123" or similar, proceed to **Check Status**.

### Start Review

If the user wants to start a new async PR review:

1.  Ask the user for the PR number if they haven't provided it.
2.  Execute the `async-review.sh` script, passing the PR number as the first argument. Be sure to run it with the `is_background` flag set to true to ensure it immediately detaches.
    ```bash
    .gemini/skills/async-pr-review/scripts/async-review.sh <PR_NUMBER>
    ```
3.  Inform the user that the tasks have started successfully and they can check the status later.

### Check Status

If the user wants to check the status or view the final assessment of a previously started async review:

1.  Ask the user for the PR number if they haven't provided it.
2.  Execute the `check-async-review.sh` script, passing the PR number as the first argument:
    ```bash
    .gemini/skills/async-pr-review/scripts/check-async-review.sh <PR_NUMBER>
    ```
3.  **Evaluate Output**: Read the output from the script.
    *   If the output contains `STATUS: IN_PROGRESS`, tell the user which tasks are still running.
    *   If the output contains `STATUS: COMPLETE`, use your file reading tools (`read_file`) to retrieve the contents of `final-assessment.md`, `review.md`, `pr-diff.diff`, `npm-test.log`, and `test-execution.log` files from the `LOG_DIR` specified in the output.
    *   **Final Assessment**: Read those files, synthesize their results, and give the user a concise recommendation on whether the PR builds successfully, passes tests, and if you recommend they approve it based on the review.