# Automation and Triage Processes

This document provides a detailed overview of the automated processes we use to manage and triage issues and pull requests. Our goal is to provide prompt feedback and ensure that contributions are reviewed and integrated efficiently. Understanding this automation will help you as a contributor know what to expect and how to best interact with our repository bots.

## Guiding Principle: Issues and Pull Requests

First and foremost, almost every Pull Request (PR) should be linked to a corresponding Issue. The issue describes the "what" and the "why" (the bug or feature), while the PR is the "how" (the implementation). This separation helps us track work, prioritize features, and maintain clear historical context. Our automation is built around this principle.

---

## Detailed Automation Workflows

Here is a breakdown of the specific automation workflows that run in our repository.

### 1. When you open an Issue: `Automated Issue Triage`

This is the first bot you will interact with when you create an issue. Its job is to perform an initial analysis and apply the correct labels.

- **Workflow File**: `.github/workflows/gemini-automated-issue-triage.yml`
- **When it runs**: Immediately after an issue is created or reopened.
- **What it does**:
  - It uses a Gemini model to analyze the issue's title and body against a detailed set of guidelines.
  - **Applies one `area/*` label**: Categorizes the issue into a functional area of the project (e.g., `area/ux`, `area/models`, `area/platform`).
  - **Applies one `kind/*` label**: Identifies the type of issue (e.g., `kind/bug`, `kind/enhancement`, `kind/question`).
  - **Applies one `priority/*` label**: Assigns a priority from P0 (critical) to P3 (low) based on the described impact.
  - **May apply `status/need-information`**: If the issue lacks critical details (like logs or reproduction steps), it will be flagged for more information.
  - **May apply `status/need-retesting`**: If the issue references a CLI version that is more than six versions old, it will be flagged for retesting on a current version.
- **What you should do**:
  - Fill out the issue template as completely as possible. The more detail you provide, the more accurate the triage will be.
  - If the `status/need-information` label is added, please provide the requested details in a comment.

### 2. When you open a Pull Request: `Continuous Integration (CI)`

This workflow ensures that all changes meet our quality standards before they can be merged.

- **Workflow File**: `.github/workflows/ci.yml`
- **When it runs**: On every push to a pull request.
- **What it does**:
  - **Lint**: Checks that your code adheres to our project's formatting and style rules.
  - **Test**: Runs our full suite of automated tests across macOS, Windows, and Linux, and on multiple Node.js versions. This is the most time-consuming part of the CI process.
  - **Post Coverage Comment**: After all tests have successfully passed, a bot will post a comment on your PR. This comment provides a summary of how well your changes are covered by tests.
- **What you should do**:
  - Ensure all CI checks pass. A green checkmark ✅ will appear next to your commit when everything is successful.
  - If a check fails (a red "X" ❌), click the "Details" link next to the failed check to view the logs, identify the problem, and push a fix.

### 3. Ongoing Triage for Pull Requests: `PR Auditing and Label Sync`

This workflow runs periodically to ensure all open PRs are correctly linked to issues and have consistent labels.

- **Workflow File**: `.github/workflows/gemini-scheduled-pr-triage.yml`
- **When it runs**: Every 15 minutes on all open pull requests.
- **What it does**:
  - **Checks for a linked issue**: The bot scans your PR description for a keyword that links it to an issue (e.g., `Fixes #123`, `Closes #456`).
  - **Adds `status/need-issue`**: If no linked issue is found, the bot will add the `status/need-issue` label to your PR. This is a clear signal that an issue needs to be created and linked.
  - **Synchronizes labels**: If an issue _is_ linked, the bot ensures the PR's labels perfectly match the issue's labels. It will add any missing labels and remove any that don't belong, and it will remove the `status/need-issue` label if it was present.
- **What you should do**:
  - **Always link your PR to an issue.** This is the most important step. Add a line like `Resolves #<issue-number>` to your PR description.
  - This will ensure your PR is correctly categorized and moves through the review process smoothly.

### 4. Ongoing Triage for Issues: `Scheduled Issue Triage`

This is a fallback workflow to ensure that no issue gets missed by the triage process.

- **Workflow File**: `.github/workflows/gemini-scheduled-issue-triage.yml`
- **When it runs**: Every hour on all open issues.
- **What it does**:
  - It actively seeks out issues that either have no labels at all or still have the `status/need-triage` label.
  - It then triggers the same powerful Gemini-based analysis as the initial triage bot to apply the correct labels.
- **What you should do**:
  - You typically don't need to do anything. This workflow is a safety net to ensure every issue is eventually categorized, even if the initial triage fails.

### 5. Release Automation

This workflow handles the process of packaging and publishing new versions of the Gemini CLI.

- **Workflow File**: `.github/workflows/release.yml`
- **When it runs**: On a daily schedule for "nightly" releases, and manually for official patch/minor releases.
- **What it does**:
  - Automatically builds the project, bumps the version numbers, and publishes the packages to npm.
  - Creates a corresponding release on GitHub with generated release notes.
- **What you should do**:
  - As a contributor, you don't need to do anything for this process. You can be confident that once your PR is merged into the `main` branch, your changes will be included in the very next nightly release.

We hope this detailed overview is helpful. If you have any questions about our automation or processes, please don't hesitate to ask!
