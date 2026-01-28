# Component Translation Status & Plan

## Current State (Last audited: 2026-01-27, fifth audit 2026-01-27 — comprehensive agent-verified)

### Already Migrated (25 components use `useTranslation`)

| Component                          | Namespace   | Import Style                                    |
| ---------------------------------- | ----------- | ----------------------------------------------- |
| `AuthDialog.tsx`                   | `dialogs`   | Custom wrapper (`../../i18n/useTranslation.js`) |
| `Help.tsx`                         | `help`      | Custom wrapper                                  |
| `SettingsDialog.tsx`               | `dialogs`   | Custom wrapper                                  |
| `StatsDisplay.tsx`                 | _(default)_ | `react-i18next`                                 |
| `SessionSummaryDisplay.tsx`        | _(default)_ | `react-i18next`                                 |
| `AuthInProgress.tsx`               | `auth`      | `react-i18next`                                 |
| `LoginWithGoogleRestartDialog.tsx` | `auth`      | `react-i18next`                                 |
| `ApiAuthDialog.tsx`                | `auth`      | `react-i18next`                                 |
| `AdminSettingsChangedDialog.tsx`   | `dialogs`   | `react-i18next`                                 |
| `ApprovalModeIndicator.tsx`        | `ui`        | `react-i18next`                                 |
| `AskUserDialog.tsx`                | `dialogs`   | `react-i18next`                                 |
| `CopyModeWarning.tsx`              | `ui`        | `react-i18next`                                 |
| `ExitWarning.tsx`                  | `ui`        | `react-i18next`                                 |
| `LogoutConfirmationDialog.tsx`     | `dialogs`   | `react-i18next`                                 |
| `LoopDetectionConfirmation.tsx`    | `dialogs`   | `react-i18next`                                 |
| `RawMarkdownIndicator.tsx`         | `ui`        | `react-i18next`                                 |
| `ShellModeIndicator.tsx`           | `ui`        | `react-i18next`                                 |
| `FolderTrustDialog.tsx`            | `dialogs`   | `react-i18next`                                 |
| `ConsentPrompt.tsx`                | `dialogs`   | `react-i18next`                                 |
| `IdeTrustChangeDialog.tsx`         | `dialogs`   | `react-i18next`                                 |
| `ShowMoreLines.tsx`                | `ui`        | `react-i18next`                                 |
| `NewAgentsNotification.tsx`        | `dialogs`   | `react-i18next`                                 |
| `IdeIntegrationNudge.tsx`          | `dialogs`   | `react-i18next`                                 |
| `ValidationDialog.tsx`             | `dialogs`   | `react-i18next`                                 |
| `RewindConfirmation.tsx`           | `dialogs`   | `react-i18next`                                 |

### Existing Namespaces (9 registered in `i18n/index.ts`)

| Namespace  | EN Keys | JA Keys | Status                    |
| ---------- | ------- | ------- | ------------------------- |
| `common`   | 31      | 31      | ✅ Active, perfect parity |
| `help`     | 28      | 28      | ✅ Active, perfect parity |
| `dialogs`  | 62      | 62      | ✅ Active, perfect parity |
| `loading`  | 156     | 156     | ✅ Active, perfect parity |
| `commands` | 88      | 88      | ✅ Active, perfect parity |
| `ui`       | 12      | 12      | ✅ Active, perfect parity |
| `auth`     | 12      | 12      | ✅ Active, perfect parity |
| `messages` | 0       | 0       | 🟡 Registered, **empty**  |
| `privacy`  | 0       | 0       | 🟡 Registered, **empty**  |

**Total translated keys: 390 EN / 390 JA (100% parity on active namespaces)**

### Correct Directory Paths (for reference)

```
packages/cli/src/ui/
├── components/
│   ├── *.tsx                    ← Main component files
│   ├── messages/*.tsx           ← Message display components
│   ├── shared/*.tsx             ← Shared/reusable components
│   └── views/*.tsx              ← View/list components
├── privacy/*.tsx                ← Privacy notice components
├── auth/*.tsx                   ← Auth components (all migrated)
├── commands/*.ts                ← Slash command handlers (NEW — not in original plan)
├── constants/wittyPhrases.ts    ← 137 loading phrases (NEW)
├── editors/editorSettingsManager.ts ← Editor labels (NEW)
└── textConstants.ts             ← Non-component string constants
```

---

## Remaining Work

### Completed Tasks

- **Task 0** (namespace setup): ✅ DONE
- **Task 1** (AdminSettings, AskUser, FolderTrust): ✅ DONE
- **Task 2** (Logout, LoopDetection, Consent, IdeTrustChange): ✅ DONE
- **Task 4** (Auth components): ✅ DONE
- **Task 5** (Indicator components): ✅ DONE
- **Task 6** (Warning/Status): ✅ CopyMode, ExitWarning, ShowMoreLines — ALL
  DONE
- **Batch A** (FolderTrust, Consent, IdeTrustChange): ✅ DONE
- **Batch B1** (ShowMoreLines): ✅ DONE (verified in codebase)
- **Batch B2** (NewAgentsNotification): ✅ DONE (verified in codebase)
- **Batch B4** (ValidationDialog): ✅ DONE (verified 2026-01-27 fourth audit —
  has `useTranslation('dialogs')`)

### Still Remaining

- **B3** (IdeIntegrationNudge): ✅ Already migrated (verified in codebase)
- **B5** (RewindConfirmation): ✅ Already migrated (verified — has
  `useTranslation('dialogs')` on line 10)
- **Batches C–G** (dialogs + UI components): ❌ Need migration (~30 files)
- **Batch H** (message components): ❌ Need migration (~5 files)
- **Batch I** (privacy components): ❌ Need migration (~3 files)
- **Batch J** (shared + textConstants): ❌ Need migration (~5 files)
- **Batch K** (views directory): ❌ Need migration (~7 files)
- **Batch L** (scattered remaining): ❌ Need migration (~3 files)
- **Batch Q** (slash command handlers): ❌ Need migration (~24 files)
- **Batch R** (non-component special files): ❌ Need migration (~3 files)
- **Batch T** (third-audit discoveries): ❌ Need migration (~5 files)
- **Batch S** (Final verification): ❌ Blocked by above

### Unmigrated Directories (0% coverage)

| Directory               | Source Files (non-test) | useTranslation? |
| ----------------------- | ----------------------- | --------------- |
| `components/views/`     | 7                       | ❌ None         |
| `components/messages/`  | ~17                     | ❌ None         |
| `components/shared/`    | ~13 (many structural)   | ❌ None         |
| `privacy/`              | 4                       | ❌ None         |
| `commands/` (.ts files) | ~25 with strings        | ❌ None (NEW)   |

---

## Execution Plan (RAM-Safe, One-at-a-Time)

> **CRITICAL CONSTRAINT**: Limited RAM on this machine. Previous attempts to
> migrate multiple components at once caused segfaults. **Work on ONE component
> at a time**, verify it compiles, then move to the next.

### Execution Protocol (MANDATORY for each component)

```
For each component file:
1. Read the component file
2. Identify all hard-coded user-facing strings
3. Add translation keys to EN JSON (appropriate namespace)
4. Add translation keys to JA JSON (appropriate namespace)
5. Update the component to use useTranslation() hook
6. Run: npm run build (in packages/cli)
7. Verify no regressions
8. Move to next component
```

**DO NOT batch multiple components. ONE AT A TIME.**

---

### Batch A — Finish Partially-Done Tasks (3 files) ✅ COMPLETE

All three components (FolderTrustDialog, ConsentPrompt, IdeTrustChangeDialog)
have been migrated and are using `useTranslation('dialogs')`.

---

### Batch B — Small Dialog Components (5 files) ✅ COMPLETE

| #   | File                        | Namespace | Notes                                             | Status |
| --- | --------------------------- | --------- | ------------------------------------------------- | ------ |
| B1  | `ShowMoreLines.tsx`         | `ui`      | From Task 6, 1 string                             | ✅     |
| B2  | `NewAgentsNotification.tsx` | `dialogs` | ~5 strings                                        | ✅     |
| B3  | `IdeIntegrationNudge.tsx`   | `dialogs` | ~6 strings, lives in `ui/` root not `components/` | ✅     |
| B4  | `ValidationDialog.tsx`      | `dialogs` | ~4 strings                                        | ✅     |
| B5  | `RewindConfirmation.tsx`    | `dialogs` | Verified — has `useTranslation('dialogs')`        | ✅     |

---

### Batch C — Complex Dialog Components (4 files) ✅ COMPLETE

**Estimated strings**: ~50

| #   | File                               | Namespace | Notes                                     | Status |
| --- | ---------------------------------- | --------- | ----------------------------------------- | ------ |
| C1  | `ModelDialog.tsx`                  | `dialogs` | ~15 strings including model names, hints  | ✅     |
| C2  | `AgentConfigDialog.tsx`            | `dialogs` | ~20 strings (field labels + descriptions) | ✅     |
| C3  | `MultiFolderTrustDialog.tsx`       | `dialogs` | Similar to FolderTrust                    | ✅     |
| C4  | `PermissionsModifyTrustDialog.tsx` | `dialogs` | Trust-related strings                     | ✅     |

**Verify after EACH file**: `npm run build` (in `packages/cli`)

---

### Batch D — More Dialogs + Editor (4 files) ✅ COMPLETE

**Estimated strings**: ~30

| #   | File                       | Namespace | Notes                   | Status |
| --- | -------------------------- | --------- | ----------------------- | ------ |
| D1  | `EditorSettingsDialog.tsx` | `dialogs` | Settings UI strings     | ✅     |
| D2  | `SessionBrowser.tsx`       | `dialogs` | Session list UI         | ✅     |
| D3  | `RewindViewer.tsx`         | `dialogs` | Rewind navigation UI    | ✅     |
| D4  | `ProQuotaDialog.tsx`       | `dialogs` | Quota/upgrade messaging | ✅     |

**Verify after EACH file**: `npm run build` (in `packages/cli`)

---

### Batch E — UI Display Components, Part 1 (5 files) ✅ COMPLETE

**Estimated strings**: ~25

| #   | File                        | Namespace | Notes                        | Status |
| --- | --------------------------- | --------- | ---------------------------- | ------ |
| E1  | `AboutBox.tsx`              | `ui`      | ~12 label strings            | ✅     |
| E2  | `LoadingIndicator.tsx`      | `ui`      | 1 string with interpolation  | ✅     |
| E3  | `ConfigInitDisplay.tsx`     | `ui`      | 3 strings with interpolation | ✅     |
| E4  | `ConsoleSummaryDisplay.tsx` | `ui`      | 2 strings                    | ✅     |
| E5  | `ContextSummaryDisplay.tsx` | `ui`      | ~5 strings                   | ✅     |

**Verify after EACH file**: `npm run build` (in `packages/cli`)

---

### Batch F — UI Display Components, Part 2 + New Discoveries (5 files) ✅ COMPLETE

**Estimated strings**: ~20

| #   | File                          | Namespace | Notes                                                          | Status |
| --- | ----------------------------- | --------- | -------------------------------------------------------------- | ------ |
| F1  | `HookStatusDisplay.tsx`       | `ui`      | "Executing Hooks", "Executing Hook"                            | ✅     |
| F2  | `Footer.tsx`                  | `ui`      | ~6 strings ("untrusted", "macOS Seatbelt", "no sandbox", etc.) | ✅     |
| F3  | `DetailedMessagesDisplay.tsx` | `ui`      | "Debug Console", "(F12 to close)"                              | ✅     |
| F4  | `InputPrompt.tsx`             | `ui`      | **NEW** — ~4 strings ("Shell commands cannot be queued", etc.) | ✅     |
| F5  | `Composer.tsx`                | `ui`      | **NEW** — ~4 strings ("Resuming session...", vim mode, etc.)   | ✅     |

> **Removed from previous plan** (confirmed structural, no user-facing strings):
> `ContextUsageDisplay.tsx`, `Notifications.tsx`

**Verify after EACH file**: `npm run build` (in `packages/cli`)

---

### Batch G — Stats Display + Theme (3 files) ✅ COMPLETE

**Estimated strings**: ~16

| #   | File                    | Namespace | Notes                                                          | Status |
| --- | ----------------------- | --------- | -------------------------------------------------------------- | ------ |
| G1  | `ModelStatsDisplay.tsx` | `ui`      | ~7 strings ("API", "Requests", "Errors", "Cache", "Tokens"…)   | ✅     |
| G2  | `ToolStatsDisplay.tsx`  | `ui`      | ~5 strings (tool statistics labels)                            | ✅     |
| G3  | `ThemeDialog.tsx`       | `dialogs` | ~4 strings ("Default Light", "Custom", "(Incompatible)", etc.) | ✅     |

> **Removed from previous plan** (confirmed structural, no user-facing strings):
> `QuittingDisplay.tsx`, `QueuedMessageDisplay.tsx`, `MemoryUsageDisplay.tsx`

**Verify after EACH file**: `npm run build` (in `packages/cli`)

---

### Batch H — Message Components (5 files) ✅ COMPLETE

**Estimated strings**: ~35 **Namespace**: `messages` (currently empty — will
populate)

| #   | File                                   | Notes                                                      | Status |
| --- | -------------------------------------- | ---------------------------------------------------------- | ------ |
| H1  | `messages/Todo.tsx`                    | ~8 strings (title, progress, status labels, aria labels)   | ✅     |
| H2  | `messages/CompressionMessage.tsx`      | ~7 strings (compression status messages)                   | ✅     |
| H3  | `messages/ToolConfirmationMessage.tsx` | ~17 strings ("Allow once", "Allow for this session", etc.) | ✅     |
| H4  | `messages/DiffRenderer.tsx`            | ~2 strings ("No diff content.", "No changes detected.")    | ✅     |
| H5  | `messages/ModelMessage.tsx`            | ~1 string ("Responding with {model}")                      | ✅     |

> **Removed from previous plan** (confirmed structural, no user-facing strings):
> `ToolShared.tsx` (utility functions only),
> `AlternateBufferQuittingDisplay.tsx` (structural)

**Verify after EACH file**: `npm run build` (in `packages/cli`)

---

### Batch I — Privacy Notice Components (3 files) ✅ COMPLETE

**Estimated strings**: ~22 (long legal text values) **Namespace**: `privacy`
(currently empty — will populate)

| #   | File                                 | Notes                                                         | Status |
| --- | ------------------------------------ | ------------------------------------------------------------- | ------ |
| I1  | `privacy/GeminiPrivacyNotice.tsx`    | Legal text — copy EXACTLY (~7 strings)                        | ✅     |
| I2  | `privacy/CloudFreePrivacyNotice.tsx` | Legal text + opt-in UI (~10 strings, "Loading…", "Yes", "No") | ✅     |
| I3  | `privacy/CloudPaidPrivacyNotice.tsx` | Legal text (~5 strings)                                       | ✅     |

> `privacy/PrivacyNotice.tsx` — confirmed structural (pure routing component).
> SKIP.

**Verify after EACH file**: `npm run build` (in `packages/cli`)

---

### Batch J — Shared Components + textConstants (4 files) ✅ COMPLETE

**Estimated strings**: ~16 **Namespace**: `dialogs` / `ui`

| #   | File                            | Namespace         | Notes                                                                                                                   | Status |
| --- | ------------------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- | ------ |
| J1  | `shared/BaseSettingsDialog.tsx` | `dialogs`         | ~5 strings ("Search to filter", "No matches found.", Enter/Tab/Esc help text)                                           | ✅     |
| J2  | `shared/ScopeSelector.tsx`      | `dialogs`         | ~1 string ("Apply To")                                                                                                  | ✅     |
| J3  | `shared/MaxSizedBox.tsx`        | `ui`              | **NEW** — ~2 strings ("... first N lines hidden ...", "... last N lines hidden ...")                                    | ✅     |
| J4  | `textConstants.ts`              | `ui` / `messages` | ~8 strings — screen reader prefixes, redirection warnings — **not a React component**, needs `t()` from `i18n/index.ts` | ✅     |

> `ToolConfirmationMessage.tsx` moved to **Batch H3** (message components).

**Verify after EACH file**: `npm run build` (in `packages/cli`)

---

### Batch K — Views Directory (7 files) ✅ COMPLETE

**Estimated strings**: ~60 **Namespace**: `ui` (new key prefix: `views.*`)

| #   | File                                  | Notes                                                 | Status |
| --- | ------------------------------------- | ----------------------------------------------------- | ------ |
| K1  | `components/views/McpStatus.tsx`      | ~20 strings — status labels, section headers, plurals | ✅     |
| K2  | `components/views/AgentsStatus.tsx`   | ~5 strings                                            | ✅     |
| K3  | `components/views/ToolsList.tsx`      | 2 strings                                             | ✅     |
| K4  | `components/views/SkillsList.tsx`     | ~5 strings                                            | ✅     |
| K5  | `components/views/HooksList.tsx`      | ~10 strings — security warning, labels, tip text      | ✅     |
| K6  | `components/views/ExtensionsList.tsx` | ~8 strings — status labels, headers                   | ✅     |
| K7  | `components/views/ChatList.tsx`       | 4 strings                                             | ✅     |

**Verify after EACH file**: `npm run build` (in `packages/cli`)

---

### Batch L — Remaining Scattered Components (2 files) ✅ COMPLETE

**Estimated strings**: ~2

| #   | File                   | Namespace | Notes                            | Status |
| --- | ---------------------- | --------- | -------------------------------- | ------ |
| L1  | `DialogManager.tsx`    | `dialogs` | "Authentication cancelled."      | ✅     |
| L2  | `LoadingIndicator.tsx` | `ui`      | "esc to cancel" template literal | ✅     |

> **Removed from previous plan** (confirmed structural — render dynamic content
> from textConstants or props, no hard-coded strings of their own):
> `DiffRenderer.tsx` (moved to H4), `GeminiMessage.tsx`, `UserMessage.tsx`,
> `GeminiRespondingSpinner.tsx`
>
> **Note**: Once `textConstants.ts` is migrated (Batch J4), the screen reader
> prefixes in GeminiMessage/UserMessage will automatically use translated
> strings. No separate migration needed for those files.

**Verify after EACH file**: `npm run build` (in `packages/cli`)

---

### ~~Batches N, O, P~~ — RESOLVED (fifth audit)

> **Fifth audit result**: All "Read first" items from Batches N, O, P have been
> verified by automated agent analysis reading every file.
>
> **Files with strings** have been relocated to existing batches:
>
> - `ToolStatsDisplay.tsx` → **Batch G2**
> - `Composer.tsx` → **Batch F5**
> - `InputPrompt.tsx` → **Batch F4**
> - `ToolConfirmationMessage.tsx` → **Batch H3**
> - `DiffRenderer.tsx` → **Batch H4**
> - `ModelMessage.tsx` → **Batch H5**
> - `Todo.tsx` → **Batch H1**
> - `CompressionMessage.tsx` → **Batch H2**
>
> **ALL remaining files confirmed structural (SKIP):** `StatusDisplay.tsx`,
> `SuggestionsDisplay.tsx`, `HistoryItemDisplay.tsx`, `Banner.tsx`,
> `Header.tsx`, `AppHeader.tsx`, `CliSpinner.tsx`, `ToolMessage.tsx`,
> `ToolGroupMessage.tsx`, `ToolResultDisplay.tsx`, `ShellToolMessage.tsx`,
> `ErrorMessage.tsx`, `InfoMessage.tsx`, `WarningMessage.tsx`,
> `GeminiMessageContent.tsx`, `UserShellMessage.tsx`, `GeminiMessage.tsx`,
> `UserMessage.tsx`

---

### Batch Q — NEW: Slash Command Handlers (HIGH STRING COUNT — ~25 files) ✅ COMPLETE

> **MAJOR GAP discovered in re-audit**: The `commands/*.ts` directory contains
> ~25 non-test files with an estimated **150+ user-facing strings** total. These
> are NOT React components — they use direct string output, so they need `t()`
> from `i18n/index.ts` (not the `useTranslation` hook).

**Namespace**: `commands` (already has 88 keys — will expand significantly)

**Pattern for non-component files:**

```typescript
import { t } from '../../i18n/index.js';
// Then use t('commands:keyName') in output strings
```

#### Q-Part 1: High-string commands (5 files, ~80 strings) ✅ COMPLETE

| #   | File                   | Est. Strings | Notes                                       | Status |
| --- | ---------------------- | ------------ | ------------------------------------------- | ------ |
| Q1  | `extensionsCommand.ts` | ~20          | List, update, enable, disable, install msgs | ✅     |
| Q2  | `mcpCommand.ts`        | ~20          | Auth, enable, disable, status messages      | ✅     |
| Q3  | `chatCommand.ts`       | ~15          | Save, resume, delete, share operations      | ✅     |
| Q4  | `hooksCommand.ts`      | ~15          | Enable, disable, status messages            | ✅     |
| Q5  | `skillsCommand.ts`     | ~10          | Enable, disable, reload feedback            | ✅     |

#### Q-Part 2: Medium-string commands (5 files, ~40 strings) ✅ COMPLETE

| #   | File                    | Est. Strings | Notes                           | Status |
| --- | ----------------------- | ------------ | ------------------------------- | ------ |
| Q6  | `ideCommand.ts`         | ~10          | Connection status, install msgs | ✅     |
| Q7  | `agentsCommand.ts`      | ~15          | Agent management messages       | ✅     |
| Q8  | `memoryCommand.ts`      | ~5           | Memory management messages      | ✅     |
| Q9  | `restoreCommand.ts`     | ~5           | Restore operation messages      | ✅     |
| Q10 | `permissionsCommand.ts` | ~3           | Permission error messages       | ✅     |

#### Q-Part 3: Low-string commands (10 files, ~25 strings) ✅ COMPLETE

| #   | File                      | Est. Strings | Notes                         | Status |
| --- | ------------------------- | ------------ | ----------------------------- | ------ |
| Q11 | `bugCommand.ts`           | ~8           | Bug report messages           | ✅     |
| Q12 | `compressCommand.ts`      | ~3           | Compression feedback          | ✅     |
| Q13 | `copyCommand.ts`          | ~3           | Copy feedback                 | ✅     |
| Q14 | `docsCommand.ts`          | ~2           | Documentation messages        | ✅     |
| Q15 | `setupGithubCommand.ts`   | ~3           | GitHub setup messages         | ✅     |
| Q16 | `terminalSetupCommand.ts` | ~2           | Terminal setup messages       | ✅     |
| Q17 | `vimCommand.ts`           | ~2           | Vim mode messages             | ✅     |
| Q18 | `initCommand.ts`          | ~1           | Init confirmation             | ✅     |
| Q19 | `policiesCommand.ts`      | ~3           | Info messages, section titles | ✅     |

**Commands with NO hard-coded strings (SKIP):** `aboutCommand.ts`,
`authCommand.ts`, `clearCommand.ts`, `corgiCommand.ts`, `editorCommand.ts`,
`helpCommand.ts`, `modelCommand.ts`, `privacyCommand.ts`, `quitCommand.ts`,
`resumeCommand.ts`, `settingsCommand.ts`, `themeCommand.ts`, `toolsCommand.ts`

> **Fifth audit corrections**: `clearCommand.ts` moved to SKIP (debug messages
> only). `bugCommand.ts` string count corrected to ~8. `agentsCommand.ts`
> corrected to ~15.

**Verify after EACH file**: `npm run build` (in `packages/cli`)

---

### Batch R — Non-Component Special Files (3 files) ✅ COMPLETE

**Estimated strings**: ~10 (wittyPhrases skipped)

| #   | File                               | Namespace  | Est. Strings | Notes                                                | Status |
| --- | ---------------------------------- | ---------- | ------------ | ---------------------------------------------------- | ------ |
| R1  | `constants/wittyPhrases.ts`        | `loading`  | **137**      | SKIPPED as per user request (maintain humor context) | ⏩     |
| R2  | `editors/editorSettingsManager.ts` | `ui`       | ~3           | "None", "Not installed", "Not available in sandbox"  | ✅     |
| R3  | `directoryCommand.tsx`             | `commands` | ~8           | Error messages, info messages, usage info            | ✅     |

**Note**: `constants/tips.ts` is ALREADY migrated (loads from i18n). SKIP.

**Verify after EACH file**: `npm run build` (in `packages/cli`)

---

### Batch T — Files Discovered in Third/Fifth Audit (5 files) ✅ COMPLETE

| #   | File                        | Namespace  | Est. Strings | Notes                                                         | Status |
| --- | --------------------------- | ---------- | ------------ | ------------------------------------------------------------- | ------ |
| T1  | `Tips.tsx`                  | `ui`       | ~5           | "Tips for getting started:", numbered tip text, GEMINI.md ref | ✅     |
| T2  | `ToolConfirmationQueue.tsx` | `messages` | ~2           | "Action Required", "{index} of {total}"                       | ✅     |
| T3  | `rewindCommand.tsx`         | `commands` | ~4           | Error and info messages                                       | ✅     |
| T4  | `profileCommand.ts`         | `commands` | ~1           | Info message                                                  | ✅     |
| T5  | `statsCommand.ts`           | `commands` | ~2           | Error message                                                 | ✅     |

**Note**: `UpdateNotification.tsx` was checked — it only renders a dynamic
`message` prop with no hard-coded strings. **SKIP**.

**Verify after EACH file**: `npm run build` (in `packages/cli`)

---

### Batch S — Final Verification ✅ COMPLETE

- [x] `npm run build` in `packages/cli` → exit 0
- [x] `npm run typecheck` in `packages/cli` → exit 0
- [x] Grep check: no remaining hard-coded user-facing strings in migrated files
- [x] Verify en/ja key parity across all 9 namespaces
- [x] Spot-check with `GEMINI_LANG=ja`
