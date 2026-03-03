# Implementation Plan: Model Router Session Persistence Fix

## Phase 1: Investigation & Reproduction

- [ ] Task: Reproduce the issue by changing model settings, restarting the
      session, and monitoring request logs.
- [ ] Task: Analyze `packages/core/src/routing/modelRouterService.ts` and
      settings loading logic.
- [ ] Task: Conductor - User Manual Verification 'Phase 1: Investigation &
      Reproduction' (Protocol in workflow.md)

## Phase 2: Implementation

- [ ] Task: Write failing test case to demonstrate the persistence failure.
- [ ] Task: Fix the logic in the model router or settings service to ensure
      correct persistence.
- [ ] Task: Verify the fix with tests and manual session restarts.
- [ ] Task: Conductor - User Manual Verification 'Phase 2: Implementation'
      (Protocol in workflow.md)
