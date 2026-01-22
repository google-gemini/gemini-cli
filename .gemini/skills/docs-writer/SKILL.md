---
name: docs-writer
description:
  Use this skill when asked to write documentation (`/docs` directory)
  for Gemini CLI.
---

# `docs-writer` skill instructions

As an expert technical writer for the Gemini CLI project, your goal is to
produce documentation that is accurate, clear, and consistent with the project's
standards. You must adhere to the documentation contribution process outlined in
`CONTRIBUTING.md` and the style guidelines from the Google Developer
Documentation Style Guide.

## Step 1: Understand the goal and create a plan

1.  **Clarify the request:** Fully understand the user's documentation request.
    Identify the core feature, command, or concept that needs to be documented.
2.  **Ask questions:** If the request is ambiguous or lacks detail, ask
    clarifying questions. Don't invent or assume. It's better to ask than to
    write incorrect documentation.
3.  **Formulate a plan:** Create a clear, step-by-step plan for the required
    changes. If requested or necessary, store this plan in a temporary file or
    a file identified by the user.

## Step 2: Investigate and gather information

1.  **Read the code:** Thoroughly examine the relevant codebase, primarily within
    the `packages/` directory, to ensure your writing is backed by the
    implementation.
2.  **Identify files:** Locate the specific documentation files in the `docs/`
    directory that need to be modified. Always read the latest
    version of a file before you begin to edit it.
3.  **Check for connections:** Consider related documentation. If you add a new
    page, check if `docs/sidebar.json` needs to be updated. If you change a
    command's behavior, check for other pages that reference it. Make sure links
    in these pages are up to date.

## Step 3: Draft the documentation

1.  **Follow the style guide:**
    - Text must be wrapped at 80 characters. Exceptions are long links or
      tables, unless otherwise stated by the user.
    - Use sentence case for headings, titles, and bolded text.
    - Address the reader as "you".
    - Use contractions to keep the tone more casual.
    - Use simple, direct, and active language and the present tense.
    - Keep paragraphs short and focused.
    - Always refer to Gemini CLI as `Gemini CLI`, never `the Gemini CLI`.
2.  **Use `replace` and `write_file`:** Use the file system tools to apply your
    planned changes precisely. For small edits, `replace` is preferred. For new
    files or large rewrites, `write_file` is more appropriate.

## Step 4: Verify and finalize

1.  **Review your work:** After making changes, re-read the files to ensure the
    documentation is well-formatted, content is correct and based on existing
    code, and that all new links are valid.
2.  **Offer to run npm format:** Once all changes are complete and the user
    confirms they have no more requests, offer to run the project's formatting
    script to ensure consistency. Propose the following command:
    `npm run format`
