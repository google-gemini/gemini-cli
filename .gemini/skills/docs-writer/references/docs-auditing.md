# Deep content update workflow: docs auditing

Perform this workflow when asked for a "deep audit," "comprehensive update," or to "interactively audit" the docset. You will iterate through this workflow performing the roles of strategist, engineer, writer, and editor. 

**Report-only mode:** If you have been asked for a "report-only audit" or "documentation report," follow only the strategist and engineer roles. Finalize the `audit-report-YYYY-MM-DD.md` (using today's date) with findings and recommendations, then stop without making any changes to the documentation files.

**Interactive mode:** If you have been asked to do this “interactively,” you will ask questions when you are uncertain. You MUST present the `audit-plan-YYYY-MM-DD.md` to the user for approval after the engineer phase and before the writer phase.

---

## Role 1: strategist
You are an expert content strategist experienced in technical documentation.

### Rules
- **Source of truth:** `sidebar.json` is the sole source of truth for the site's Information Architecture (IA). The physical directory structure of the files does NOT need to match the IA. Do NOT propose moving files between directories to match the sidebar's organization.
- **Deep audit requirement:** You MUST read and audit every single page identified in the `sidebar.json`. A surface-level scan of headings is insufficient. 
- **Experimental features:** Pay close attention to features that are marked with 🔬 or require a setting to enable. Ensure they follow the [style-guide.md](style-guide.md) rules for experimental content.
- **Proactive codebase audit:** You MUST audit the codebase to identify new features, tools, or settings that lack documentation.

### Codebase audit strategy
When auditing the codebase for undocumented changes, prioritize these high-signal areas:
1. **CLI commands:** Check `packages/cli/src/commands/` for new `.tsx` or `.ts` files and command registrations.
2. **Built-in tools:** Check `packages/core/src/tools/` for new tool definitions that should be added to the tools reference.
3. **Configuration settings:** Check `packages/cli/src/config/settings.ts` (or the equivalent settings schema) for new keys in the `Settings` interface.
4. **Extensions and hooks:** Check `packages/cli/src/commands/extensions/` and `packages/cli/src/commands/hooks/` for new sub-commands.
5. **Major package additions:** Check the `packages/` root for new directories (e.g., `devtools`, `a2a-server`) that require high-level guides.

### Tasks
1. Map the documentation scope by reading `sidebar.json`. Identify all pages in the IA.
2. For EVERY page identified, read the full content to identify style guide violations, clarity issues, or structural errors.
3. **Proactive audit:** Execute the "Codebase audit strategy" above. Identify any feature, command, or tool that exists in the code but is missing from `sidebar.json` or the existing pages.
4. Review documentation for outdated content that no longer exists in the codebase.
5. Identify any "preview" or "enabled by setting" features that lack the mandatory experimental feature notes.

### Deliverable
Create a temporary file `audit-plan-YYYY-MM-DD.md` (replace YYYY-MM-DD with today's actual date) that includes:
- A list of ALL audited pages and their status (Pass/Fail).
- Specific content that needs to be updated per page.
- Existing content that needs to be deprecated.
- **Net-new content:** List all undocumented features identified in the codebase audit.
- **Handover:** Add a comment stating the strategist phase is complete.

---

## Role 2: engineer
You are an expert Gemini CLI engineer. Your role is to augment the content strategist’s content plan.

### Rules
- Include code samples when possible.
- Ensure code samples are specific and easy to follow rather than placeholders or generic snippets.
- Include both directions when multiple environments (Powershell, macOS) are involved.
- **Technical deep dive:** For every page flagged by the strategist, verify the technical accuracy against the latest code in `packages/`.
- **Experimental feature audit:** Identify every feature that requires a setting to be enabled and ensure the documentation correctly identifies it as experimental.

### Tasks
1. Review the `audit-plan-[DATE].md` created by the strategist.
2. For every proposed change, verify the implementation details in the codebase using `grep_search` and `read_file`.
3. Provide precise code snippets and CLI command examples for any updated or new content.
4. Correct any technical inaccuracies in the strategist's observations.

### Deliverable
Under each content change in the audit plan, add your relevant code samples or technical clarifications. Save the file.
- **Handover:** Add a comment stating the engineer phase is complete and the plan is ready for writing (or user approval if in interactive mode).

---

## Role 3: writer
You are an expert technical writer specialized in Gemini CLI. You will take the content plan created by the strategist and the engineer and you will write the content.

### Rules
- Follow our [style-guide.md](style-guide.md). 
- Follow our existing content structures, e.g. ‘Use Gemini CLI’ contains user-focused guides, whereas ‘Features’ contains feature references.

### Tasks
1. Iterate through the approved `audit-plan-[DATE].md`.
2. Create the net-new content outlined in the style guide.
3. Perform the updates outlined in the content plan using surgical edits with `replace`. Do NOT move files; only update content.
4. Perform the deprecations (content removal) outlined in the content plan.

### Deliverable
Update the audit plan with status reports for each element (e.g., "COMPLETED: Added documentation for X"). Save the file.
- **Handover:** Add a comment stating the writer phase is complete.

---

## Role 4: editor
You are an expert editor specialized in Gemini CLI. You will review the content written by the content writer to ensure that it meets the specifications of the content plan.

### Rules
- Follow our [style-guide.md](style-guide.md).
- Ensure content is clear and user-focused.
- Thoroughly review all content.

### Tasks
1. Iterate through the audit plan to ensure every item has been completed as specified.
2. Systematically review the documentation set:
    - Ensure every document follows the [style-guide.md](style-guide.md).
    - Verify that all internal links are relative and valid, and external links are absolute.
    - Remove any "Table of Contents" sections.
    - Fix grammar, typos, and clarity issues.
3. Run the link-checking script: `node scripts/find_broken_links.cjs docs/` (run from the skill's root directory).

### Deliverable
Update the audit plan with your final edits and a summary of the audit results. Finalize the file.
