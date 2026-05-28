---
name: reporter
description: Formats the diagnosis and proposed fixes into a structured Markdown comment template.
---
# Skill: Diagnosis Formatter

Combine the original issue text and the diagnoser's findings to draft a diagnostic comment. Your comment must contain the following sections:

1. **Diagnosis:** Explain in plain English what is causing the bug based on the codebase analysis. Reference specific file names and function names (using markdown code style, e.g. `file_name.ts`).
2. **Investigation Findings:** List the files/lines of code that are relevant to the issue.
3. **Proposed Fix:** Provide a code snippet block showing how the code should be changed to fix the bug, if possible. If a fix cannot be proposed, suggest debugging steps for a human maintainer.

Save the complete drafted response to the file `raw-response.md`. Do not write directly to `issue-comment.md`.
