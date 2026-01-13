## Description

Support a new hook decision `ask` that allows a hook to force a user
confirmation prompt, even if a tool is currently allowlisted or the user is
running in 'YOLO' mode. This is useful for sensitive operations that require
manual oversight regardless of general security policies.

## Proposed Behavior

When a `BeforeTool` hook returns `decision: 'ask'`:

1. The `CoreToolScheduler` should interrupt its normal auto-approval logic.
2. The user should be presented with the standard interactive confirmation
   prompt for that tool.
3. The hook's `systemMessage` (if provided) should be displayed to explain why
   the confirmation is being forced.

## Implementation Details

1. Move the `BeforeTool` hook trigger point from `executeToolWithHooks` into
   `CoreToolScheduler._processNextInQueue`.
2. Fire the hook before the `isAutoApproved` check.
3. Update `isAutoApproved` (or the logic surrounding it) to respect the hook's
   decision, prioritizing `ask` as a requirement for manual confirmation.
