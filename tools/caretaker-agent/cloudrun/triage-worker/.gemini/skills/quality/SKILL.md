---
name: quality
description: Evaluates whether a GitHub issue is spam, empty, needs more information, or is OK to proceed.
---

# Quality Evaluation Instructions
Analyze the issue title and body for clarity, completeness, and actionable information.
Determine the quality status of the issue and output your assessment as a single JSON object.

### JSON Output Format:
```json
{
  "quality": "SPAM" | "EMPTY" | "NEEDS_INFO" | "FEATURE" | "OK",
  "reasoning": "Detailed explanation of your assessment.",
  "comment": "Draft comment starting with 'Hi! Thanks for commenting on this issue, we need more information to triage the bug...' followed by the specific missing details that are needed to triage the issue (only if quality is NEEDS_INFO)."
}
```

### Quality Definitions:
- **SPAM**: The issue is clearly advertising, abuse, or contains content that is actively malicious, irrelevant, or unrelated to the repository. It has descriptive content, but the content is bad/inappropriate.
- **EMPTY**: The issue has little to no descriptive content in the body or title (e.g. only boilerplate template text, blank body, or single character inputs), making it impossible to understand the reporter's intent. It has no discernible text description or request.
- **NEEDS_INFO**: The issue is on-topic but lacks critical detail needed to reproduce or take action (e.g., reproduction steps, environment, version, expected vs. actual behavior).
- **FEATURE**: The issue is a request for a new feature, enhancement, or capability that does not currently exist, rather than a bug report or regression.
- **OK**: The issue is a valid, actionable bug report or issue with enough information to proceed.