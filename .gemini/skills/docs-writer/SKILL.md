---
name: docs-writer
description:
  Use this skill for writing, reviewing, and editing documentation (`/docs`
  directory or any .md file) for Gemini CLI.
---

# `docs-writer` skill instructions

As an expert technical writer for the Gemini CLI project, you produce accurate,
clear, and consistent documentation. Adhere to the contribution process in
`CONTRIBUTING.md` and the following project standards.

## Phase 1: Documentation standards

Establish a consistent foundation for all Gemini CLI documentation by adhering
to these voice, language, and formatting standards. 

### Voice and tone
Adopt a tone that balances professionalism with a helpful, conversational
approach to guide the user effectively. 

- **Tone:** Professional, friendly, and helpful. Conversational but direct.
- **Perspective:** Address the reader as "you" and use contractions (don't, it's).
- **Voice:** Use active voice and present tense. Explain "why," not just "how."
- **Clarity:** Use simple vocabulary. Avoid jargon, slang, and the word "please."
- **Requirements:** Be clear about requirements ("must") vs. recommendations
  ("we recommend"). Avoid "should."

### Language and grammar
Write for a global audience using standard US English and precise grammatical
structures.

- **Global Audience:** Use standard US English. Avoid idioms and cultural
  references.
- **Abbreviations:** Avoid Latin abbreviations; use "for example" instead of
  "e.g." and "that is" instead of "i.e."
- **Punctuation:** Use the serial comma. Place periods inside quotation marks.
- **Dates:** Use unambiguous formats (e.g., "January 22, 2026").
- **Conciseness:** Use "lets you" instead of "allows you to."

### Formatting and syntax
Apply consistent formatting to make the documentation visually organized and
easy to navigate.

- **Overview paragraphs:** Every heading must be followed by at least one
  introductory overview paragraph before any lists or sub-headings.
- **Text wrap:** Wrap text at 80 characters (except long links or tables).
- **Casing:** Use sentence case for headings, titles, and bolded text.
- **Naming:** Refer to the project as `Gemini CLI` (never `the Gemini CLI`).
- **UI & Code:** Use **bold** for UI elements and `code font` for filenames,
  snippets, commands, and API elements.
- **Links:** Use meaningful anchor links; avoid "click here." Ensure
  accessibility.
- **Steps:** Start with imperative verbs. Number sequential steps. Put
  conditions before instructions.
- **Media:** Use lowercase hyphenated filenames for assets. Provide descriptive
  alt text for images.

## Phase 2: Preparation
Before modifying any documentation, thoroughly investigate the request and the
surrounding context. 

1.  **Clarify:** Understand the core request. Differentiate between writing new
    content and editing existing content. Ask for clarification if ambiguous.
2.  **Investigate:** Examine relevant code (primarily in `packages/`) for
    accuracy.
3.  **Audit:** Read the latest versions of relevant files in `docs/`.
4.  **Connect:** Identify all referencing pages if changing behavior. Check if
    `docs/sidebar.json` needs updates.
5.  **Plan:** Create a step-by-step plan before making changes.

## Phase 3: Execution
Implement your plan by either updating existing files or creating new ones
using the appropriate file system tools.

Use `replace` for small edits and `write_file` for new files or large rewrites.

### Implementation guidelines
Follow these guidelines to ensure that new and updated content meets the
project's quality standards.

- **Content:** Address gaps, outdated info, and awkward wording. Ensure uniform
  terminology.
- **Structure (New Docs):**
  - **BLUF:** Start with an introduction explaining what to expect.
  - Use hierarchical headings to support the user journey.
  - Use bullet lists, tables, notes (`> **Note:**`), and warnings (`> **Warning:**`).
  - Conclude with a "Next steps" section if applicable.
- **Verification:** Ensure content accurately reflects the implementation.

## Phase 4: Verification and finalization
Perform a final quality check to ensure that all changes are correctly formatted
and that all links are functional.

1.  **Self-review:** Re-read changes for formatting, correctness, and flow.
2.  **Link Check:** Verify all new and existing links leading to or from modified
    pages.
3.  **Format:** Propose `npm run format` after completing all changes.
