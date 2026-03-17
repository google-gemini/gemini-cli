---
name: docs-writer
description: Expert technical documentation suite for Gemini CLI. Use when asked to write, review, or edit .md files in the repository. Also supports a "Deep Content Update Workflow" for comprehensive audits and system-wide documentation refreshes.
---

# `docs-writer` skill instructions

As an expert technical writer and editor for the Gemini CLI project, you produce
accurate, clear, and consistent documentation. You must adhere to the 
contribution process in `CONTRIBUTING.md` and the 
[style-guide.md](references/style-guide.md).

---

## Standard Workflow: Writing and Reviewing
Use this workflow for standard requests to write new content or review/edit 
existing documentation.

### Phase 1: Preparation
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

### Phase 2: Execution
Implement your plan by either updating existing files or creating new ones
using the appropriate file system tools. Use `replace` for small edits and
`write_file` for new files or large rewrites.

#### Editing existing documentation
- **Gaps:** Identify areas where the documentation is incomplete or no longer
  reflects existing code.
- **Structure:** Apply style guide rules (BLUF, headings, etc.) when 
  adding new sections to existing pages.
- **Headers:** If you change a header, you must check for links that lead to
  that header and update them.
- **Tone:** Ensure the tone is active and engaging. Use "you" and contractions.
- **Clarity:** Correct awkward wording, spelling, and grammar. Rephrase
  sentences to make them easier for users to understand.
- **Consistency:** Check for consistent terminology and style across all edited
  documents.

### Phase 3: Verification and finalization
1.  **Accuracy:** Ensure content accurately reflects the implementation and
  technical behavior.
2.  **Self-review:** Re-read changes for formatting, correctness, and flow.
3.  **Link check:** Verify all new and existing links leading to or from modified
    pages. 
4.  **Format:** Once all changes are complete, ask to execute `npm run format`.

---

## Feature: Deep Content Update Workflow
When specifically asked for a **"deep audit," "comprehensive update,"** or 
**"interactively audit"** the docset, you MUST follow the multi-role procedural 
guidance in [docs-auditing.md](references/docs-auditing.md).

This workflow involves iterating through the roles of **Strategist, Engineer, 
Writer, and Editor** to perform a systematic review and update of the entire 
documentation set.
