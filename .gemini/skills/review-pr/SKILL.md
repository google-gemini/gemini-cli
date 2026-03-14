# Review PR Skill

This skill enables the agent to conduct a high-fidelity, behavioral code review
for a Pull Request. It is designed to be run in a dedicated, offloaded remote
session where parallel infrastructure validation (build, CI check) is already 
underway.

## Objective

Conduct a thorough review that goes beyond static analysis. The agent must
**physically prove** the feature works and that all regressions are caught by 
exercising the code in a live terminal.

## Workflow: Verify then Synthesize

The agent must follow these steps to conduct the review:

### 1. Context Acquisition
- Read the PR description: `gh pr view <PR_NUMBER>`.
- Read the intent from the description and map it against the diff.
- Run `/review-frontend <PR_NUMBER>` to get an initial static analysis report.

### 2. Infrastructure Validation
- Trust the parallel worker results in `.gemini/logs/offload-<PR_NUMBER>/`.
- Read `build.log` to ensure the environment is stable for testing.
- Read `ci-status.exit`. 
- **If CI is failing**: Use the extractor to identify failing tests:
  `npx tsx .gemini/skills/review-pr/scripts/extract-failures.ts <PR_NUMBER>`
- Reproduce the failing tests locally and analyze the output.

### 3. Behavioral Verification (The "Proof")
- Do NOT just trust that tests pass. 
- Physically exercise the new code in the terminal.
- Examples of "Proof":
    - If it's a new CLI command, run it with various flags.
    - If it's a new service, write a small `.ts` script to call the functions.
    - If it's a UI component, verify the Ink layout renders correctly.
- Log these proof steps and results in your conversation.

### 4. Synthesis
- Combine all data points:
    - **Static Analysis** (Code quality, style).
    - **Infrastructure** (Build status, CI status).
    - **Behavioral Proof** (Empirical verification).
- Check for merge conflicts with `main`.

## Final Assessment

Provide a final recommendation with four sections:

1.  **Summary**: High-level verdict (Approve / Needs Work / Reject).
2.  **Verified Behavior**: Describe the scripts/commands you ran to prove the
    feature works.
3.  **Findings**: List Critical issues, Improvements, and Nitpicks.
4.  **Actionable URL**: Explicitly print the PR URL: `gh pr view --web`.

### Approval Protocol

After presenting the synthesis, the agent MUST determine the all-up recommendation and ask the user for confirmation:

*   "Based on the verification, I recommend **[APPROVE / COMMENT / REJECT]**. Would you like me to post this review to GitHub?"
*   If the user agrees, execute the appropriate `gh pr review` command (e.g., `gh pr review <PR_NUMBER> --approve --body "<Summary>"`).

## Best Practices
- **Be Skeptical**: Just because CI is green doesn't mean the feature is complete. Look for missing edge cases.
- **Collaborate**: If you find a bug during verification, tell the user immediately in the main window.
- **Don't Fix**: Your role is to **review**, not to fix. If the PR is failing, summarize the causes and request changes.
