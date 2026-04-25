# CI Optimization Report: Speedup & Lessons Learned

This report compares the total wall-clock time of the main branch workflows with
our optimized `Bundling Trial CI` run.

## Summary of Improvements

- **Total Wall-Clock Time:** Reduced from **~15 minutes** to **~2 minutes**!
  (Assuming we skip Mac tests for now, leaving only Linux E2E taking ~2m 13s!).
- **Mac E2E Duration:** Reduced from **~11 minutes** to **3m 43s** (when running
  tests).
- **Linux E2E Duration:** Reduced from **~7.7 minutes** to **2m 13s**.

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

## Key Insights

1. **`InputPrompt.test.tsx`** is by far the biggest offender (32.7s). It has
   many tests and likely involves time-dependent behavior or large renders.
2. **`AppContainer.test.tsx`** is slow due to the volume of tests (107) and the
   complexity of the component being rendered.
3. Several suites have very few tests but take many seconds (e.g.,
   `TopicMessage` in other runs, `ThinkingMessage` here taking 4.5s for 8
   tests). This suggests high setup/teardown costs or rendering delays.
4. **`performance.test.ts`** has a test that deliberately tests slow insertion,
   taking 2.5s.

## Recommendations

- Prioritize `InputPrompt.test.tsx` for global fake timers or splitting.
- Investigate test suites with high per-test overhead (e.g., `ThinkingMessage`,
  `SessionSummaryDisplay`).
