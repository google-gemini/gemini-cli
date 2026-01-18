# Settings Menu UX Guidelines

This document outlines the standard for displaying setting labels and values in
the Gemini CLI. The goal is to maximize scanability and reduce cognitive load by
using consistent, positive phrasing.

### 1. Label Syntax: Front-Load the Noun

Users scan settings lists alphabetically to find the _object_ they want to
modify. Do not start labels with verbs.

- **Principle:** Use Noun Phrases, not Verb Phrases.
- **Why:** Starting every line with "Enable..." or "Disable..." forces the user
  to read the middle of the sentence to identify the setting, creating a "River
  of Words" effect that hinders scanning.

| ❌ Avoid (Verb First)     | ✅ Recommended (Noun First) |
| :------------------------ | :-------------------------- |
| `Enable Vim Mode`         | `Vim Mode`                  |
| `Allow Prompt Completion` | `Prompt Completion`         |
| `Log Keystrokes`          | `Keystroke Logging`         |

### 2. Logic Polarity: Avoid Double Negatives

Never phrase a label based on its negative state. Users should not have to
calculate "Disable X = True" means "X is Off."

- **Principle:** Always frame the label in the positive affirmative.
- **Why:** Reduces mental calculation. "Auto Updates: Disabled" is instantly
  understood. "Disable Auto Updates: True" is confusing.

| ❌ Avoid (Negative Logic) | ✅ Recommended (Positive Logic) |
| :------------------------ | :------------------------------ |
| `Disable Auto Update`     | `Auto Updates`                  |
| `Suppress Warnings`       | `Warning Messages`              |
| `No Color Mode`           | `Colors`                        |

### 3. Visual Toggles: "Show" vs. "Hide"

For settings that control the visibility of UI elements, avoid negative phrasing
like "Hide."

- **Principle:** Frame visual settings as the presence of the element.
- **Recommendation:** Use `Show`/`Hide` or `Visible`/`Hidden` as the values,
  rather than `Enabled`/`Disabled`.

| ❌ Avoid                | ✅ Recommended     |
| :---------------------- | :----------------- |
| `Hide Status Bar: True` | `Status Bar: Show` |
| `Hide Footer: False`    | `Footer: Show`     |
| `Show Tips: False`      | `Usage Tips: Hide` |

### 4. Value Terminology: Semantic State

Avoid exposing raw data types to the user.

- **Principle:** Use `Enabled/Disabled` or `On/Off` instead of `true/false`.
- **Why:** `true/false` feels like a raw configuration file or JSON dump.
  `Enabled/Disabled` feels like a polished interface control.

| ❌ Avoid         | ✅ Recommended         |
| :--------------- | :--------------------- |
| `true` / `false` | `Enabled` / `Disabled` |
| `yes` / `no`     | `On` / `Off`           |
