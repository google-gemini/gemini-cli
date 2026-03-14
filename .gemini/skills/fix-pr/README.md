# Fix PR Skill

The `fix-pr` skill enables the Gemini CLI agent to autonomously and iteratively
fix a pull request until it is mergeable and passes all quality checks.

## When to use fix-pr

-   **Autonomous fixing**: Move a PR from failing to green without manual
    intervention.
-   **Iterative loops**: Automatically handle the "fix -> push -> wait for CI"
    cycle.
-   **Context preservation**: Maintain context across multiple fix attempts.

## Sync vs Offload

This skill is designed to be versatile:

-   **Synchronous mode**: Activate the skill in your current terminal for
    quick fixes or conflict resolution.
-   **Offloaded mode**: Use `npm run offload <PR> fix` to launch an iterative
    fix loop on a remote workstation, keeping your local machine free.

## Objective

The goal is to move a PR from its current state (failing tests, merge conflicts,
or unaddressed comments) to a "Ready to Merge" state.

## Technical details

The skill uses the `gh` CLI and a specialized `wait-for-ci` utility to monitor
remote status. It is governed by the project's standard security policies.
