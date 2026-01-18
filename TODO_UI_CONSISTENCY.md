# UI Consistency Refactor Progress

## 1. Noun-First Labels (Functional)

- [x] Renamed `enable*` to concise nouns (e.g., `autoUpdate`, `vimMode`,
      `hooks`).
- [x] Verified labels are noun-first (e.g., "Vim Mode" instead of "Enable Vim
      Mode").

## 2. Positive Logic & Noun-First Labels (Visibility)

- [x] Renamed `hide*` to positive noun equivalents (e.g., `windowTitle`,
      `usageTips`, `footerEnabled`).
- [x] Renamed `disableYoloMode` to `yoloMode`.
- [x] Inverted logic logic polarity in schema (defaults) and codebase.
- [x] Updated migration logic to handle logic inversion for `hide*` and
      `disable*`.

## 3. Standardized Boolean Display Values

- [x] Standardized on "Enabled/Disabled" for all boolean settings.
- [x] Updated `getDisplayValue` in `settingsUtils.ts`.

## 4. Verification

- [x] All packages build successfully (`npm run build`).
- [x] Typechecking passes (`tsc --noEmit`).
- [x] Documentation and schema updated.
- [x] Migration logic verified (in code).
