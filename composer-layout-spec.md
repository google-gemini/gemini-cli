# Layout Refinement: Approval Mode & Composer Organization

## Goal

The primary objective is to streamline the main interaction area by moving the
Approval Mode status to the footer and reorganizing the remaining status
indicators within the Composer for a better information hierarchy.

## Phase 1: The Move (Approval Mode to Footer)

The `ApprovalModeIndicator` (manual, auto-accept, plan, YOLO) is removed
entirely from the Composer component and its "bleed-through" logic. It is
repositioned as the absolute first item (far left) in the application footer.

- **Header:** `mode (Shift+Tab)`
- **Data:** Streamlined labels (`manual`, `auto-accept`, `plan`, `YOLO`) using
  the existing semantic colors.
- **Default:** Visible by default for all users.

## Phase 2: The Swap (Composer Internal Layout)

Once the `ApprovalModeIndicator` is removed, the remaining transient and state
elements within the Composer are swapped across the horizontal divider.

### 1. The "Above Divider" Zone (Transient Environment)

This area is for transient notifications that contextualize the current
environment but are not the active process.

- **Toast Messages:** (e.g., "Press Ctrl+C again to exit")
- **Shell Mode Indicator**
- **Raw Markdown Indicator**
- **Shortcuts Hint:** Remains flush right.

### 2. The "Below Divider" Zone (Active Processing)

This area is reserved exclusively for what the application is _currently doing_.
It sits directly above the input prompt.

- **Loading Indicator:** (e.g., "Thinking...", "Executing Hooks")
- **Status Display:** (Context usage summary)

## Target Layout Mockup

```text
[ConfigInitDisplay]
[QueuedMessageDisplay]
[TodoTray]

[ToastDisplay | ShellModeIndicator]                    [ShortcutsHint]
----------------------------------------------------------------------
[LoadingIndicator (e.g., Thinking...)]
                                                       [StatusDisplay]

[InputPrompt]
```

## Key Principles

- **Clean Input:** The main input area should feel less crowded by offloading
  persistent status (Mode) to the footer.
- **Logical Flow:** Transient "Alerts" (Toasts) go above the line; active "Work"
  (Loading) goes below the line, closest to the prompt.
