# Notifications (experimental)

Gemini CLI can send system notifications to alert you when a session completes
or when it needs your attention, such as when it's waiting for you to approve a
tool call.

<!-- prettier-ignore -->
> [!NOTE]
> This is an experimental feature currently under active development and
> may need to be enabled under `/settings`.

Notifications are particularly useful when running long-running tasks or using
[Plan Mode](./plan-mode.md), letting you switch to other windows while Gemini
CLI works in the background.

## Requirements

### Terminal support

The CLI uses the OSC 9 terminal escape sequence to trigger system notifications.
This is supported by several modern terminal emulators including iTerm2,
WezTerm, Ghostty, and Kitty. If your terminal does not support OSC 9
notifications, Gemini CLI falls back to a terminal bell (BEL) to get your
attention. Most terminals respond to BEL with a taskbar flash or system alert
sound.

## Enable notifications

Notifications are disabled by default. You can enable them using the `/settings`
command or by updating your `settings.json` file.

1.  Open the settings dialog by typing `/settings` in an interactive session.
2.  Navigate to the **General** category.
3.  Toggle the **Enable Notifications** setting to **On**.

Alternatively, add the following to your `settings.json`:

```json
{
  "general": {
    "enableNotifications": true
  }
}
```

## Types of notifications

Gemini CLI sends notifications for the following events:

- **Action required:** Triggered when the model is waiting for user input or
  tool approval. This helps you know when the CLI has paused and needs you to
  intervene.
- **Session complete:** Triggered when a session finishes successfully. This is
  useful for tracking the completion of automated tasks.

## Next steps

- Start planning with [Plan Mode](./plan-mode.md).
- Configure your experience with other [settings](./settings.md).
