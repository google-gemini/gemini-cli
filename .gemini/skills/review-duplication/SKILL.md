---
name: review-duplication
description: Use this skill during code reviews to proactively investigate the codebase for duplicated functionality, reinvented wheels, or failure to reuse existing project best practices and shared utilities.
---

# Review Duplication

## Overview

This skill provides a structured workflow for investigating a codebase during a code review to identify duplicated logic, reinvented utilities, and missed opportunities to reuse established patterns. By executing this workflow, you ensure that new code integrates seamlessly with the existing project architecture.

## Workflow: Investigating for Duplication

When reviewing code, perform the following steps before finalizing your review:

### 1. Extract Core Logic
Analyze the new code to identify the core algorithms, utility functions, generic data structures, or UI components being introduced. Look beyond the specific business logic to see the underlying mechanics.

### 2. Hypothesize Existing Locations & Trace Dependencies
Think about where this type of code *would* live if it already existed in the project. Provide absolute paths from the repo root to disambiguate.
- **Utilities:** `packages/core/src/utils/`, `packages/cli/src/utils/`
- **UI Components:** `packages/cli/src/ui/components/`, `packages/cli/src/ui/`
- **Services:** `packages/core/src/services/`, `packages/cli/src/services/`
- **Configuration:** `packages/core/src/config/`, `packages/cli/src/config/`
- **Core Logic:** Call out `packages/core/` if functionality does not appear React UI specific.

**Trace Third-Party Dependencies:** If the PR introduces a new import for a utility library (e.g., `lodash.merge`, `date-fns`), trace how and where the project currently uses that library. There is likely an existing wrapper or shared utility.

**Check Package Files:** Before flagging a custom implementation of a complex algorithm, check `package.json` to see if a standard library (like `lodash` or `uuid`) is already installed that provides this functionality.

### 3. Investigate the Codebase (Sub-Agent Delegation)
Delegate the heavy lifting of codebase investigation to specialized sub-agents. They are optimized to perform deep searches and semantic mapping without bloating your session history.

To ensure a comprehensive review, you MUST formulate highly specific objectives for the sub-agents, providing them with the "scents" you discovered in Step 1.

- **Codebase Investigator:** Use the `codebase_investigator` as your primary researcher. When delegating, formulate an objective that asks specific, investigative questions about the codebase, explicitly including these search vectors:
  - **Structural Similarity:** Ask if existing code uses the same underlying APIs (e.g., "Does any existing code use `Intl.DateTimeFormat` or `setTimeout` for similar purposes?").
  - **Naming Conventions:** Ask if there are existing symbols with similar naming patterns (e.g., "Are there existing symbols with naming patterns like `*Format*` or `*Debounce*`?").
  - **Comments & Documentation:** Ask if keywords from the PR's comments or JSDoc exist in describing similar behavior elsewhere.
  - **Architectural Fit:** Ask where this type of logic is currently centralized (e.g., "Where is centralized date formatting logic located?").
  - **Refactoring Guidance:** Crucially, ask the sub-agent to explain *how* the new code could be refactored to use any existing logic it finds.
- **Generalist Agent:** Use the `generalist` for detailed, turn-intensive comparisons. For example: "Review the implementation of `MyNewComponent` in the PR and compare it semantically against all components in `packages/ui/src`. Are there any existing components that could be extended or used instead?"
- **Retain Fast Path for Simple Searches:** For extremely simple, unambiguous checks (e.g., "Does `package.json` include `lodash`?"), perform a direct search to save time. Default to delegation for any open-ended "investigations."

### 4. Evaluate Best Practices
Check if the new code aligns with the project's established conventions.
- **Error Handling:** Does it use the project's standard error classes or logging mechanisms?
- **State Management:** Does it bypass established stores or contexts?
- **Styling:** Does it hardcode colors or spacing instead of using theme variables?
If the PR introduces a new pattern, compare it against the documented standards and explicitly confirm if an existing project pattern should have been used instead.

### 5. Formulate Constructive Feedback
If you discover that the PR duplicates existing functionality or ignores a best practice:
- Provide a clear review comment.
- **Identify the Source:** Explicitly mention the absolute or project-relative file path and the specific symbol (function, component, class) that should be reused.
- **Implementation Guidance:** Provide a brief code snippet or a clear explanation showing **how** to integrate the existing code to fulfill the task's requirements.
- **Explain the Value:** Briefly explain why reusing the existing code is beneficial (e.g., maintainability, consistency, built-in edge case handling).

Example comment:
> "It looks like this PR introduces a new `formatDate` utility. We already have a robust, tested `formatDate` function in `src/utils/dateHelpers.ts`. 
>
> You can replace your implementation by importing it like this:
> ```typescript
> import { formatDate } from '../utils/dateHelpers';
> 
> // Then use it here:
> const displayDate = formatDate(userDate, 'MMM Do, YYYY');
> ```
> Reusing this ensures that the date formatting remains consistent with the rest of the application and handles timezone conversions correctly."
