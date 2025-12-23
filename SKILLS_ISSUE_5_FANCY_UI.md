# Issue 5: Specialized Tool Rendering (Fancy UI)

## Overview

Enhance the visual representation of skill activations in the chat. Instead of
using the default tool call styling, skill activations should use a refined,
blue-themed UI that feels integrated and "official."

## Key Components

### 1. Thematic Styling

- Adopt `theme.text.link` (blue) as the primary accent color for skill-related
  UI elements.
- This replaces any previous jarring colors (like purple) to better match the
  CLI's existing aesthetic.

### 2. Header Refinements

- Update `ToolShared.tsx` to remove the redundant "Skill Activated:" prefix.
- Implement a concise header format: `🌟 Activate Skill "name": description`.
- Ensure the icon and skill name use the new blue color.

### 3. Integrated Borders

- Update `ToolGroupMessage.tsx` to use the same blue theme for the left-hand
  border of skill activation tool calls.
- This provides a strong visual cue that a specialized "Skill" is being
  employed.

## Files Involved

- `packages/cli/src/ui/components/messages/ToolShared.tsx`: Header formatting
  and iconography.
- `packages/cli/src/ui/components/messages/ToolGroupMessage.tsx`: Container and
  border styling.

## Verification

- In a live session with a skill active, trigger a skill activation.
- Verify that the resulting tool call block has a blue border and a clean "🌟"
  icon header.
- Verify that the redundant "Skill Activated:" text is gone.
