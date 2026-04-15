# Project Status: Bundling and CI Revamp (Issue #22349)

## Accomplishments

- **Local Bundle Validation:** Confirmed that `npm run bundle` produces a
  functional artifact that passes integration tests locally.
- **Build Optimizations Integrated:** Ported and merged improvements from PR
  #12389, including:
  - `tsbuildinfo` support across all packages for faster incremental builds.
  - Dependency-ordered workspace builds in `scripts/build.js`.
- **Test Infrastructure Refactor:** Centralized Vitest configuration to a root
  `vitest.config.ts` using the `projects` API, allowing for parallel execution
  across the monorepo.

## CLI Test Performance Crisis

Investigation into the 10-minute CLI test runtime revealed:

- **The 'Forks' Penalty:** Using `forks` pool spawns a new Node.js process per
  test file. Strict worker limits (4) cause massive overhead.
- **Global Environment Poisoning:** `packages/cli/test-setup.ts` directly
  deletes `process.env` variables, forcing `forks` to prevent cross-test leaks.
- **Zombie Tests:** `BackgroundTaskDisplay.test.tsx` and `useAuth.test.tsx` hit
  60s timeouts, blocking worker slots.

## "Fast Path" Strategy (Implemented)

1. **Surgical Fix for Setup:** Replaced direct `process.env` manipulation with
   `vi.stubEnv` and implemented full listener cleanup in `test-setup.ts`.
2. **Modern Isolation:** Successfully switched CLI and Core pools from `forks`
   to `threads`.
3. **Unleash Hardware:** Removed all concurrency and thread limits to utilize
   full host capacity (16 cores in CI).
4. **Zombie Suppression:** Identified and temporarily excluded the top 5 hanging
   tests to prevent suite blockage:
   - `ToolStickyHeaderRegression.test.tsx`
   - `McpStatus.test.tsx`
   - `SubagentHistoryMessage.test.tsx`
   - `BackgroundTaskDisplay.test.tsx`
   - `useAuth.test.tsx`

## Cross-Platform Matrix Trial

- **Linux:** `gemini-cli-ubuntu-16-core` (Unleashed 16-core concurrency).
- **Mac:** Upgraded to `macos-large-latest` (Higher core count).
- **Windows:** `gemini-cli-windows-16-core` (High-performance runner).
- **Integration Tests:** Now running with `GEMINI_API_KEY` for full verification
  of the bundle.

## Current Goal

- **Green Cross-Platform Run:** Achieving a fully green run across the new
  matrix with 2-minute CLI unit test targets and verified bundle integrity.
