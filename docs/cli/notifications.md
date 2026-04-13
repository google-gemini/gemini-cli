# Notifications

Gemini CLI can provide run-event notifications to alert you when an action is
required or when a long-running session completes.

## Overview

Notifications help you stay informed about the agent's progress without
constantly monitoring the terminal. When enabled, Gemini CLI uses system-level
notifications to alert you in the following scenarios:

- **Action required:** When the agent is waiting for your approval to execute a
  tool.
- **Session completed:** When a sequence of tasks has finished.
- **Critical errors:** When a session terminates due to an error.

## Enable notifications

To enable notifications, set the `general.enableNotifications` setting to
`true`.

```bash
gemini config set general.enableNotifications true
```

Alternatively, you can enable them via the `/settings` dialog:

1.  Open the settings dialog by typing `/settings`.
2.  Navigate to the **General** category.
3.  Check the **Enable Notifications** box.

## Requirements

Notifications depend on your operating system's capabilities:

- **macOS:** Uses the built-in Notification Center.
- **Linux:** Requires a notification daemon (like `dunst` or `notify-osd`) and
  the `notify-send` utility.
- **Windows:** Uses the Windows Action Center.

<!-- prettier-ignore -->
> [!NOTE]
> In some terminal environments or remote sessions (like SSH), system
> notifications may not be available or may require additional configuration on
> the host machine.
