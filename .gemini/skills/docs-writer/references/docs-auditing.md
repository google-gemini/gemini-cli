# Deep content update workflow: docs auditing

Perform this workflow when asked for a "deep audit," "comprehensive update," or
to "interactively audit" the docset. You will iterate through this workflow
performing the roles of strategist, engineer, writer, and editor. You will
view the documentation set found at `/docs/`.

**Report-only mode:** If asked for a "report-only audit" or "documentation
report," follow only the strategist and engineer roles. Finalize the
`audit-report-YYYY-MM-DD.md` (using today's date) with findings and
recommendations, then stop without making changes to documentation files.

**Interactive mode:** If asked to do this “interactively,” you must ask questions
when uncertain. You MUST present the `audit-plan-YYYY-MM-DD.md` to the user for
approval after the engineer phase and before the writer phase.

---

## Role 1: strategist
You are an expert content strategist. Your goal is to ensure 100% coverage and
adherence to the information architecture and style standards.

### Rules
- **Source of truth:** `sidebar.json` is the sole source of truth for the site's
  Information Architecture (IA). Do NOT propose moving files; the directory
  structure is irrelevant to the IA.
- **Deep audit requirement:** You MUST audit EVERY single page listed in
  `sidebar.json`. For every page, you must verify:
  1. **BLUF:** Does it start with a clear introductory paragraph?
  2. **No TOC:** Is the manual "Table of Contents" section removed?
  3. **Sentence case:** Are ALL headings and bold labels in sentence case?
  4. **Experimental notes:** Are 🔬 features correctly marked with the mandatory
     warning note? Note as follows:

    > **Note:** This is a preview feature currently under active development.
    > Preview features may be available on the **Preview** channel or may need to be
    > enabled under `/settings`.
- **Proactive codebase audit:** You MUST audit high-signal areas
  (`packages/cli/src/commands/`, `packages/core/src/tools/`,
  `packages/cli/src/config/settings.ts`) to find undocumented features.

### Tasks
1. **Reconciliation:** Create a master list of all pages from `sidebar.json`.
2. **Comprehensive review:** Read every page. Do not skip any.
3. **Codebase scan:** Check for new commands, tools, or settings in the code.
4. **Outdated content:** Identify features in docs that no longer exist in code.

### Deliverable
Create a `audit-plan-YYYY-MM-DD.md` (using today's date) containing:
- **Audit matrix:** A table listing every page, its Pass/Fail status, and
  specific violations (Missing BLUF, TOC Present, Case Error, Wrap, etc.).
- **Net-new content:** List of undocumented features from the codebase scan.
- **Deprecations:** List of pages or sections to be removed.
- **Handover:** A comment stating the strategist phase is complete.

---

## Role 2: engineer
You are an expert Gemini CLI engineer. Your role is to ensure technical 
accuracy and provide specific examples.

### Rules
- **Verification:** Use `grep_search` and `read_file` to verify the accuracy of
  every code snippet, command, and version number.
- **Samples:** Provide specific, functional code samples for multiple shells
  (macOS/Bash and Windows/PowerShell) where applicable.

### Tasks
1. **Technical deep dive:** For every page flagged for update or addition,
   verify the implementation details in the `packages/` directory.
2. **Sample generation:** Write the code samples for the new documentation.
3. **Clarification:** Correct any technical misunderstandings in the plan.

### Deliverable
Update the audit plan with technical blocks and handover comment.

---

## Role 3: writer
You are an expert technical writer. You implement the plan using surgical edits.

### Rules
- **Style adherence:** Strictly follow [style-guide.md](style-guide.md).
- **Surgical edits:** Use `replace` whenever possible to minimize noise.
- **No relocation:** Do not move files between directories.
- **No mass rewriting:** Make edits as recommended but do not rewrite pages.

### Tasks
1. **Implementation:** Iterate through the approved plan.
2. **Creation:** Create net-new files if required for missing features.
3. **Status tracking:** Mark each item as COMPLETED in the audit plan.

### Deliverable
Updated audit plan with completion reports and handover comment.

---

## Role 4: editor
You are an expert editor. You provide the final quality gate.

### Tasks
1. **Final pass:** Re-read every updated page to avoid introduced errors. Do
not rewrite pages; concentrate on changes that have been made.
2. **Link check:** Run `node scripts/find_broken_links.cjs docs/`.
3. **TOC removal:** Ensure no manual "Table of Contents" sections remain.
4. **Format:** Run `npm run format`.

### Deliverable
Finalized audit plan with a summary of changes and verification results.
