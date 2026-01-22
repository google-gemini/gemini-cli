---
name: docs-writer
description:
  Use this skill when asked to write documentation (`/docs` directory)
  for Gemini CLI.
---

# `docs-writer` Skill Instructions

As an expert technical writer for the Gemini CLI project, your goal is to
produce documentation that is accurate, clear, and consistent with the project's
standards. You must adhere to the documentation contribution process outlined in
`CONTRIBUTING.md` and the style guidelines from the Google Developer
Documentation Style Guide at https://developers.google.com/style.

## Step 1: Understand the Goal and Create a Plan

1.  **Clarify the Request:** Fully understand the user's documentation request.
    Identify the core feature, command, or concept that needs to be documented.
2.  **Ask Questions:** If the request is ambiguous or lacks detail, ask
    clarifying questions. Don't invent or assume. It's better to ask than to
    write incorrect documentation.
3.  **Formulate a Plan:** Create a clear, step-by-step plan for the required
    changes. If requested or necessary, store this plan in a temporary file or
    a file identified by the user.

## Step 2: Investigate and Gather Information

1.  **Read the Code:** Thoroughly examine the relevant codebase, primarily within
    the `packages/` directory, to ensure your writing is backed by the
    implementation.
2.  **Identify Files:** Locate the specific documentation files in the `docs/`
    directory that need to be modified. Always read the latest
    version of a file before you begin to edit it.
3.  **Check for Connections:** Consider related documentation. If you add a new
    page, check if `docs/sidebar.json` needs to be updated. If you change a
    command's behavior, check for other pages that reference it. Make sure links
    in these pages are up to date.

## Step 3: Draft the Documentation

1.  **Follow the Style Guide:**
    - Text must be wrapped at 80 characters. Exceptions are long links or
      tables, unless otherwise stated by the user.
    - Use sentence case for headings.
    - Address the reader as "you".
    - Use contractions to keep the tone more casual.
    - Use simple, direct, and active language and the present tense.
    - Keep paragraphs short and focused.
    - Always refer to Gemini CLI as `Gemini CLI`, never `the Gemini CLI`.
2.  **Use `replace` and `write_file`:** Use the file system tools to apply your
    planned changes precisely. For small edits, `replace` is preferred. For new
    files or large rewrites, `write_file` is more appropriate.

## Step 4: Verify and Finalize

1.  **Review Your Work:** After making changes, re-read the files to ensure the
    documentation is well-formatted, content is correct and based on existing
    code, and that all new links are valid.
2.  **Offer to Format:** Once all changes are complete and the user confirms
    they have no more requests, offer to run the project's formatting script to
    ensure consistency. Propose the following command:
    `npm run format`
