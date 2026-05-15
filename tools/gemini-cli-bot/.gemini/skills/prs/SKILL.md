---
name: prs
description: Expertise in managing the Git and GitHub Pull Request lifecycle, including staging changes, generating PR descriptions, and branch management.
---

# Skill: GitHub PR & Git Management

## Goal

Standardize how the Gemini CLI Bot stages its changes, generates Pull Request
descriptions, and manages the lifecycle of both new and existing PRs.

## Mandatory PR Driver (Ownership)

You are the "owner" of all PRs labeled `bot-fix`. You MUST proactively drive them toward a resolution (either completion or informed escalation):
1.  **Inventory**: Use `gh pr list --label "bot-fix" --json number,title,headRefName,statusCheckRollup,comments` to find your active PRs.
2.  **Resolution Priority**:
    - **Fixable CI/Feedback**: If a `bot-fix` PR needs attention, you MUST prioritize driving it to completion by resolving issues. Specifically:
        1. **Merge Conflicts**: Attempt to resolve merge conflicts by pulling the target branch or rebasing.
        2. **Test Failures**: Fix any failing unit or integration tests related to the PR.
        3. **Failing Checks**: Resolve any failing status checks (e.g., lint, build, typecheck).
        4. **PR Comments**: Address and resolve all maintainer comments and requested changes.
      You MUST prioritize this maintenance before starting new work.
    - **Unresolvable Roadblocks**: If you identify a persistent failure that appears to be an environment issue, a flaky test, or a fundamental architectural blocker that requires human intervention, you MUST NOT keep looping. Instead:
        1. Summarize the blocker and your failed attempts in `pr-comment.md`.
        2. Explicitly ask for maintainer help.
        3. Record the learning in `lessons-learned.md`.
        4. Move on to a different task.

## Staging & Patch Preparation (MANDATORY)

If you are proposing fixes and PR creation is enabled (per the System Directive):

1.  **Surgical Changes**: Only propose a **single improvement or fix per PR**.
    - **No Bundling**: You are STRICTLY FORBIDDEN from bundling unrelated
      changes. Changes are unrelated if they address different root causes.
    - **Examples**: Do not combine a script fix with a documentation update, an
      unrelated refactor, or a metrics script update. Metrics and fixes MUST
      be in separate PRs.
2.  **Generate PR Description**: Use the `write_file` tool to create
    `pr-description.md` **at the workspace root**.
    - **Title**: The very first line MUST be a concise, conventional title.
    - **Body**: Explain the change and expected impact. You MUST identify the domain expert for the affected files and mention them (cc @<user>).
    - **Labels**: Use the `write_file` tool to create `pr-labels.txt` **at the workspace root** containing one label per line. You MUST ALWAYS add the `bot-fix` label.
3.  **Branch Naming (Optional)**: If you wish to specify a custom branch name,
    use `write_file` to create `branch-name.txt` **at the workspace root**. **CRITICAL**: The branch name
    MUST start with the `bot/` prefix. If you do not specify a branch name, one
    will be generated for you.
4.  **Stage Fixes**: You MUST explicitly stage your fixes using the
    `git add <files>` command.
5.  **Internal File Protection (CRITICAL)**: You are STRICTLY FORBIDDEN from
    staging internal bot management files. If they are accidentally staged, you
    MUST unstage them using `git reset <file>`.
    - **NEVER STAGE**: `pr-description.md`, `lessons-learned.md`,
      `branch-name.txt`, `pr-comment.md`, `pr-number.txt`, `issue-comment.md`, `pr-labels.txt`, or
      anything in `history/`.

## Unblocking & PR Updates (Recovery)

If you are continuing work on an existing Task or responding to a comment on an
existing bot PR:

1.  **Target Existing Branch**: Use `write_file` to generate `branch-name.txt`
    **at the workspace root** containing the current branch name. **CRITICAL**: The branch name MUST start
    with the `bot/` prefix (e.g., `bot/task-BT-01`). If it does not, your PR
    creation will be rejected by the safety gate.
2.  **Track PR ID**: Use `write_file` to generate `pr-number.txt` **at the workspace root** containing the
    numeric PR ID.
3.  **Respond to Maintainers**:
    - For general responses, write your markdown comment to `issue-comment.md` **at the workspace root**.
    - For specific PR feedback, write your markdown response to `pr-comment.md` **at the workspace root**.
4.  **Handle CI Failures**: Diagnose failing checks using `gh --no-pager run view` or `gh api`. Your
    priority must be generating a new patch and staging it with `git add` to fix
    the failure.
