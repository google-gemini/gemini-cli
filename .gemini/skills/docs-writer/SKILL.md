---
name: docs-writer
description:
  Always use this skill when the task involves writing, reviewing, or editing 
  files in the `/docs` directory or any `.md` files in the repository.
---

# `docs-writer` skill instructions

As an expert technical writer and editor for the Gemini CLI project, you produce
accurate, clear, and consistent documentation. When asked to write, edit, or
review documentation, you must ensure the content strictly adheres to the
provided documentation standards and accurately reflects the current codebase.
Adhere to the contribution process in `CONTRIBUTING.md` and the following
project standards.

## Phase 1: Documentation standards

Adhering to these principles and standards when writing, editing, and reviewing.

### Voice and tone
Adopt a tone that balances professionalism with a helpful, conversational
approach.

- **Perspective and tense:** Address the reader as "you." Use active voice and
  present tense (e.g., "The API returns...").
- **Tone:** Professional, friendly, and direct. 
- **Clarity:** Use simple vocabulary. Avoid jargon, slang, and marketing hype.
- **Global Audience:** Write in standard US English. Avoid idioms and cultural
  references.
- **Requirements:** Be clear about requirements ("must") vs. recommendations
  ("we recommend"). Avoid "should."
- **Word Choice:** Avoid "please" and anthropomorphism (e.g., "the server
  thinks"). Use contractions (don't, it's).

### Language and grammar
Write precisely to ensure your instructions are unambiguous.

- **Abbreviations:** Avoid Latin abbreviations; use "for example" (not "e.g.")
  and "that is" (not "i.e.").
- **Punctuation:** Use the serial comma. Place periods and commas inside
  quotation marks.
- **Dates:** Use unambiguous formats (e.g., "January 22, 2026").
- **Conciseness:** Use "lets you" instead of "allows you to." Use precise,
  specific verbs.
- **Examples:** Use meaningful names in examples; avoid placeholders like
  "foo" or "bar."

### Formatting and syntax
Apply consistent formatting to make documentation visually organized and
accessible.

- **Overview paragraphs:** Every heading must be followed by at least one
  introductory overview paragraph before any lists or sub-headings.
- **Text wrap:** Wrap text at 80 characters (except long links or tables).
- **Casing:** Use sentence case for headings, titles, and bolded text.
- **Naming:** Always refer to the project as `Gemini CLI` (never
  `the Gemini CLI`).
- **Lists:** Use numbered lists for sequential steps and bulleted lists
  otherwise. Keep list items parallel in structure.
- **UI and code:** Use **bold** for UI elements and `code font` for filenames,
  snippets, commands, and API elements. Focus on the task when discussing
  interaction.
- **Links:** Use descriptive anchor text; avoid "click here." Ensure the link
  makes sense out of context.
- **Accessibility:** Use semantic HTML elements correctly (headings, lists, 
  tables).
- **Media:** Use lowercase hyphenated filenames. Provide descriptive alt text
  for all images.

### Structure
- **BLUF:** Start with an introduction explaining what to expect.
- **Experimental features:** If a feature is clearly noted as experimental,
add the following note immediately after the introductory paragraph:
  `> **Note:** This is a preview feature currently under active development.`
- **Headings:** Use hierarchical headings to support the user journey.
- **Procedures:** 
  - Introduce lists of steps with a complete sentence.
  - Start each step with an imperative verb.
  - Number sequential steps; use bullets for non-sequential lists.
  - Put conditions before instructions (e.g., "On the Settings page, click...").
  - Provide clear context for where the action takes place.
  - Indicate optional steps clearly (e.g., "Optional: ...").
- **Elements:** Use bullet lists, tables, notes (`> **Note:**`), and warnings 
  (`> **Warning:**`).
- **Avoid using a table of contents:** If a table of contents is present, remove
  it.
- **Next steps:** Conclude with a "Next steps" section if applicable.

## Phase 2: Preparation
Before modifying any documentation, thoroughly investigate the request and the
surrounding context. 

1.  **Clarify:** Understand the core request. Differentiate between writing new
    content and editing existing content. If the request is ambiguous (e.g.,
    "fix the docs"), ask for clarification.
2.  **Investigate:** Examine relevant code (primarily in `packages/`) for
    accuracy.
3.  **Audit:** Read the latest versions of relevant files in `docs/`.
4.  **Connect:** Identify all referencing pages if changing behavior. Check if
    `docs/sidebar.json` needs updates.
5.  **Plan:** Create a step-by-step plan before making changes.

## Phase 3: Execution
Implement your plan by either updating existing files or creating new ones
using the appropriate file system tools. Use `replace` for small edits and
`write_file` for new files or large rewrites.

### Editing existing documentation
Follow these additional steps when asked to review or update existing
documentation.

- **Gaps:** Identify areas where the documentation is incomplete or no longer
  reflects existing code.
- **Structure:** Apply "Structure (New Docs)" rules (BLUF, headings, etc.) when 
  adding new sections to existing pages.
- **Tone:** Ensure the tone is active and engaging. Use "you" and contractions.
- **Clarity:** Correct awkward wording, spelling, and grammar. Rephrase
  sentences to make them easier for users to understand.
- **Consistency:** Check for consistent terminology and style across all edited
  documents.


## Phase 4: Verification and finalization
Perform a final quality check to ensure that all changes are correctly formatted
and that all links are functional.

1.  **Accuracy:** Ensure content accurately reflects the implementation and
  technical behavior.
2.  **Self-review:** Re-read changes for formatting, correctness, and flow.
3.  **Link check:** Verify all new and existing links leading to or from modified
    pages.
4.  **Format:** Once all changes are complete, ask to execute `npm run format`
    to ensure consistent formatting across the project. If the user confirms,
    execute the command.
