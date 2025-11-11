# Alternate Screen Buffer

The Alternate Screen Buffer is a terminal feature that allows the Gemini CLI to
run in a separate screen, similar to text editors like `vim` or `nano`. This
mode provides a more robust and immersive user interface compared to the
standard inline mode.

## Key Benefits

Enabling the Alternate Screen Buffer unlocks several enhancements to the CLI
experience:

- **Flicker-Free Experience:** Our new design virtually eliminates screen
  flicker. For terminals supporting Terminal Synchronized mode (like iTerm,
  Ghostty, and VSCode), you'll experience zero flicker. We're also working on
  incremental rendering for other environments to further reduce flicker in the
  future. ⚡
- **No More Rendering Artifacts:** Previously, resizing your terminal could lead
  to visual glitches. These rendering artifacts are now a thing of the past,
  providing a clean and polished display. ✨
- **Sticky Headers:** Stay oriented within the UI with sticky headers. Tool
  confirmations and actions now have persistent header lines, ensuring you never
  lose context, even during complex interactions. 📌
- **Mouse-Based Navigation:** Enjoy the convenience of clicking to navigate
  within the input prompt. 🐭
- **Stable Input Prompt:** Say goodbye to the bouncing input prompt! It now
  remains anchored at the bottom of your terminal, providing a consistent and
  predictable experience.
- **Full Chat History on Exit:** Even though we’re now rendering with an
  alternate buffer, your complete chat history is still accessible upon exiting
  the CLI. Now you don’t have to worry that Gemini CLI will have cleared your
  terminal history. No matter what you have done while using Gemini CLI, on exit
  your previous input history is available.

## Enabling Alternate Screen Buffer

To enable this feature, update your `settings.json` file:

```json
{
  "ui": {
    "useAlternateBuffer": true
  }
}
```

Or use the configuration setting:

- **Setting:** `ui.useAlternateBuffer`
- **Default:** `false`

## Copy and Paste

When using the Alternate Screen Buffer, standard terminal selection and
copy/paste functionality might behave differently depending on your terminal
emulator and mouse support settings.

To facilitate copying text from the CLI output:

1.  **Toggle Copy Mode:** Press `Ctrl+S`.
2.  **Select Text:** Use your mouse to select the text you wish to copy.
3.  **Copy:** Use your terminal's copy shortcut (usually `Cmd+C` on macOS or
    `Ctrl+Shift+C` on Linux/Windows).
4.  **Exit Copy Mode:** Press any key or scroll to return to normal interaction.

In Copy Mode, the CLI may pause updates or disable mouse reporting to allow the
terminal to handle text selection natively.
