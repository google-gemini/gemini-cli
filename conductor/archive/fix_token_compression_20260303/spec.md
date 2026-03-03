# Specification: Fix incorrect \u0027input token count exceeds maximum\u0027 error during chat history compression

## Problem

The system incorrectly reports "The input token count exceeds the maximum number
of tokens allowed" during chat history compression, even when significant
context (e.g., 87%) is still available.

## Objective

- Understand the cause of the incorrect token count error.
- Apply a fix to ensure compression works correctly within token limits.
- Improve the logged error message to be more descriptive if the fix is not
  purely systemic.

## Scope

- \u0060packages/core\u0060: Analyze history compression logic and token
  counting.
- \u0060packages/cli\u0060: Review how compression errors are reported to the
  user.
