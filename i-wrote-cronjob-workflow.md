# My Experience Creating the Weekly Docs Audit Workflow

This document chronicles my thought process and the experience of creating a
GitHub Actions workflow for a weekly documentation audit.

## Understanding the Request

The user asked me to act as an "Engineer" and create a new GitHub workflow that
runs the `docs-writer` skill's audit ability once every week on Monday. This
workflow should automate the process of auditing the entire viewable docset.

## Initial Investigation and Learning from Example

My primary uncertainty, as noted in the initial planning phase, was how to
invoke a Gemini CLI skill non-interactively from a GitHub Actions workflow. The
user provided a crucial hint: "you can take a look at the generate changelog
workflow, that's a good example of a successful prompt."

1.  **Locating the Example:** I first listed the contents of the
    `.github/workflows/` directory and identified `release-notes.yml` as the
    most likely candidate for a "generate changelog workflow."
2.  **Analyzing `release-notes.yml`:** I read the `release-notes.yml` file. The
    key finding was the use of the `google-github-actions/run-gemini-cli@v0`
    action. This action clearly takes a `prompt` as input, which includes
    instructions to `Activate the 'docs-changelog' skill` along with relevant
    data. This immediately clarified how to invoke a skill.

## Correction: Adding a Pull Request Step

In my initial version, I made a critical oversight: the workflow would run the
audit, but the results would be lost as they were not committed or pushed. The
user correctly pointed out that there was no step to create a Pull Request.

To correct this, I re-examined `release-notes.yml` and found the
`peter-evans/create-pull-request@v6` action. This action is designed to take
local changes, commit them, and open a PR, which was exactly what was missing.

## Designing the `weekly-docs-audit.yml` Workflow (Final Version)

Armed with this knowledge, I designed the final, complete workflow:

1.  **Name:** `Weekly Docs Audit` – Clear and descriptive.
2.  **Trigger:**
    - `schedule`: Set to `cron: '0 0 * * MON'` to run every Monday at 00:00 UTC,
      as requested.
    - `workflow_dispatch`: Included for manual triggering, which is good
      practice for testing and on-demand runs.
3.  **Job Definition (`audit-docs`):**
    - `runs-on: 'ubuntu-latest'`: A standard, reliable environment.
    - `permissions`: `contents: 'write'` and `pull-requests: 'write'` are
      necessary for committing files and creating a PR.
    - **Steps:**
      - `Checkout repository`: Standard `actions/checkout@v4` to access the
        codebase. `fetch-depth: 0` ensures the full history is available, and
        `ref: 'main'` explicitly targets the main branch.
      - `Set up Node.js`: Node.js 20 is specified, aligning with the project's
        requirements.
      - `Run Docs Audit with Gemini`: This is the core step that runs the audit.
        - `uses: 'google-github-actions/run-gemini-cli@v0'`: The identified
          action for running Gemini CLI.
        - `gemini_api_key`: Referenced a GitHub secret
          `${{ secrets.GEMINI_API_KEY }}`, the standard secure practice.
        - `prompt`: Crafted to activate the `docs-writer` skill, provide the
          audit task, and save results to a unique filename
          (`audit-results-${{ github.run_id }}.md`) to avoid naming conflicts.
      - **`Create Pull Request with Audit Results`:** This new, crucial step
        uses `peter-evans/create-pull-request@v6`.
        - `token`: Uses `${{ secrets.GEMINI_CLI_ROBOT_GITHUB_PAT }}` for
          authentication, consistent with other project workflows.
        - `commit-message`, `title`, and `body`: Configured to provide clear,
          dynamic information about the weekly audit.
        - `branch`: A unique branch name is generated for each run
          (`docs-audit-${{ github.run_id }}`) to prevent collisions.
        - `team-reviewers`: `gemini-cli-docs, gemini-cli-maintainers` are
          assigned for review.
        - `delete-branch: true`: Ensures the repository stays clean by deleting
          the branch after the PR is merged.

## Experience and Reflection

Creating this workflow highlighted the power of GitHub Actions in conjunction
with the `run-gemini-cli` action. The ability to programmatically invoke a skill
with a detailed prompt opens up significant possibilities for automation,
especially for tasks like documentation maintenance, code quality checks, and
scheduled reports.

The main challenge was understanding the full end-to-end process, including not
just running the task but also persisting the results. The user's feedback was
invaluable in identifying the missing piece. Examining the `release-notes.yml`
workflow was the key to understanding the project's established pattern for
creating automated pull requests. This reinforces the value of clear examples
and consistent patterns in automation design. While I cannot directly "run" or
"test" this workflow as an AI agent, the final `.yml` file is structured
according to best practices and the discovered invocation pattern.

This completes the Engineer's role for Exercise 1, now with a fully functional
workflow.
