# Procedural Guide: Auditing the Docset

This guide outlines the process for auditing the Gemini CLI documentation for
correctness and adherence to style guidelines. This process involves both an
"Editor" and "Technical Writer" phase.

## Objective

To ensure all public-facing documentation is accurate, up-to-date, adheres to
the Gemini CLI documentation style guide, and reflects the current state of the
codebase.

## Phase 1: Editor Audit

**Role:** The editor is responsible for identifying potential issues based on
style guide violations and technical inaccuracies.

### Steps

1.  **Identify Documentation Scope:**
    - Read `docs/sidebar.json` to get a list of all viewable documentation
      pages.
    - For each entry with a `slug`, convert it into a file path (e.g., `docs` ->
      `docs/index.md`, `docs/get-started` -> `docs/get-started.md`). Ignore
      entries with `link` properties.

2.  **Prepare Audit Results File:**
    - Create a new Markdown file named `audit-results-[YYYY-MM-DD].md` (e.g.,
      `audit-results-2026-03-13.md`). This file will contain all identified
      violations and recommendations.

3.  **Retrieve Style Guidelines:**
    - Familiarize yourself with the `docs-writer` skill instructions and the
      project's [Documentation Style Guide](../style-guide.md).

4.  **Audit Each Document:**
    - For each documentation file identified in Step 1, read its content.
    - **Review against Style Guide:**
      - **Voice and Tone:** Check for professionalism, directness, use of "you",
        active voice, present tense, clarity, and avoidance of jargon or overly
        informal language.
      - **Language and Grammar:** Look for conciseness, correct punctuation,
        unambiguous dates, proper use of abbreviations (e.g., "for example"
        instead of "e.g."), and adherence to quota/limit terminology if
        applicable.
      - **Formatting and Syntax:** Verify overview paragraphs, text wrap (80
        characters), casing for headings/titles, correct naming (`Gemini CLI`),
        list formatting, correct use of bold for UI elements and code font for
        code/filenames, descriptive links, and proper alt text for images.
      - **Structure:** Ensure BLUF (Bottom Line Up Front), proper use of
        experimental feature notes, hierarchical headings, clear procedures
        (imperative verbs, conditions before instructions), appropriate use of
        elements (notes, warnings), and the absence of a table of contents.
        Check for a "Next steps" section if applicable.
    - **Verify Code Accuracy (if applicable):**
      - If the document contains code snippets (e.g., shell commands, API calls,
        file paths, Docker image versions), use `grep_search` and `read_file`
        within the `packages/` directory (or other relevant parts of the
        codebase) to ensure the code is still accurate and up-to-date. Pay close
        attention to version numbers, package names, and command syntax.
    - **Record Findings:** For each violation or inaccuracy found:
      - Note the file path.
      - Describe the violation (e.g., "Violation (Language and Grammar): Uses
        'e.g.'").
      - Provide a clear and actionable recommendation (e.g., "Recommendation:
        Replace 'e.g.' with 'for example'.").
      - Append these findings to `audit-results-[YYYY-MM-DD].md`.

## Phase 2: Software Engineer Audit

**Role:** The software engineer is responsible for finding undocumented features
by auditing the codebase and recent changelogs, and passing these findings to
the technical writer.

### Steps

1.  **Proactive Codebase Audit:**
    - Audit high-signal areas of the codebase to identify undocumented features.
      You MUST review:
      - `packages/cli/src/commands/`
      - `packages/core/src/tools/`
      - `packages/cli/src/config/settings.ts`

2.  **Review Recent Updates:**
    - Check recent changelogs in stable and announcements within the
      documentation to see if newly introduced features are documented properly.

3.  **Evaluate and Record Findings:**
    - Determine if these features are adequately covered in the docs. They do
      not need to be documented word for word, but major features that customers
      should care about probably should have an article.
    - Append your findings to the `audit-results-[YYYY-MM-DD].md` file,
      providing a brief description of the feature and where it should be
      documented.

## Phase 3: Technical Writer Implementation

**Role:** The technical writer handles input from both the editor and the
software engineer, makes appropriate decisions about what to change, and
implements the approved changes.

### Steps

1.  **Review Audit Results:**
    - Read `audit-results-[YYYY-MM-DD].md` to understand all identified issues,
      undocumented features, and recommendations from both the Editor and
      Software Engineer phases.

2.  **Make Decisions and Log Reasoning:**
    - Create or update an implementation log (e.g.,
      `audit-implementation-log-[YYYY-MM-DD].md`).
    - Make sure the logs are updated for all steps, documenting your reasoning
      for each recommendation (why it was accepted, modified, or rejected). This
      is required for a final check by a human in the PR.

3.  **Implement Changes:**
    - For each approved recommendation:
      - Read the target documentation file.
      - Apply the recommended change using the `replace` tool. Pay close
        attention to `old_string` for exact matches, including whitespace and
        newlines. For multiple occurrences of the same simple string (e.g.,
        "e.g."), use `allow_multiple: true`.
      - **String replacement safeguards:** When applying these fixes across the
        docset, you must verify the following:
        - **Preserve Code Blocks:** Explicitly verify that no code blocks,
          inline code snippets, terminal commands, or file paths have been
          erroneously capitalized or modified.
        - **Preserve Literal Strings:** Never alter the wording of literal error
          messages, UI quotes, or system logs. For example, if a style rule says
          to remove the word "please", you must NOT remove it if it appears
          inside a quoted error message (e.g.,
          `Error: Please contact your administrator`).
        - **Verify Sentence Casing:** When removing filler words (like "please")
          from the beginning of a sentence or list item, always verify that the
          new first word of the sentence is properly capitalized.
      - For structural changes (e.g., adding an overview paragraph), use
        `replace` or `write_file` as appropriate.
      - For broken links, determine the correct new path or update the link
        text.
      - For creating new files (e.g., `docs/get-started.md` to fix a broken
        link, or a new feature article), use `write_file`.

4.  **Execute Auto-Generation Scripts:**
    - Some documentation pages are auto-generated from the codebase and should
      be updated using npm scripts rather than manual edits. After implementing
      manual changes (especially if you edited settings or configurations based
      on SWE recommendations), ensure you run:
      - `npm run docs:settings` to generate/update the configuration reference.
      - `npm run docs:keybindings` to generate/update the keybindings reference.

5.  **Format Code:**
    - **Dependencies:** If `npm run format` fails, it may be necessary to run
      `npm install` first to ensure all formatting dependencies are available.
    - After all changes have been implemented, run `npm run format` to ensure
      consistent formatting across the project.
