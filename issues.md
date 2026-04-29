# Context Management Review Issues

This document tracks technical debt, "smelly" logic, and architectural concerns
identified during the systematic code review of the Context Management
stabilization PR.

## 1. Defensive Duplicate Filtering in `fromGraph`

- **Status:** RESOLVED.
- **Action:** Removed the defensive filter from `fromGraph.ts`. Uniqueness
  detection is now handled by the `checkContextInvariants` utility.

## 2. Eager Role Coalescing in `fromGraph`

- **Status:** RESOLVED.
- **Action:** Refined `fromGraph.ts` to use `logicalParentId`. It now preserves
  original turn boundaries even if adjacent turns have the same role, ensuring a
  higher-fidelity reconstruction.

## 3. Dedicated Invariant Checker

- **Status:** RESOLVED.
- **Action:** Implemented `checkContextInvariants` utility in
  `packages/core/src/context/utils/invariantChecker.ts` and integrated it into
  `ContextManager.renderHistory`.

## 4. ID Salt Performance (Computational Cost)

- **Status:** RESOLVED.
- **Action:** Implemented a `PART_HASH_CACHE` (WeakMap) in `toGraph.ts`. Base
  content hashes are now memoized per Part object, avoiding redundant SHA-256
  operations while maintaining stable IDs.

## 5. Opinionated Sentinel Tone

- **Status:** RESOLVED.
- **Action:** Externalized sentinel strings to the `ContextProfile`
  configuration. `hardenHistory` now accepts custom sentinel overrides from the
  active sidecar profile.

## 6. Early Adoption Complexity in `GeminiClient`

- **Status:** RESOLVED.
- **Action:** Implemented a "Preview" rendering model. `GeminiClient` now passes
  the pending request to `renderHistory`, which builds a virtual graph for
  management without mutating permanent history early. Removed all legacy
  `skipHistoryPush` coordination flags.
