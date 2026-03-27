# Layout Refinement: Unified Session State & Composer Organization

## Goal

The objective is to consolidate all persistent "Session Modes" into a single,
unified status area in the footer and reorganize the remaining transient
elements in the Composer for a cleaner information hierarchy.

## Phase 1: Unified Footer Modes

The footer's first column is expanded to be the **Unified Mode Indicator**. It
natively incorporates the three primary state toggles of the application.

- **Approval Mode:** (manual, auto-accept, plan, YOLO) - Always visible.
- **Shell Mode:** Visible only when active.
- **Raw Markdown Mode:** Visible only when active.

### Footer Layout

- **Header:** `mode (Shift+Tab)`
- **Data Row:** Multiple modes are displayed in their respective semantic
  colors, separated by a middle dot (`·`).
- **Example:** `plan · shell · raw`

## Phase 2: Composer Cleanup & Swap

With all modes moved to the footer, the Composer is simplified to handle only
transient notifications and active processing states. These two areas are
swapped across the horizontal divider.

### 1. The "Above Divider" Zone (Environment Alerts)

Reserved for transient notifications that alert the user to environment-level
changes.

- **Toast Messages:** (e.g., "Press Ctrl+C again to exit")
- **Shortcuts Hint:** (e.g., "? for shortcuts") - Remains flush right.

### 2. The "Below Divider" Zone (Active processing)

Reserved exclusively for the application's current activity. It sits directly
above the input prompt for maximum visibility during streaming.

- **Loading Indicator:** (e.g., "Thinking...", "Executing Hooks")
- **Status Display:** (Context usage summary)

## Target Layout Mockup

### Composer Area

```text
[ConfigInitDisplay]
[QueuedMessageDisplay]
[TodoTray]

[ToastDisplay]                                         [ShortcutsHint]
----------------------------------------------------------------------
[LoadingIndicator (e.g., Thinking...)]
                                                       [StatusDisplay]

[InputPrompt]
```

### Footer Area (Status Line)

```text
 mode (Shift+Tab)        workspace                /model
 manual · shell · raw    ~/src/gemini-cli         gemini-pro
```

## Key Principles

- **Single Source of Truth:** All "modes" now live in the footer. If a user
  wants to know what state the CLI is in, they only need to look at the far-left
  footer item.
- **Reduced Jitter:** Moving the Shell and Markdown indicators out of the
  Composer reduces vertical jumping in the main interaction area.
- **Immediate Feedback:** The Loading Indicator remains closest to the Input
  Prompt, providing the most direct feedback during generation.
