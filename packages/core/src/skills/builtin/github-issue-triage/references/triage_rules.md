# Issue Triage Rules

When executing triage on an issue, you must evaluate the following steps sequentially using the data provided from `scripts/analyze_issue.cjs` and the issue comments (`gh issue view <issue_url> --json comments`).

## Step 0: Maintainer-Only Bypass
Check the `labels` array in the JSON output from `analyze_issue.cjs`.
- If the issue already has a maintainer-only label (e.g., `🔒 maintainer only`): run `gh issue edit <issue_url> --remove-label "status/need-triage"` and **STOP EXECUTION**. Do not evaluate any further steps.

## Step 1: Resolution Check
Read ALL the comments from the issue carefully, and review the JSON output for `cross_references`. 
Check if ANY of the following conditions are met:
1. Is there a cross-referenced PR in `cross_references` where `is_pr` is `true` and `is_merged` is `true`?
2. Is it fixed, resolved, no longer reproducible, or functioning properly in the comments? (e.g., someone mentions it `might be fixed`, `should be fixed`, or `no longer an issue`) AND the reporter has not replied afterward to contradict this?
3. Is there a workaround provided in the comments?
4. Does someone state the issue is actually unrelated to this repository/project, or is an external problem (like a terminal emulator bug)?

- If condition 1 is met: Execute `gh issue close <issue_url> --comment "Closing because this issue was referenced by a merged pull request. Feel free to reopen if the problem persists or if the PR did not fully resolve this." --reason "completed"` and **STOP EXECUTION**.
- If condition 2 or 3 is met: Execute `gh issue close <issue_url> --comment "Closing because the comments indicate this issue might be fixed, has a workaround, is no longer an issue, or is resolved. Feel free to reopen if the problem persists." --reason "completed"` and **STOP EXECUTION**.
- If condition 4 is met: Execute `gh issue close <issue_url> --comment "Closing because the comments indicate this issue is unrelated to this project or is an external problem." --reason "not planned"` and **STOP EXECUTION**.
- If NONE of these conditions are met: Proceed to Step 1.2.

## Step 1.2: Closed PR Re-evaluation
If there is a cross-referenced PR in `cross_references` where `is_pr` is `true` and `is_merged` is `false` (and its state is `closed` or it has an automated closure comment):
1. Use `gh pr view <pr_url> --json author,comments,state,title,body` to analyze the PR.
2. Check the comments to see if it was closed by an automated bot (e.g., `gemini-cli` bot closing it automatically due to missing labels like 'help wanted' after 14 days).
3. Analyze the PR's title, body, and comments to determine if it implements a valid and useful feature/fix and is worth resuming.
- If it is worth resuming AND was closed by a bot:
  a. Determine if the issue should be **Maintainer-only** (epic, core architecture, sensitive fixes, internal tasks, or issues requiring deep investigation) or **Help-wanted** (good for community, general bugs, features, or tasks ready for external help).
  b. If it should be **Maintainer-only**:
     - Execute `gh issue edit <issue_url> --remove-label "status/need-triage" --add-label "🔒 maintainer only"`
     - **STOP EXECUTION**. (Do not reopen the PR).
  c. If it should be **Help-wanted**:
     - Reopen the PR: `gh pr reopen <pr_url>`
     - Assign the PR to the author: `gh pr edit <pr_url> --add-assignee <author_username>`
     - Assign the issue to the author: `gh issue edit <issue_url> --add-assignee <author_username>`
     - Add the help wanted label to the issue to prevent the bot from closing the PR again: `gh issue edit <issue_url> --add-label "help wanted"`
     - Comment on the issue: `gh issue comment <issue_url> --body "@<author_username>, apologies! It looks like your PR <pr_url> was incorrectly closed by our bot. I have reopened it and assigned this issue to you. Would you like to continue working on it?"`
     - Comment on the PR: `gh pr comment <pr_url> --body "@<author_username>, apologies for the bot closing this PR! We have reopened it. Please sync your branch to the latest \`main\` and we will have someone review it shortly."`
     - Execute `gh issue edit <issue_url> --remove-label "status/need-triage"`
     - **STOP EXECUTION**.
- If NOT met: Proceed to Step 1.5.

## Step 1.5: Pending Response Check
Read ALL the comments from the issue carefully.
1. Check if the most recent comments include a request for more information, clarification, or reproduction steps directed at the reporter from any other user (maintainer or community member).
2. Check if the reporter has NOT replied to that request.
3. Check if that request was made over 14 days ago. (You can check the date of the comment vs today's date).

- If ALL of these conditions are met: Execute `gh issue close <issue_url> --comment "Closing because more information was requested over 2 weeks ago and we haven't received a response. Feel free to reopen if you can provide the requested details." --reason "not planned"` and **STOP EXECUTION**.
- If NOT met: Proceed to Step 2.

## Step 2: Assignee and Inactivity Handling
Use the JSON output from `analyze_issue.cjs` to determine necessary actions.

1. **Assignee Check:** If an assignee is a contributor and hasn't made any updates on the issue for over 2 weeks, execute `gh issue edit <issue_url> --remove-assignee <username>` to remove them. (Do this before proceeding further).
2. **Inactivity Check:** 
   - If `inactive_over_60_days` is `true`: 
     a. Formulate a comment to the reporter (@<reporter_username>). Evaluate the issue description and whether it is an Epic (`is_epic`):
        - Always mention that the issue is being closed or pinged because it has been inactive for over 60 days.
        - IF IT IS AN EPIC: Ask the reporter if it is still in progress or complete, and if it is complete, ask them to close it.
        - IF IT IS NOT AN EPIC:
          - If it's a feature/enhancement request and the description is relatively vague, ask: 1) if it is still needed and 2) if they can provide more details on the feature request.
          - If the issue was mentioned by another issue that is closed as completed or by a pull request that is merged/closed (check `cross_references`), mention this cross-reference (e.g., "I see this issue was mentioned by #123 which is closed as completed...") and ask if this means it is resolved. Do NOT mention cross-references that are still open or closed as "not planned".
          - If it's a feature/enhancement request but well-described, just ask if it's still needed.
          - If it's a bug, ask if they can reproduce it with the latest build and provide detailed reproduction steps.
          - If the issue has assignees, append a ping to the assignees to check in.
          - If it is NOT an Epic AND `is_high_priority` is `false` AND `is_tracked_by_epic` is `false`, append "Feel free to reopen this issue." to the comment.
     b. Execute `gh issue edit <issue_url> --remove-label "status/need-triage"`. If it is NOT an Epic, also append `--add-label "status/needs-info"`.
     c. Execute `gh issue comment <issue_url> --body "<your formulated comment>"`
     d. If it is NOT an Epic AND `is_high_priority` is `false` AND `is_tracked_by_epic` is `false`, execute `gh issue close <issue_url> --reason "not planned"`.
     - After executing these actions, **STOP EXECUTION**.
   - If `inactive_over_30_days` is `true` AND it is a bug report (`is_feature_request` is `false`) AND it is NOT an Epic (`is_epic` is `false`):
     a. Execute `gh issue edit <issue_url> --remove-label "status/need-triage" --add-label "status/needs-info"`.
     b. Execute `gh issue comment <issue_url> --body "@<reporter_username>, this issue has been inactive for over a month. Could you please try reproducing it with the latest nightly build and let us know if it still occurs? If we don't hear back, we will close this issue on <deadline_date>."`
     - After executing these actions, **STOP EXECUTION**.
   - If neither condition is met, proceed to Step 3.

## Step 3: Vagueness Check
Is the issue fundamentally missing context AND no one has asked for more information yet?
- **For bugs**: Explicit reproduction steps are **REQUIRED**. Even if the user provides logs, error traces, or screenshots, if they do not provide clear, step-by-step instructions on how to reproduce the bug, it MUST be considered vague.
- **For feature requests**: If it is just a vague statement without clear use cases or details, it is considered vague.
- If YES (it is vague): Execute `gh issue edit <issue_url> --remove-label "status/need-triage" --add-label "status/needs-info"`. Ask the reporter: `gh issue comment <issue_url> --body "@<reporter_username>, thank you for the report! Could you please provide more specific details (e.g., detailed reproduction steps, expected behavior, logs, and environment details)? Closing this as vague if no response is received in a week."` and **STOP EXECUTION**.
- If NO: Proceed to Step 4.

## Step 4: Reproduction & Code Validity
1. Review the issue comments. If a community member has already clearly identified the root cause of the bug or answered the feature request, DO NOT investigate the code. Proceed to Step 5.
2. If it is a feature request, check if the feature is already implemented in the project. It could be an existing command, flag, setting, or UI feature. Search the codebase (e.g., `schemas/settings.schema.json`, `packages/cli/src/config/config.ts`, or command definitions) for relevant keywords.
- If the feature ALREADY EXISTS: Close the issue: `gh issue close <issue_url> --comment "This feature is actually already implemented! <Provide a brief explanation of how to use the feature, such as the command to run, the setting to change, or the flag to pass>.\n\nI'm going to close this issue since the functionality already exists. Let us know if you run into any other issues!" --reason "completed"` and **STOP EXECUTION**.
3. If no root cause is identified and it's not an existing feature, clone the target repository to a temporary directory (`git clone <repo_url> target-repo`).
4. Search the `target-repo/` codebase using `grep_search` and `read_file` ONLY. You are explicitly FORBIDDEN from writing new files, running tests, attempting to fix the code, OR attempting to reproduce the bug by executing code or shell commands. Your ONLY goal is to perform STATIC code analysis to determine if the logic for the bug still exists, if the feature is already implemented, or if the reported behavior is actually intentional by design.
- If definitively NO LONGER VALID or ALREADY IMPLEMENTED: Close it: `gh issue close <issue_url> --comment "Closing because I have verified this works correctly in the latest codebase. <brief explanation>"` and **STOP EXECUTION**.
- If INTENTIONAL BY DESIGN: Close it: `gh issue close <issue_url> --reason "not planned" --comment "Closing this issue as the reported behavior is intentional by design. <brief explanation of the design logic>"` and **STOP EXECUTION**.
- If still valid: Proceed to Step 5.

## Step 5: Duplicates
Search for duplicates using `gh issue list --search "<keywords>" --repo <owner/repo> --state all`.
- If found: `gh issue close <issue_url> --reason "not planned" --comment "Closing as duplicate of #<duplicate_number>."` and **STOP EXECUTION**.
- If no duplicates: Proceed to Step 6.

## Step 6: Triage Summary
Review the issue comments to see if a community member has already identified the root cause.
- If a root cause is identified: determine if it is a very simple fix. If it is a simple fix, post guidance for the fix, categorize the issue as **Maintainer-only**, and explain why. If it is not a simple fix, determine whether it should be **Maintainer-only** or **Help-wanted** and explain why. 
- If no root cause is identified: State whether the issue should be categorized as **Maintainer-only** (epic, core architecture, sensitive fixes, internal tasks, or issues requiring deep investigation) or **Help-wanted** (small well-defined features, easy-to-fix bugs, good for community, or tasks ready for external help). Your comment should be brief and clearly explain *why* it fits that category. 
- If you categorized the issue as **Help-wanted**, also run `gh issue edit <issue_url> --remove-label "status/need-triage" --add-label "help wanted"`. 
- If you categorized the issue as **Maintainer-only**, also run `gh issue edit <issue_url> --remove-label "status/need-triage" --add-label "🔒 maintainer only"`.
- Action: `gh issue comment <issue_url> --body "### Triage Summary\n\n<your summary>"`
- **STOP EXECUTION**.
