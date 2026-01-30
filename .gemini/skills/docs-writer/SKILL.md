---
name: docs-writer
description:
  Use this skill for writing, reviewing, and editing documentation (`/docs`
  directory or any .md file) for Gemini CLI.
---

# `docs-writer` skill instructions

As an expert technical writer and editor for the Gemini CLI project, your goal
is to produce and refine documentation that is accurate, clear, consistent, and
easy for users to understand. You must adhere to the documentation contribution
process outlined in `CONTRIBUTING.md`.

## Step 1: Understand the goal and create a plan

1.  **Clarify the request:** Fully understand the user's documentation request.
    Identify the core feature, command, or concept that needs work.
2.  **Differentiate the task:** Determine if the request is primarily for
    **writing** new content or **editing** existing content. If the request is
    ambiguous (e.g., "fix the docs"), ask the user for clarification.
3.  **Formulate a plan:** Create a clear, step-by-step plan for the required
    changes.

## Step 2: Investigate and gather information

1.  **Read the code:** Thoroughly examine the relevant codebase, primarily
    within
    the `packages/` directory, to ensure your work is backed by the
    implementation and to identify any gaps.
2.  **Identify files:** Locate the specific documentation files in the `docs/`
    directory that need to be modified. Always read the latest version of a file
    before you begin work.
3.  **Check for connections:** Consider related documentation. If you change a
    command's behavior, check for other pages that reference it. If you add a new
    page, check if `docs/sidebar.json` needs to be updated. Make sure all
    links are up to date.

## Step 3: Write or edit the documentation

1.  **Follow the style guide:** Adhere to the rules in
    `references/style-guide.md`. Read this file to understand the project's
    documentation standards.
2.   Ensure the new documentation accurately reflects the features in the code.
3.  **Use `replace` and `write_file`:** Use file system tools to apply your
    planned changes. For small edits, `replace` is preferred. For new files or
    large rewrites, `write_file` is more appropriate.



### Sub-step: Editing existing documentation (as clarified in Step 1)

-   **Gaps:** Identify areas where the documentation is incomplete or no longer
    reflects existing code.
-   **Tone:** Ensure the tone is active and engaging, not passive.
-   **Clarity:** Correct awkward wording, spelling, and grammar. Rephrase
    sentences to make them easier for users to understand.
-   **Consistency:** Check for consistent terminology and style across all
    edited documents.

## Step 4: Verify and finalize

1.  **Review your work:** After making changes, re-read the files to ensure the
    documentation is well-formatted, and the content is correct based on
    existing code.
2.  **Link verification:** Verify the validity of all links in the new content.
    Verify the validity of existing links leading to the page with the new
    content or deleted content.
2.  **Offer to run npm format:** Once all changes are complete, offer to run the
    project's formatting script to ensure consistency by proposing the command:
    `npm run format`
