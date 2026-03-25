# Prompt Stashing Feature Spec

## Overview

Prompt stashing allows a user to temporarily set aside the current contents of
the prompt input box, type and submit a different prompt, and then have the
stashed text automatically re-populated into the input box as soon as the new
prompt is submitted.

This is useful when a user is composing a long or complex prompt and needs to
quickly ask the model something else (e.g., a clarifying question, a quick
lookup) without losing their in-progress work.

## User Flow

1. User is typing a prompt in the input box (e.g., "Refactor the auth module to
   use...")
2. User presses **Alt+S** to stash the current input
3. The input box clears — ready for a new prompt
4. A **"Stashed"** indicator appears above the input (similar to the existing
   "Queued" display)
5. User types and submits a new prompt (e.g., "What auth patterns does this
   codebase use?")
6. **Immediately on submit**, the stashed text re-populates the input box
7. The "Stashed" indicator disappears
8. The model responds to the submitted prompt while the user can continue
   editing their original prompt

## Keybinding

| Action              | Shortcut  | Command ID    |
| ------------------- | --------- | ------------- |
| Stash current input | **Alt+S** | `input.stash` |

- `Alt+S` is currently unbound — no conflicts
- Added to the `Command` enum as `STASH_INPUT = 'input.stash'`
- Added to `defaultKeyBindingConfig` with `new KeyBinding('alt+s')`
- Added to the `'Text Input'` command category and `commandDescriptions`
- User-customizable via `keybindings.json` like all other shortcuts

## Behavior Rules

### Stashing

- **Alt+S with text in the input box**: Stashes the text. Input box clears.
  Stash indicator appears.
- **Alt+S with empty input box**: No-op (nothing to stash), even if a stash
  already exists.
- **Alt+S when a stash already exists and input has text**: Overwrites the
  existing stash with the current input text.

### Restoring

- **On prompt submit**: When the user submits a prompt and a stash exists, the
  stashed text is immediately restored into the input box via
  `buffer.setText()`. Cursor is placed at the end of the restored text. This
  happens as part of the submit flow, before the model begins responding. The
  stash is consumed (cleared) — it only restores once.

### Edge Cases

- **User quits/restarts while stash exists**: Stash is lost (in-memory only, not
  persisted).
- **Slash commands that open dialogs** (e.g. `/help`, `/settings`): The stash
  restores on any submit, including these. The stash is consumed even if the
  submission doesn't go to the model.
- **Shell mode**: Stashing works in shell mode too.
- **External editor (Ctrl+X)**: If the user opens the external editor while a
  stash exists, the editor shows only the current (non-stashed) input. The stash
  remains separately stored.
- **Ctrl+C to cancel a response**: The stash survives. Ctrl+C only cancels the
  running response — the stash persists and restores on the next submit.
- **Queued messages + stash**: These are independent systems. If a prompt is
  queued (submitted while model is responding), the stash still restores on that
  submit. The queued message and the stash restore happen independently.

## State Management

### New Hook: `usePromptStash`

Located at `packages/cli/src/ui/hooks/usePromptStash.ts`.

```typescript
interface UsePromptStashReturn {
  stashedPrompt: string | null;
  stashPrompt: (text: string) => void;
  popStashedPrompt: () => string | null; // returns & clears
  hasStash: boolean;
}
```

- Simple `useState`-based hook — no persistence, no core dependency
- Exposed through `UIStateContext` (`stashedPrompt`) and `UIActionsContext`
  (`stashPrompt`, `popStashedPrompt`)

### Integration Points

| File                                   | Change                                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Code**                               |                                                                                                                                                                                                                          |
| `keyBindings.ts`                       | Add `STASH_INPUT` command, binding, category entry, description                                                                                                                                                          |
| `usePromptStash.ts`                    | New hook (state management)                                                                                                                                                                                              |
| `StashedPromptDisplay.tsx`             | New component (UI display)                                                                                                                                                                                               |
| `InputPrompt.tsx`                      | Handle `Alt+S` keypress: call `stashPrompt(buffer.text)` then `buffer.setText('')`. On submit (in `handleSubmit`): if `hasStash`, call `popStashedPrompt()` and `buffer.setText(text)` after submission (cursor at end). |
| `Composer.tsx`                         | Render `StashedPromptDisplay` above `QueuedMessageDisplay`                                                                                                                                                               |
| `UIStateContext` / `UIActionsContext`  | Expose stash state and actions                                                                                                                                                                                           |
| **UX / Docs**                          |                                                                                                                                                                                                                          |
| `ShortcutsHelp.tsx`                    | Add `Alt+S — Stash prompt` to the `?` panel                                                                                                                                                                              |
| `Help.tsx`                             | Add `Alt+S — Stash current prompt` to `/help` keyboard shortcuts list                                                                                                                                                    |
| `docs/reference/keyboard-shortcuts.md` | Auto-regenerated via `npm run docs:keybindings`; also add manual entry in context-specific section                                                                                                                       |

## Documentation Updates

### Auto-Generated Keyboard Shortcuts Reference

**File:** `docs/reference/keyboard-shortcuts.md`

This file is auto-generated from `keyBindings.ts` via
`scripts/generate-keybindings-doc.ts`. After adding the new `STASH_INPUT`
command to `keyBindings.ts` (enum, config, category, description), run:

```
npm run docs:keybindings
```

This will regenerate the tables between `<!-- KEYBINDINGS-AUTOGEN:START -->` and
`<!-- KEYBINDINGS-AUTOGEN:END -->` markers, adding the new `Alt+S` shortcut
under the **Text Input** section automatically.

### Shortcuts Help Panel (`?` key)

**File:** `packages/cli/src/ui/components/ShortcutsHelp.tsx`

Add `Alt+S — Stash prompt` to the curated shortcut list in
`buildShortcutItems()`. This is the quick-reference panel users see when
pressing `?` — it shows only the most essential shortcuts, and stashing is a key
workflow shortcut worth surfacing here.

### /help Command Output

**File:** `packages/cli/src/ui/components/Help.tsx`

Add `Alt+S — Stash current prompt` to the keyboard shortcuts section (lines
~115-192). This component renders when users type `/help` and lists selected
important shortcuts. It also points users to the full reference at
`https://geminicli.com/docs/reference/keyboard-shortcuts/`.

### Context-Specific Shortcuts Section

**File:** `docs/reference/keyboard-shortcuts.md` (manual section, lines
~206-237)

Add a brief entry under the context-specific shortcuts section explaining the
stash workflow:

> **Alt+S** — Stash the current prompt to temporarily set it aside. The stashed
> prompt is restored to the input box when you submit your next prompt.

## UX: Stashed Prompt Display

A new `StashedPromptDisplay` component, rendered in `Composer.tsx` in the same
location as `QueuedMessageDisplay`, shown when a stash exists.

### Visual Design

```
  Stashed (restores after submit)
```

- Same dim styling as `QueuedMessageDisplay` (`<Text dimColor>`)
- No preview of the stashed text — just the indicator line
- Rendered **above** `QueuedMessageDisplay` when both exist
- Only shown when `showUiDetails` is true (matching queued display behavior)

### Layout in Composer.tsx

```
  [StashedPromptDisplay]    ← new, only if stash exists
  [QueuedMessageDisplay]    ← existing, only if queue non-empty
  [ShortcutsHelp]           ← existing, only if ? panel open
  [InputPrompt]             ← existing
```

## Testing

### Unit Tests (`usePromptStash.test.ts`)

- Stash stores text
- `popStashedPrompt` returns stashed text and clears state
- `hasStash` reflects current state accurately
- Stash with empty string is a no-op

### Integration Tests (`InputPrompt.test.tsx`)

- Alt+S with text clears input and stores stash
- Alt+S with empty input is a no-op
- Alt+S when stash already exists overwrites the stash
- Submitting a prompt while stash exists restores stashed text to input box
- Restored text has cursor at end

### E2E Considerations

- Stash → submit interrupting prompt → verify stashed text re-populates input
  immediately on submit
- Stash → submit while model responding (queued) → verify stash still restores
  on submit
