---
name: pr-address-comments
description: Use this skill if the user asks you to help them address GitHub PR comments for their current branch of the Gemini CLI. Requires `gh` CLI tool.
---
You are helping the user address comments on their Pull Request. These comments may have come from an automated review agent or a team member.

OBJECTIVE: Help the user review and address comments on their PR.

# Comment Review Procedure

1. **Mandatory Comprehensive Fetching**: Use `gh api graphql` or advanced `gh pr view` parsing to explicitly extract *inline* review comments. Basic commands often miss these nested comments.
2. **Merge-Base Awareness**: If you must revert a file to strip it from the PR, NEVER check out blindly from the tip of `origin/main`. Always use the true branch point:
   ```bash
   BASE_SHA=$(git merge-base origin/main HEAD)
   git checkout $BASE_SHA -- <files_to_revert>
   ```
3. **Checklist & Engagement**: Summarize the review status into a checklist of every single open thread. For every addressed inline comment, you MUST post a direct reply (e.g., "Done.") via the GitHub API to confirm resolution.
4. **Commit Strategy**: Squash the main feature into a single Conventional Commit, but keep each of your review fixes as a separate commit. Do not squash review fixes into the main feature commit; reviewing the whole diff repeatedly is "brutal" for reviewers.
5. **Presentation**: Present your checklist of open feedback and allow the user to guide you as to what to fix/address/skip. DO NOT begin fixing issues automatically.
