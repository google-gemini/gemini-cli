# Review Findings - PR #20361

## Summary

The PR implements "auto-add to policy by default" with workspace-first
persistence and rule narrowing for edit tools. The core logic is sound, but
there are several violations of the "Strict Development Rules".

## Actionable Findings

### 1. Type Safety (STRICT TYPING Rule)

- **`packages/core/src/scheduler/policy.test.ts`**: Still uses `any` for
  `details` in 'should narrow edit tools with argsPattern' test (Line 512).
- **`packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx`**: The
  `initialIndex` calculation logic uses `confirmationDetails` which is complex.
  Ensure no `any` is leaked here.

### 2. React Best Practices (packages/cli)

- **Dependency Management**: In `ToolConfirmationMessage.tsx`, the `useMemo`
  block for `question`, `bodyContent`, etc. (Lines 418-444) includes many new
  dependencies. Ensure `initialIndex` is calculated correctly and doesn't
  trigger unnecessary re-renders.
- **Reducers**: The `initialIndex` is derived state. While `useMemo` is
  acceptable here, verify if this state should be part of a larger reducer if
  the confirmation UI becomes more complex.

### 3. Core Logic Placement

- **Inconsistency**: Narrowing for edit tools is implemented in both
  `scheduler/policy.ts` and individual tools (`write-file.ts`, `edit.ts`).
  - _Recommendation_: Centralize the narrowing logic in the tools via
    `getPolicyUpdateOptions` and ensure `scheduler/policy.ts` purely respects
    what the tool provides, rather than duplicating the
    `buildFilePathArgsPattern` call.

### 4. Testing Guidelines

- **Snapshot Clarity**: The new snapshot for `ToolConfirmationMessage` includes
  a large block of text. Ensure the snapshot specifically highlights the change
  in the selected radio button (the `●` indicator).
- **Mocking**: In `persistence.test.ts`, ensure `vi.restoreAllMocks()` or
  `vi.clearAllMocks()` is consistently used to avoid pollution between the new
  workspace persistence tests and existing ones.

### 5. Settings & Documentation

- **RequiresRestart**: The `autoAddToPolicyByDefault` setting has
  `requiresRestart: false`. Verify if the `ToolConfirmationMessage` correctly
  picks up setting changes without a restart (it should, as it uses the
  `settings` hook).
- **Documentation**: Ensure this new setting is added to
  `docs/get-started/configuration.md` as per the general principles.

## Directive

Fix all findings above, prioritizing strict typing and removal of duplicate
narrowing logic.
