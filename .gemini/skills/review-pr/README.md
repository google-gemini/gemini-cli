# Review PR Skill

The `review-pr` skill enables the Gemini CLI agent to conduct high-fidelity,
behavioral code reviews that go beyond simple static analysis.

## When to use review-pr

-   **Deep verification**: Verify that a feature actually works by executing
    it in a live environment.
-   **Infrastructure awareness**: Leverage build and CI results to focus on
    empirical proof of functionality.
-   **Interactive collaboration**: Discuss findings and explore edge cases
    with the agent in real-time.

## Sync vs Offload

This skill supports two primary modes:

-   **Synchronous mode**: Activate the skill locally for quick, high-level
    analysis of a peer's PR.
-   **Offloaded mode**: Use `npm run offload <PR> review` to conduct a
    full-scale behavioral review on a remote workstation with parallelized
    infrastructure validation.

## Objective

Conduct a thorough review that involves physically proving the feature works
through terminal scripts and command execution.

## Technical details

The skill assumes the infrastructure (build and CI) is already being validated
and focuses on empirical proofs. It uses the `extract-failures.ts` utility to
automatically identify regressions in CI logs.
