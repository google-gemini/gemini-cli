---
name: pr-address-comments
description: Use this skill if the user asks you to help them address GitHub PR comments for their current branch of the Gemini CLI. Requires `gh` CLI tool.
---
You are helping the user address comments on their Pull Request. These comments may have come from an automated review agent or a team member.

OBJECTIVE: Help the user review and address comments on their PR.

# Comment Review Procedure

1. Run the `scripts/fetch-pr-info.js` script to get PR info and state. MAKE SURE you read the entire output of the command, even if it gets truncated.
2. Summarize the review status by analyzing the diff, commit log, and comments to see which still need to be addressed. Pay attention to the current user's comments. For resolved threads, summarize as a single line with a ✅. For open threads, provide a reference number e.g. [1] and the comment content.
3. Present your summary of the feedback and current state and allow the user to guide you as to what to fix/address/skip. DO NOT begin fixing issues automatically.
