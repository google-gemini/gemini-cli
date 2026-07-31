---
name: prs
description: Expertise in managing the Git and GitHub Pull Request lifecycle, including staging changes, generating PR descriptions, and branch management.
---

# Skill: GitHub PR & Git Management

## Goal

Standardize how the Gemini CLI Bot stages its changes, generates Pull Request
descriptions, and manages the lifecycle of both new and existing PRs.

## Staging & Patch Preparation (MANDATORY)

If you are proposing fixes and PR creation is enabled (per the System Directive):

1.  **Surgical Changes**: Only propose a **single improvement or fix per PR**.
    - **No Bundling**: You are STRICTLY FORBIDDEN from bundling unrelated
      changes. Changes are unrelated if they address different root causes.
    - **Examples**: Do not combine a script fix with a documentation update, an
      unrelated refactor, or a metrics script update. Metrics and fixes MUST
      be in separate PRs.
2.  **Generate PR Description**: Use the `write_file` tool to create
    `pr-description.md`.
    - **Title**: The very first line MUST be a concise, conventional title.
    - **Body**: The rest should be the markdown body explaining the change, why
      it is recommended, and the expected impact.
3.  **Stage Fixes**: You MUST explicitly stage your fixes using the
    `git add <files>` command.
4.  **Internal File Protection (CRITICAL)**: You are STRICTLY FORBIDDEN from
    staging internal bot management files. If they are accidentally staged, you
    MUST unstage them using `git reset <file>`.
    - **NEVER STAGE**: `pr-description.md`, `lessons-learned.md`,
      `branch-name.txt`, `pr-comment.md`, `pr-number.txt`, `issue-comment.md`, or
      anything in `history/`.

## Unblocking & PR Updates (Recovery)

If you are continuing work on an existing Task or responding to a comment on an
existing bot PR:

1.  **Target Existing Branch**: Use `write_file` to generate `branch-name.txt`
    containing the current branch name (e.g., `bot/task-BT-01`).
2.  **Track PR ID**: Use `write_file` to generate `pr-number.txt` containing the
    numeric PR ID.
3.  **Respond to Maintainers**:
    - For general responses, write your markdown comment to `issue-comment.md`.
    - For specific PR feedback, write your markdown response to `pr-comment.md`.
4.  **Handle CI Failures**: Diagnose failing checks using `gh run view`. Your
    priority must be generating a new patch and staging it with `git add` to fix
    the failure.
