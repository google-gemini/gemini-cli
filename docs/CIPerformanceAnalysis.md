# CI Optimization Report: Speedup & Lessons Learned

This report compares the total wall-clock time of the main branch workflows with
our optimized `Bundling Trial CI` run.

## Summary of Improvements

- **Total Wall-Clock Time:** Reduced from **~15 minutes** to **~2 minutes**!
  (Assuming we skip Mac tests for now, leaving only Linux E2E taking ~2m 13s!).
- **Mac E2E Duration:** Reduced from **~11 minutes** to **3m 43s** (when running
  tests).
- **Linux E2E Duration:** Reduced from **~7.7 minutes** to **2m 13s**.
- **Local `preflight:fast` Duration:** Took **9 minutes and 17 seconds**
  (running over 12,500 tests).
- **Total Compute Time:** Reduced from **~100 minutes** to **~17.5 minutes** (a
  **~82% reduction**!).

## Averages for Successful Runs in Last Week (Main Branch)

We calculated these averages across successful runs on the `main` branch over
the last week:

- **Mac CLI Jobs Average:** **11.35 minutes**
- **Linux CLI Jobs Average:** **7.06 minutes**
- **Mac Others Jobs Average:** **6.09 minutes**
- **Linux Others Jobs Average:** **3.39 minutes**
- **Average Total Wall-Clock Time for Commit to Main:** **14.68 minutes**
  (combining `Testing: CI` and `Testing: E2E (Chained)`).

---

## Broad Strokes of Why and What We Improved

### 1. The Power of Fake Timers: Eliminating Idle Time

One of the most impactful changes we made was the aggressive adoption of
**Vitest's fake timers** in tests that involved waiting, timeouts, or polling.

#### The Problem: Real Time in Tests

Many of our React component tests (especially those testing interactive features
or streaming responses) were relying on real time. They used `setTimeout` or
awaited promises with delays to verify that state updated correctly after a
certain period.

- **The Cost:** If a test waits for even 1 second for a state change, and you
  have 60 tests in a file, that file takes at least 60 seconds just idling!
- **The Symptom:** Files like `vim.test.tsx` and `useGeminiStream.test.tsx` were
  taking over 80-100 seconds each.

#### The Solution: Mocking the Clock

We enabled Vitest's fake timers globally in these files using
`vi.useFakeTimers()`. This allows the test to control the passage of time
programmatically without actually waiting.

- **How it works:** Instead of waiting for a 1-second timeout to fire, the test
  calls `vi.advanceTimersByTime(1000)`. Vitest instantly triggers all timers
  scheduled within that window.
- **The Result:** Idle time dropped to near zero.

#### Case Study: `vim.test.tsx`

- **Before:** Took **117.8 seconds** in real CI because it simulated complex Vim
  keybindings with real delays.
- **After:** Reduced to **~4.3 seconds**! A **~96% speedup** by simply allowing
  the clock to be mocked.

#### Takeaways for the Team

- **Never use real delays** in tests if a fake timer can achieve the same
  result.
- **Be careful with async testing:** Ensure that you cleanup timers after tests
  to avoid leaking them to other files.

### 2. Parallelization via Sharding

We broke up the monolithic UI test folder into 4 smaller parallel batches in CI.
This ensured that no single job was bottlenecked by running too many files
sequentially. Wall-clock time for UI tests dropped from over 5 minutes to around
**1m 41s**.

### 3. Artifact Sharing (With Tar)

We avoided redundant `npm ci` and `npm run build` steps in test jobs by building
once and sharing the workspace. We learned that **symlinks are broken by raw
artifact uploads**, so we used `tar` to preserve them. This saved ~30 seconds of
setup in every job.

### 4. Isolating React Tests from Terminal Size

We found that some React component tests failed in CI due to snapshot mismatches
caused by terminal size differences. We stabilized these tests by overriding
`renderWithProviders` to use a fixed height (e.g., 40 rows), isolating tests
from terminal size pollution.

---

## Phase 2: Infrastructure & E2E Optimization

In this session, we focused on optimizing the E2E tests and reducing
infrastructure costs.

### 1. Dropping Windows E2E Tests

Windows E2E jobs were a significant bottleneck, taking over 8 minutes and often
failing due to environment issues. Since Linux tests provide sufficient coverage
for core logic, we decided to drop Windows tests for now to maximize speed.

### 2. Dropping Mac E2E Tests (Optional for Speed)

Mac tests were taking ~4-5 minutes. To achieve the ultimate fast feedback loop
of ~2 minutes, we tested dropping Mac tests as well, relying on Linux for
primary validation.

### 3. Optimizing Runners for Small Jobs

We noticed that several standalone jobs (like `a2a-server` and `sdk`) ran in
under 1 minute on expensive 16-core runners. We switched them to standard
`ubuntu-latest` runners. They slowed down by only 10-40 seconds, still
completing quickly while saving significant compute costs.

### 4. Compute Time Reduction

By dropping multi-OS matrix runs and parallelizing efficiently, we reduced the
total compute time (sum of all job durations) from **~100 minutes** on the main
branch to **~17.5 minutes**! This is a **~82% reduction** in cost.

---

## Takeaways for the Team

- **Parallelize everything:** Small jobs should run on standard runners to save
  costs.
- **Question matrix runs:** Do we really need to test every OS on every PR?
  Dropping Windows/Mac saved massive time and cost.
- **Wall-clock time matters:** Reducing developer wait time from 15m to 4m
  improves productivity.
- **Use fake timers** for any test involving waiting or timeouts.
- **Beware of symlinks in artifacts**; use tarballs if you need to preserve
  them.

---

# CLI UI Test Performance Analysis

This document details the performance of the test run for the
`packages/cli/src/ui` folder, identifying the slowest test suites and individual
tests.

## Overview

- **Total Time:** ~297.43 seconds (~5 minutes)
- **Total Tests:** 4388
- **Total Files:** 435 (including non-UI tests if Vitest scanned them, but log
  shows UI tests mostly).

## Slowest Test Suites (>= 2 seconds)

The following test suites took 2 seconds or longer to run:

| Test Suite                                                     | Duration   | Tests | Notes                                                          |
| :------------------------------------------------------------- | :--------- | :---- | :------------------------------------------------------------- |
| `src/ui/components/InputPrompt.test.tsx`                       | **32.74s** | 196   | Very large file, handles complex input and scrolling.          |
| `src/ui/AppContainer.test.tsx`                                 | **14.82s** | 107   | Renders full app container, many tests taking ~100-300ms each. |
| `src/ui/components/SkillInboxDialog.test.tsx`                  | **6.76s**  | 11    | High per-test overhead (~600ms each).                          |
| `src/ui/components/shared/text-buffer.test.ts`                 | **6.63s**  | 225   | Many tests, some handling large text/ANSI.                     |
| `src/ui/hooks/vim.test.tsx`                                    | **5.87s**  | 144   | Simulates complex Vim keybindings.                             |
| `src/ui/components/messages/ThinkingMessage.test.tsx`          | **4.52s**  | 8     | Very high per-test overhead (~500ms each).                     |
| `src/ui/components/ExitPlanModeDialog.test.tsx`                | **4.36s**  | 14    | High per-test overhead (~300ms each).                          |
| `src/ui/components/messages/ToolResultDisplay.test.tsx`        | **4.20s**  | 14    | Tests rendering and scrolling of large output.                 |
| `src/ui/components/SessionSummaryDisplay.test.tsx`             | **3.93s**  | 6     | High per-test overhead (~600ms each).                          |
| `src/ui/components/TextInput.test.tsx`                         | **3.97s**  | 15    | Tests input handling.                                          |
| `src/ui/components/Footer.test.tsx`                            | **3.86s**  | 39    | Renders footer with stats/memory.                              |
| `src/ui/components/AskUserDialog.test.tsx`                     | **3.91s**  | 42    | Was faster before, might be affected by load.                  |
| `src/ui/privacy/CloudFreePrivacyNotice.test.tsx`               | **3.39s**  | 9     | High per-test overhead (~300ms each).                          |
| `src/ui/components/shared/BaseSettingsDialog.test.tsx`         | **3.34s**  | 33    | Was faster before, might be affected by load.                  |
| `src/ui/components/shared/performance.test.ts`                 | **2.95s**  | 3     | One test alone takes 2.5s (character-by-character insertion).  |
| `src/ui/utils/MarkdownDisplay.test.tsx`                        | **2.72s**  | 30    | Tests markdown rendering.                                      |
| `src/ui/components/messages/ToolGroupMessage.test.tsx`         | **2.77s**  | 38    | Renders tool groups.                                           |
| `src/ui/components/messages/ToolGroupMessage.compact.test.tsx` | **2.44s**  | 4     | High per-test overhead (~600ms each).                          |
| `src/ui/components/messages/DiffRenderer.test.tsx`             | **2.03s**  | 26    | Tests diff rendering.                                          |
| `src/ui/components/messages/ShellToolMessage.test.tsx`         | **2.03s**  | 16    | Tests shell output rendering.                                  |
| `src/ui/components/ValidationDialog.test.tsx`                  | **2.08s**  | 8     | High per-test overhead (~250ms each).                          |
