# Plan: UX Guidelines Implementation

**Status:** Planning **Goal:** Update `feat/settings-naming-consistency` to
fully align with `UX_GUIDELINES.md`.

## 1. Analysis of Current State vs. Guidelines

| Guideline                  | Current State                                     | Action Required                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| :------------------------- | :------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1. Noun-First Labels**   | Partially compliant (e.g., `Vim Mode`).           | Audit all labels. Ensure "Prompt Completion" vs "Enable Prompt Completion".                                                                                                                                                                                                                                                                                                                                                                                                           |
| **2. Positive Logic**      | Compliant (renamed `disableX` -> `autoUpdate`).   | Verify no lingering negative labels (e.g., `disableYoloMode`).                                                                                                                                                                                                                                                                                                                                                                                                                        |
| **3. Show/Hide Semantics** | **Non-Compliant**. We use `Hide Footer: Enabled`. | **MAJOR CHANGE:** Rename `hideX` -> `showX` (or just `X`). Update values to `Visible/Hidden` or `Show/Hide` for these specific types? <br> _Correction based on Guideline 3:_ "Use `Status Bar: Show`". This implies the _value_ might need to be "Show" or "Hide" instead of "Enabled/Disabled", OR the setting key logic needs inversion (`hideFooter` -> `footerVisibility`?). <br> **Decision:** Invert logic to `showX`. Rename `hideFooter` -> `showFooter` (or just `Footer`). |
| **4. Value Terminology**   | Compliant (`Enabled`/`Disabled`).                 | Keep as is for functional settings. Consider `Visible`/`Hidden` for UI elements (Guideline 3).                                                                                                                                                                                                                                                                                                                                                                                        |

## 2. Proposed Changes

### A. Rename "Hide" Settings to "Show" (Logic Inversion)

We need to invert the boolean logic for UI visibility settings to follow
Guideline #2 (Positive Logic) and #3 (Visual Toggles).

- `ui.hideWindowTitle` -> `ui.windowTitle` (Default: `true` -> "Visible"?)
  _Wait, default is currently `false` (hidden)._
  - Old: `hideWindowTitle: false` (Window title is visible)
  - New: `windowTitle: true` (Window title is visible) or
    `showWindowTitle: true`.
  - **Guideline 1 (Noun First):** Label should be `Window Title`.
  - **Value:** `Visible` / `Hidden`.

**List of "Hide" Settings to Invert:**

1.  `hideWindowTitle` -> `windowTitle`
2.  `hideTips` -> `tips`
3.  `hideBanner` -> `banner`
4.  `hideContextSummary` -> `contextSummary`
5.  `hideCWD` -> `footer.cwd`
6.  `hideSandboxStatus` -> `footer.sandboxStatus`
7.  `hideModelInfo` -> `footer.modelInfo`
8.  `hideContextPercentage` -> `footer.contextPercentage`
9.  `hideFooter` -> `footer.visibility` (or just `footer`)

### B. Rename "Disable" Settings (Security)

1.  `disableYoloMode` -> `yoloMode` (Value: Enabled/Disabled).
    - Old: `disableYoloMode: true` -> YOLO is OFF.
    - New: `yoloMode: false` -> YOLO is OFF.

### C. UI Rendering Update

Update `getDisplayValue` in `settingsUtils.ts`:

- Standard Booleans: `Enabled` / `Disabled`
- Visibility Settings (identified by category 'UI' or specific keys?): `Visible`
  / `Hidden` or `Show` / `Hide`.
  - _Guideline 3 says:_ "Use `Show`/`Hide` or `Visible`/`Hidden`".
  - Let's stick to `Enabled`/`Disabled` for functional features (`Vim Mode`),
    and maybe `Visible`/`Hidden` for UI elements if we can distinguish them.
  - _Simplification:_ If we just rename `Hide Footer` to `Footer`, then
    `Footer: Enabled` is okay, but `Footer: Visible` is better.
  - _Constraint:_ The schema doesn't have a "subtype" for visibility booleans.
  - _Proposal:_ Add a `presentation` field to the schema? Or just infer from
    "Show/Hide" prefix in label?
  - _Refined Proposal:_ For now, let's stick to `Enabled`/`Disabled` for
    everything to keep it simple, BUT ensure the Label is a Noun.
    `Footer: Enabled` (means visible). `Footer: Disabled` (means hidden). This
    satisfies Noun-First and Positive Logic.

### D. Migration Logic Update

This is the heavy lift. We need to migrate `hideX` to `showX` (inverting values)
and `disableYolo` to `yolo` (inverting values).

## 3. Execution Steps

1.  **Schema Update (`settingsSchema.ts`)**:
    - Rename all `hide*` keys to their positive noun equivalents (e.g.,
      `hideTips` -> `tips`).
    - Invert their default values (e.g., if `hideTips` default was `false`
      (visible), `tips` default becomes `true` (visible)).
    - Rename `disableYoloMode` -> `yoloMode`.
    - Update Labels to be purely Noun-based (e.g., "Window Title", "Application
      Banner", "YOLO Mode").

2.  **Migration Logic (`settings.ts`)**:
    - Add handlers for `hide*` -> `noun` (INVERT value).
    - Add handler for `disableYoloMode` -> `yoloMode` (INVERT value).

3.  **Codebase Refactor**:
    - Find/Replace all usages of `settings.ui.hideTips` with `settings.ui.tips`
      (and invert logic where consumed: `if (!settings.tips)` becomes
      `if (settings.tips)`). **Wait, actually:**
      - Old code: `if (settings.hideTips)` (do not show)
      - New code: `if (!settings.tips)` (do not show)
    - This requires careful manual checking or smart regex replacement.

4.  **Verify**:
    - `npm run preflight`
    - Manual UI check (`/settings`).

## 4. Branch Strategy

Since we are already on `feat/settings-naming-consistency` and it's a "fast
follow" to the previous PR, we can just push more commits to this branch to
update the PR.

**Next Action:** Approval to proceed with this plan?
