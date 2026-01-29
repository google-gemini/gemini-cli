# Proposal: A Two-Phase Plan to Automate Changelog Updates

## Executive summary

Our current process for updating changelogs is manual, time-consuming, and prone
to error. This document proposes a two-phase plan to automate this process.

- **Phase 1 (Semi-automation)** will use Gemini CLI to generate changelog
  updates from manually provided release notes, reducing update time by an
  estimated 75-80%.
- **Phase 2 (Full automation)** will integrate this process with GitHub Actions
  to create a zero-touch workflow that triggers on new releases, saving nearly
  100% of the manual effort.

This automation will free up significant engineering resources, improve the
consistency and quality of our documentation, and allow developers to focus on
core product development.

## The problem: The high cost of manual changelog updates

Our rapid release cycle, which often includes multiple releases per week, has
made the manual process of updating our changelog a significant operational
bottleneck.

- **Current process:** For each new release, a developer must manually:
  1.  Gather all relevant pull requests and commit messages.
  2.  Summarize these changes into a "Highlights" section for
      `docs/changelogs/latest.md` and `docs/changelogs/index.md`.
  3.  Format these summaries differently for each document.
  4.  Update the full "What's Changed" list in `latest.md`.
  5.  Ensure all formatting and style guide rules are met.

- **Estimated cost:** This process takes approximately 1-2 hours of engineering
  effort per release. With 2-3 releases per week, this amounts to 4-6 hours per
  week, or 16-24 hours per month, of valuable engineering time spent on a
  repetitive, manual task.

## Proposed solution: A two-phase automation plan

We propose a two-phase automation plan to eliminate the manual effort required
for changelog updates.

### Phase 1: Semi-automated changelog generation

This phase uses our own tooling, Gemini CLI, to handle the most time-consuming
part of the process: writing and formatting the changelog content.

- **Workflow:** A developer will invoke a headless Gemini CLI command, providing
  the new version number, release date, and the raw changelog data from the
  release notes. Using `changelog-update-sop.md` as a detailed set of
  instructions, Gemini CLI will perform the analysis and file updates.
- **Supporting document:** The foundation for this phase has already been
  created in `docs/process/changelog-update-sop.md`, which outlines the exact
  steps for the AI to follow.
- **Benefits and time savings:**
  - **Reduced manual effort:** Eliminates the need for manual summarization,
    formatting, and cross-referencing.
  - **Improved consistency:** Ensures all changelogs adhere to the same format
    and style.
  - **Estimated time saved:** We estimate this will reduce the time for each
    update from 1-2 hours to approximately 15-20 minutes (a 75-80% reduction).

### Phase 2: Fully automated changelog workflow

This phase builds on Phase 1 to create a zero-touch, fully integrated workflow
that requires no manual intervention other than reviewing the final pull
request.

- **Workflow:** A GitHub Action will automatically trigger when a new "preview"
  or "stable" release is published. This action will execute a script that runs
  the same headless Gemini CLI command from Phase 1, using the release
  information from the GitHub event payload. Once the files are updated, the
  workflow will automatically create a pull request with the changes.
- **Supporting document:** A detailed implementation plan for this phase is
  available in `docs/process/automated-changelog-workflow.md`.
- **Benefits and time savings:**
  - **Zero manual effort:** The entire process, from trigger to pull request, is
    automated.
  - **Increased velocity:** Changelog updates are created instantly upon
    release.
  - **Estimated time saved:** This will reduce the manual effort to near-zero,
    saving the full 1-2 hours per release.

## Estimated impact and ROI

The following table summarizes the estimated time savings:

| Phase                  | Manual Effort per Release | Estimated Time Saved per Release | Weekly Time Saved (avg. 2.5 releases/week) |
| :--------------------- | :------------------------ | :------------------------------- | :----------------------------------------- |
| **Current Process**    | 1.5 hours (avg)           | 0 hours                          | 3.75 hours                                 |
| **Phase 1 Completion** | 0.25 hours (avg)          | 1.25 hours (83% reduction)       | 3.125 hours                                |
| **Phase 2 Completion** | < 5 minutes (for review)  | ~1.5 hours (95%+ reduction)      | ~3.75 hours                                |

By implementing both phases, we can reclaim over 15 hours of engineering time
per month.

## Request for resources and next steps

The groundwork and planning, as detailed in the supporting documents, are
already complete. We are requesting stakeholder approval and the allocation of
engineering resources to implement the script and GitHub Action for Phase 2.
Phase 1 is ready for immediate adoption.
