---
name: async-pr-review
description: Trigger this skill when the user wants to start an asynchronous PR review, run background checks on a PR, or check the status of a previously started async PR review.
---

# Async PR Review

This skill provides a set of tools to asynchronously review a Pull Request. It will create a background job to run the project's preflight checks, execute Gemini-powered test plans, and perform a comprehensive code review using custom prompts.

## Workflow

1.  **Determine Action**: Establish whether the user wants to start a new async review or check the status of an existing one.
    *   If the user says "start an async review for PR #123" or similar, proceed to **Start Review**.
    *   If the user says "check the status of my async review for PR #123" or similar, proceed to **Check Status**.

### Start Review

If the user wants to start a new async PR review:

1.  Ask the user for the PR number if they haven't provided it.
2.  Execute the `async-review.sh` script, passing the PR number as the first argument:
    ```bash
    .gemini/skills/async-pr-review/scripts/async-review.sh <PR_NUMBER>
    ```
3.  The script will start the review tasks in the background and print out the paths to the logs. Inform the user that the tasks have started successfully.

### Check Status

If the user wants to check the status or view the final assessment of a previously started async review:

1.  Ask the user for the PR number if they haven't provided it.
2.  Execute the `check-async-review.sh` script, passing the PR number as the first argument:
    ```bash
    .gemini/skills/async-pr-review/scripts/check-async-review.sh <PR_NUMBER>
    ```
3.  This script will launch a live status dashboard. Once all tasks are complete, it will automatically query a new instance of Gemini for a final assessment and provide a recommendation on whether to approve the PR. Let the script run in the user's terminal.