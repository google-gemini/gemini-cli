# Track Plan: Fix Path Traversal and Async Refactor

## Phase 1: Security Fix

- [x] Task: Implement path validation in `ChatRecordingService.initialize`.
  - [x] Subtask: Write Security Test (Verify path traversal is blocked).
  - [x] Subtask: Implement Validation Logic.

## Phase 2: Async Refactor

- [x] Task: Refactor `ChatRecordingService` methods to be async.
  - [x] Subtask: Update `initialize` to async.
  - [x] Subtask: Update `readConversation` and `writeConversation` to async.
  - [x] Subtask: Update `recordMessage`, `recordThought`, `recordMessageTokens`,
        `recordToolCalls` to async.
  - [x] Subtask: Update `saveSummary` and `deleteSession` to async.
- [x] Task: Update unit tests to support async methods.

## Phase 3: Verification

- [x] Task: Run full test suite for `ChatRecordingService`.
