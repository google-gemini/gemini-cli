# Plan: Desktop Notification for User Permission Prompts

This plan outlines the steps to implement desktop notifications when the Gemini
CLI requires user permission and is not in focus.

## 1. Add Dependencies

We need `node-notifier` for cross-platform notifications.

- **Action:** Add `node-notifier` to `packages/cli/package.json` dependencies.
- **Action:** Add `@types/node-notifier` to `packages/cli/package.json`
  devDependencies.
- **Command:** `npm install` (to be run by the agent)

## 2. Update Settings Schema

Add a new setting `enableNotifications` to
`packages/cli/src/config/settingsSchema.ts`.

- **Location:** Inside `SETTINGS_SCHEMA.ui.properties`.
- **Definition:**
  ```typescript
  enableNotifications: {
    type: 'boolean',
    label: 'Enable Desktop Notifications',
    category: 'UI',
    requiresRestart: false,
    default: false,
    description: 'Enable desktop notifications for user permission prompts when the CLI is not in focus.',
    showInDialog: true,
  },
  ```

## 3. Implement Notification Hook

Create a new hook `useNotification` in
`packages/cli/src/ui/hooks/useNotification.ts`.

- **Input:**
  - `streamingState`: To detect when the CLI is `WaitingForConfirmation`.
  - `isFocused`: To check if the terminal is currently focused.
  - `settings`: To check if `enableNotifications` is true.
- **Logic:**
  - Use `useEffect` to watch for changes in `streamingState`.
  - **Condition:** If `streamingState` changes to `WaitingForConfirmation` AND
    `!isFocused` AND `settings.ui.enableNotifications` is `true`:
    - Trigger `notifier.notify()`.
    - Title: "Gemini CLI"
    - Message: "Requires Permission to Execute Command" (or similar).
    - Sound: `true` (default).
    - Wait: `true` (to keep it open until interaction).
- **Focus Handling:**
  - `node-notifier`'s behavior on click varies by OS. On macOS, it typically
    focuses the terminal app. We will rely on the default behavior for now as
    programmatic focus of a specific CLI window is complex and OS-dependent.

## 4. Integrate into `AppContainer.tsx`

- **Action:** Import `useNotification` in
  `packages/cli/src/ui/AppContainer.tsx`.
- **Action:** Call the hook within the `AppContainer` component.
  - Retrieve settings using `const settings = useSettings();`.
  - Pass `streamingState`, `isFocused`, and `settings.merged` (or specifically
    `settings.merged.ui?.enableNotifications`) to the hook.

## 5. Automated Testing

Create a test file `packages/cli/src/ui/hooks/useNotification.test.ts`.

- **Mocking:** Use `vi.mock('node-notifier')` to mock the `notify` function.
- **Test Cases:**
  - **Should notify:** Verify `notifier.notify` is called when:
    - `streamingState` changes to `WaitingForConfirmation`.
    - `isFocused` is `false`.
    - `enableNotifications` setting is `true`.
  - **Should NOT notify if disabled:** Verify `notifier.notify` is NOT called if
    `enableNotifications` is `false`, even if other conditions are met.
  - **Should NOT notify if focused:** Verify `notifier.notify` is NOT called if
    `isFocused` is `true`.
  - **Should NOT notify if not waiting:** Verify `notifier.notify` is NOT called
    if `streamingState` is `Idle` or `Responding`.
  - **Content Verification:** Verify the `notify` call receives the correct
    title ("Gemini CLI") and message.

## 6. Verification

- **Test:** Run the CLI with default settings. Start a task requiring
  confirmation, focus away. Verify **NO** notification appears.
- **Test:** Enable notifications via `/settings` (or manually in
  `settings.json`).
- **Test:** Run the task again, focus away. Verify notification **DOES** appear.
- **Test:** Click the notification and verify behavior.
- **Test:** Verify no notification if the terminal is already focused.

## 7. Documentation

- **Action:** Run `npm run docs:settings` to automatically update
  `docs/get-started/configuration.md` with the new setting.

## 8. Preflight Check

- **Action:** Run `npm run preflight` to ensure no linting/type errors.
