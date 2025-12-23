# Issue 6: Status Bar Integration

## Overview

Surface the presence of active skills in the CLI's status bar/summary area. This
provides a persistent but unobtrusive reminder to the user that specialized
skills are available for the current session.

## Key Components

### 1. Context Summary Update

- Modify `ContextSummaryDisplay.tsx` to accept a `skillCount` prop.
- Implement the logic to render the skill count alongside other context
  information (e.g., "2 open files | 1 context file | 2 skills").

### 2. Composer Integration

- Update `Composer.tsx` to retrieve the current skill count from the
  `SkillManager` and pass it to the `ContextSummaryDisplay`.

### 3. Visual Consistency

- Ensure the skill count text follows the existing status bar styling (secondary
  text color, pipe separators).

## Files Involved

- `packages/cli/src/ui/components/ContextSummaryDisplay.tsx`: Summary rendering
  logic.
- `packages/cli/src/ui/components/ContextSummaryDisplay.test.tsx`: Tests for the
  updated summary view.
- `packages/cli/src/ui/components/Composer.tsx`: Passing the skill count from
  the core to the UI.

## Verification

- Run the CLI with skills discovered.
- Verify that the status bar (above the input box) correctly displays the number
  of skills.
- Verify that if no skills are present, the "skills" segment is omitted
  entirely.
