# Issue Triage Rules

**Important Note on CLI Commands**: When posting comments via the `gh` CLI that contain newlines (e.g. `\n`), you MUST use bash command substitution with `echo -e` so the newlines are rendered correctly. For example: `gh issue comment <issue_url> --body "$(echo -e "### Triage Summary\n\n<your summary>")"`.

When executing triage on an issue, you must evaluate the following steps sequentially using the data provided from `scripts/analyze_issue.cjs` and the issue comments (`gh issue view <issue_url> --json comments`).

## Categorization Guide: Help-wanted
When categorizing an issue, determine if it is a good candidate for community contributions. Only use the **Help-wanted** label for these types of issues. Everything else remains unassigned to a specific whitelist label. Examples of **Help-wanted** issues include:
    *   Small, well-defined features.
    *   Easy-to-fix bugs (where the root cause might be identified but the fix isn't trivially "simple" enough to just patch immediately).
    *   Tasks that are clearly scoped and ready for external help.
    *   Issues that DO NOT require deep architectural knowledge, significant maintainer review time, modifications to core sensitive business logic (telemetry, security, billing), or sweeping UI/UX changes.

Conversely, do **NOT** use the `help wanted` label for issues such as:
    *   Easily reproducible bugs with a simple identified fix.
    *   Epics or roadmap initiatives.
    *   Changes to core architecture, sensitive security fixes, or internal tasks.
    *   Issues requiring deep investigation.
    *   Changes to key UI/UX that affect all users.
    *   Modifications to core internal data structures and IPC mechanisms.
    *   Changes to token/billing logic.
    *   Changes to key model and diff/edit functionalities.
    *   Features or changes that touch multiple parts of the codebase and would require significant reviewer time from maintainers.
    *   Changes touching key workflows (like the core stream or execution workflows) that affect all users and require careful architectural consideration.
    *   Changes touching sensitive business logic, telemetry, or API usage statistics/tracking.
    *   Proposals affecting community guidelines, contributor frameworks, or project governance that require significant maintainer discretion and alignment.

## Step 1: Resolution Check
**CRITICAL MISTAKE PREVENTION**: You MUST thoroughly read every single comment. Look explicitly for phrases like "appears to fix", "fixes this", "might be fixed", "resolved by", "no longer an issue", or links to other PRs/issues that suggest a resolution. Do not skim. If a user (even a non-maintainer) suggests a fix or PR exists, and the original reporter has not contradicted them, you MUST treat the issue as resolved.

Read ALL the comments from the issue carefully, and review the JSON output for `cross_references`. 
Check if ANY of the following conditions are met:
1. Is there a cross-referenced PR in `cross_references` where `is_pr` is `true` and `is_merged` is `true`? If so, use `gh pr view <pr_url> --json title,body` to verify that the PR actually addresses and resolves the issue's request. If it does not, treat condition 1 as NOT met.
2. Is it fixed, resolved, no longer reproducible, or functioning properly in the comments? (e.g., someone mentions it `might be fixed`, `should be fixed`, or `no longer an issue`) AND the reporter has not replied afterward to contradict this?
3. Is there a workaround provided in the comments?
4. Does someone state the issue is actually unrelated to this repository/project, or is an external problem (like a terminal emulator bug)?

- If condition 1 is met: Execute `gh issue close <issue_url> --comment "Closing because this issue was referenced by a merged pull request. Feel free to reopen if the problem persists or if the PR did not fully resolve this." --reason "completed"` and **STOP EXECUTION**.
- If condition 2 or 3 is met: Execute `gh issue close <issue_url> --comment "Closing because the comments indicate this issue might be fixed, has a workaround, is no longer an issue, or is resolved. Feel free to reopen if the problem persists." --reason "completed"` and **STOP EXECUTION**.
- If condition 4 is met: Execute `gh issue close <issue_url> --comment "Closing because the comments indicate this issue is unrelated to this project or is an external problem." --reason "not planned"` and **STOP EXECUTION**.
- If NONE of these conditions are met: Proceed to Step 1.1.

## Step 1.1: Existing Feature Check
**CRITICAL MISTAKE PREVENTION**: If the issue describes a feature request or enhancement (regardless of whether the JSON `is_feature_request` flag is true or false), you **MUST explicitly search the codebase** to verify if it is already implemented. You cannot skip this step for feature requests.
1. Use the `grep_search` tool to look for relevant keywords related to the feature in files like `schemas/settings.schema.json`, `packages/cli/src/config/config.ts`, command definitions, or UI components.
   - **Hotkeys & UI Actions**: If the user asks for a way to expand text, pause output, copy text, or perform a UI action, explicitly check `packages/cli/src/ui/key/keyBindings.ts` and the `Command` enum. Many interactive features (e.g., `Ctrl+O` for expanding truncated tool confirmations or output) already exist natively.
2. If you verify that the requested functionality (e.g., a setting, flag, hotkey, or command) already exists natively:
   - Execute `gh issue close <issue_url> --comment "This feature is actually already implemented! <Provide a brief explanation of how to use the feature, such as the command to run, the setting to change, or the hotkey to press>.\n\nI'm going to close this issue since the functionality already exists natively. Let us know if you run into any other issues!" --reason "completed"`
   - **STOP EXECUTION**.
3. If the feature does NOT exist, proceed to Step 1.2.

## Step 1.2: Closed PR Re-evaluation
If there is a cross-referenced PR in `cross_references` where `is_pr` is `true` and `is_merged` is `false` (and its state is `closed` or it has an automated closure comment):
1. Use `gh pr view <pr_url> --json author,comments,state,title,body` to analyze the PR.
2. Check the comments to see if it was closed by an automated bot (e.g., `gemini-cli` bot closing it automatically due to missing labels like 'help wanted' after 14 days).
3. Analyze the PR's title, body, and comments to determine if it implements a valid and useful feature/fix and is worth resuming. 
4. **Existing Feature Check**: Check if the requested feature is actually already implemented natively in the codebase (e.g., an existing hotkey, setting, or command). Search the codebase using `grep_search` if unsure.
- If the feature is ALREADY IMPLEMENTED:
  a. Do NOT reopen the PR.
  b. Execute `gh issue close <issue_url> --comment "This feature is actually already implemented! <Provide a brief explanation of how to use the feature>.\n\nI'm going to close this issue since the functionality already exists natively. Let us know if you run into any other issues!" --reason "completed"`
  c. Comment on the PR: `gh pr comment <pr_url> --body "@<author_username>, thank you for your contribution! We've reviewed this again and decided to keep it closed. The core feature requested in the parent issue is actually already implemented natively in the CLI. We appreciate the effort, but this specific PR is no longer needed!"`
  d. **STOP EXECUTION**.
5. Critically evaluate the PR's approach for correctness and safety. Ensure it does not introduce breaking changes, make false assumptions (e.g., making an optional configuration mandatory for all users), or negatively impact other workflows.
- If the PR's approach is flawed or introduces breaking changes:
  a. Do NOT reopen the PR.
  b. Determine if the issue itself should be **Help-wanted** (using the Categorization Guide).
  c. If **Help-wanted**, run `gh issue edit <issue_url> --remove-label "status/need-triage" --add-label "help wanted"`. If not, just remove `status/need-triage`.
  d. Execute `gh issue comment <issue_url> --body "### Triage Summary\n\nWhile this issue is valid, the proposed fix in PR <pr_url> introduces potential breaking changes or relies on incorrect assumptions (e.g., <brief explanation of the flaw>). Therefore, we will not reopen that PR, but we still welcome a different approach to fix this issue!"`
  e. Comment on the PR: `gh pr comment <pr_url> --body "@<author_username>, thank you for your contribution! We've reviewed the approach in this PR and decided to keep it closed because <brief explanation of the flaw>. We still welcome improvements here using a different approach! Feel free to open a new PR if you're interested."`
  f. **STOP EXECUTION**.
- If it is worth resuming AND was closed by a bot:
  a. Determine if the issue should be **Help-wanted** (using the Categorization Guide).
  b. If it should NOT be **Help-wanted**:
     - Execute `gh issue edit <issue_url> --remove-label "status/need-triage"`
     - Execute `gh issue comment <issue_url> --body "$(echo -e "### Triage Summary\n\n<brief explanation of why this issue requires maintainer attention and is not suitable for community contribution>")"`
     - **STOP EXECUTION**. (Do not reopen the PR).
  c. If it should be **Help-wanted**:
     - Reopen the PR: `gh pr reopen <pr_url>`
     - Assign the PR to the author: `gh pr edit <pr_url> --add-assignee <author_username>`
     - Assign the issue to the author: `gh issue edit <issue_url> --add-assignee <author_username>`
     - Add the help wanted label to the issue to prevent the bot from closing the PR again: `gh issue edit <issue_url> --add-label "help wanted"`
     - Comment on the issue: `gh issue comment <issue_url> --body "### Triage Summary\n\n<brief explanation of why this is a help-wanted task>\n\n@<author_username>, apologies! It looks like your PR <pr_url> was incorrectly closed by our bot. I have reopened it and assigned this issue to you. Would you like to continue working on it?"`
     - Comment on the PR: `gh pr comment <pr_url> --body "@<author_username>, apologies for the bot closing this PR! We have reopened it. Please sync your branch to the latest \`main\` and we will have someone review it shortly."`
     - Execute `gh issue edit <issue_url> --remove-label "status/need-triage"`
     - **STOP EXECUTION**.
- If NOT met: Proceed to Step 1.5.

## Step 1.5: Pending Response Check
Read ALL the comments from the issue carefully.
1. Check if the most recent comments include a request for more information, clarification, or reproduction steps directed at the reporter from any other user (maintainer or community member).
2. Check if the reporter has NOT replied to that request.
3. Check if that request was made over 14 days ago. (You can check the date of the comment vs today's date).
4. **CRITICAL**: Before closing, verify if OTHER users have chimed in after the request to provide the necessary context, answer the question on behalf of the reporter, or confirm the bug's existence. If they have, the issue is NO LONGER pending response and you must proceed to Step 2.

- If conditions 1, 2, and 3 are met AND condition 4 is false: Execute `gh issue close <issue_url> --comment "Closing because more information was requested over 2 weeks ago and we haven't received a response. Feel free to reopen if you can provide the requested details." --reason "not planned"` and **STOP EXECUTION**.
- If NOT met: Proceed to Step 2.

## Step 2: Assignee and Inactivity Handling
Use the JSON output from `analyze_issue.cjs` to determine necessary actions.

**CRITICAL VERIFICATION**: Before proceeding, explicitly verify the exact boolean values of `inactive_over_60_days`, `inactive_over_30_days`, and `is_feature_request` in the JSON output. Do not guess these values based on the date. Note that `is_feature_request` might be `false` even for feature requests if the title/labels lack specific keywords; if the body clearly asks for a new feature/enhancement, treat it as a feature request regardless of the JSON flag.

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
          - If it is NOT an Epic AND `is_tracked_by_epic` is `false`, append "Feel free to reopen this issue." to the comment.
     b. Execute `gh issue edit <issue_url> --remove-label "status/need-triage"`. If it is NOT an Epic, also append `--add-label "status/needs-info"`.
     c. Execute `gh issue comment <issue_url> --body "<your formulated comment>"`
     d. If it is NOT an Epic AND `is_tracked_by_epic` is `false`, execute `gh issue close <issue_url> --reason "not planned"`.
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
2. Clone the target repository to a temporary directory (`git clone <repo_url> target-repo`).
3. Search the `target-repo/` codebase using `grep_search` and `read_file` ONLY. You are explicitly FORBIDDEN from writing new files, running tests, attempting to fix the code, OR attempting to reproduce the bug by executing code or shell commands. Your ONLY goal is to perform STATIC code analysis to determine if the logic for the bug still exists or if the reported behavior is actually intentional by design.
- If definitively NO LONGER VALID: Close it: `gh issue close <issue_url> --comment "Closing because I have verified this works correctly in the latest codebase. <brief explanation>"` and **STOP EXECUTION**.
- If INTENTIONAL BY DESIGN: Close it: `gh issue close <issue_url> --reason "not planned" --comment "Closing this issue as the reported behavior is intentional by design. <brief explanation of the design logic>"` and **STOP EXECUTION**.
- If still valid: Proceed to Step 5.

## Step 5: Duplicates
Search for duplicates using `gh issue list --search "<keywords>" --repo <owner/repo> --state all`. 
- **CRITICAL**: Pay special attention to newer issues that might already have active pull requests or more detailed context. If a duplicate exists that already has an active PR or more maintainer engagement, close the *current* issue you are triaging in favor of the active one.
- If found: `gh issue close <issue_url> --reason "not planned" --comment "Closing as duplicate of #<duplicate_number>."` and **STOP EXECUTION**.
- If no duplicates: Proceed to Step 6.

## Step 6: Triage Summary
Review the issue comments to see if a community member has already identified the root cause.
- Determine if it should be **Help-wanted** (using the Categorization Guide) and explain why in your summary. 
- If you categorized the issue as **Help-wanted**, run `gh issue edit <issue_url> --remove-label "status/need-triage" --add-label "help wanted"`. 
- If it does not fit **Help-wanted**, you must still explain *why* it requires maintainer attention or why it's not a good fit for community contribution (e.g., "This issue touches core architecture and requires significant maintainer review time"). Simply run `gh issue edit <issue_url> --remove-label "status/need-triage"` to mark it triaged without a specific whitelist label.
- Action: `gh issue comment <issue_url> --body "### Triage Summary\n\n<your summary>"`
- **STOP EXECUTION**.

## Mandatory Final Step
Every issue that is triaged and remains OPEN MUST be assigned at least one of the following labels before you finish your triage process for that issue:
- `status/needs-info` (for inactive, vague, or issues requiring more details)
- `help wanted` (for well-defined, community-friendly issues)
- NONE of the above (If the issue is triaged, valid, but too complex for a community contribution, it should simply remain open without `status/need-triage`). If an issue reaches the end of triage and remains open, you must remove `status/need-triage`.