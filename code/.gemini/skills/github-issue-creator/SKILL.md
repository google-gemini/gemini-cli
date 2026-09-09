---
name: github-issue-creator
description:
  Use this skill when asked to create a GitHub issue. It handles different issue
  types (bug, feature, etc.) using repository templates and ensures proper
  labeling.
---

# GitHub Issue Creator

This skill guides the creation of high-quality GitHub issues that adhere to the
repository's standards and use the appropriate templates.

## Workflow

Follow these steps to create a GitHub issue:

1.  **Identify Issue Type**: Determine if the request is a bug report, feature
    request, or other category.

2.  **Locate Template**: Search for issue templates in
    `.github/ISSUE_TEMPLATE/`.
    - `bug_report.yml`
    - `feature_request.yml`
    - `website_issue.yml`
    - If no relevant YAML template is found, look for `.md` templates in the same
      directory.

3.  **Read Template**: Read the content of the identified template file to
    understand the required fields.

4.  **Draft Content**: Draft the issue title and body/fields.
    - If using a YAML template (form), prepare values for each `id` defined in
      the template.
    - If using a Markdown template, follow its structure exactly.
    - **Default Label**: Always include the `🔒 maintainer only` label unless the
      user explicitly requests otherwise.

5.  **Create Issue**: Use the `gh` CLI to create the issue.
    - **CRITICAL:** To avoid shell escaping and formatting issues with
      multi-line Markdown or complex text, ALWAYS write the description/body to
      a temporary file first.

    **For Markdown Templates or Simple Body:**
    ```bash
    # 1. Write the drafted content to a temporary file
    # 2. Create the issue using the --body-file flag
    gh issue create --title "Succinct title" --body-file <temp_file_path> --label "🔒 maintainer only"
    # 3. Remove the temporary file
    rm <temp_file_path>
    ```

    **For YAML Templates (Forms):**
    While `gh issue create` supports `--body-file`, YAML forms usually expect
    key-value pairs via flags if you want to bypass the interactive prompt.
    However, the most reliable non-interactive way to ensure formatting is
    preserved for long text fields is to use the `--body` or `--body-file` if the
    form has been converted to a standard body, OR to use the `--field` flags
    for YAML forms.

    *Note: For the `gemini-cli` repository which uses YAML forms, you can often
    submit the content as a single body if a specific field-based submission is
    not required by the automation.*

6.  **Verify**: Confirm the issue was created successfully and provide the link
    to the user.

## Principles

- **Clarity**: Titles should be descriptive and follow project conventions.
- **Defensive Formatting**: Always use temporary files with `--body-file` to
  prevent newline and special character issues.
- **Maintainer Priority**: Default to internal/maintainer labels to keep the
  backlog organized.
- **Completeness**: Provide all requested information (e.g., version info,
  reproduction steps).
