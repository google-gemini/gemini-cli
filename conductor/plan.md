# Implementation Plan: Hide Context & Compression UI Redesign

## Background & Motivation

The current UI for context window management (warnings and compression messages)
is too prominent. The context overflow warning is a yellow block of text, the
auto-compression message is yellow, and the manual compression message is green
with an icon. Context usage percentage also conditionally "bleeds through" in
the minimal UI when usage is high.

The goal is to make context management more seamless: hide the context overflow
warning by default in favor of forced auto-compression, make compression
messages visually subtle, prevent context percentage from appearing
dynamically/automatically (e.g., in the minimal UI), while retaining the ability
for users to explicitly enable the context percentage display in their footer if
they choose.

## Scope & Impact

- Add a new setting `ui.showContextWindowWarning` (default `false`).
- Modify `core/client.ts` to force compression on overflow if the warning is
  disabled. **(Risk: Behavioral change for users who rely on the manual overflow
  blocker).**
- Redesign `CompressionMessage.tsx` to be subtle (gray, no icon, left border).
- Update `useGeminiStream.ts` to use the new `CompressionMessage` for
  auto-compression, and update the overflow warning text to be shorter and
  percentage-based.
- Remove dynamic/automatic context percentage appearances (specifically the
  bleed-through in `Composer.tsx`), but preserve `ContextUsageDisplay.tsx` for
  opt-in use in the footer.

## Proposed Solution

### 1. Remove Dynamic Context Percentage Displays

- **Update `Composer.tsx`**: Remove `showMinimalContextBleedThrough` logic and
  the `<ContextUsageDisplay />` component from the minimal bleed-through row.
  The context percentage should never appear automatically based on high usage.
- **Retain Footer Option**: Keep `ContextUsageDisplay.tsx`,
  `hideContextPercentage` in `settingsSchema.ts`, and the `context-used` footer
  item in `footerItems.ts`. It remains off by default but available for users
  who explicitly want it in their footer.

### 2. Configuration Updates

- **Update `settingsSchema.ts`**: Add
  `showContextWindowWarning: { type: 'boolean', default: false, ... }` under the
  `ui` category.
- **Update `Config` Interface**: Add `getShowContextWindowWarning(): boolean` to
  `packages/core/src/config/config.ts` and its implementations.

### 3. Core Client Update (Auto-Compress on Overflow)

- **Update `packages/core/src/core/client.ts`**: Locate the token limit check
  `if (estimatedRequestTokenCount > remainingTokenCount)`. Before yielding the
  `ContextWindowWillOverflow` event, check
  `this.config.getShowContextWindowWarning()`. If `false`:
  1. Call `await this.tryCompressChat(prompt_id, true)` to force a compression
     attempt.
  2. If compression succeeds (`CompressionStatus.COMPRESSED`), yield the
     `ChatCompressed` event and recalculate `remainingTokenCount`.
  3. If `estimatedRequestTokenCount` now fits within the new
     `remainingTokenCount`, bypass the overflow yield and continue processing
     the request.
  4. If it still overflows after forced compression, yield the
     `ContextWindowWillOverflow` event so the user is informed that the limit is
     absolutely reached.

### 4. Update Overflow Warning Text

- **Update `useGeminiStream.ts`**: Modify `handleContextWindowWillOverflowEvent`
  to use a shorter, percentage-based text. _Example:_ "Context window is 100%
  full. Message size might exceed the limit."

### 5. Redesign Compression Message

- **Update `CompressionMessage.tsx`**:
  - Change colors from `theme.status.success` and `theme.text.accent` to
    `theme.text.secondary` (subtle gray).
  - Remove the `✦` icon.
  - Wrap the text in a `<Box>` with a left border to match
    `ThinkingMessage.tsx`:
    `borderStyle="single" borderLeft={true} borderRight={false} borderTop={false} borderBottom={false} borderColor={theme.text.secondary}`

### 6. Unify Auto-Compression Message

- **Update `useGeminiStream.ts`**: Modify `handleChatCompressionEvent` so that
  instead of constructing a yellow `MessageType.INFO` string, it dispatches an
  item of `type: MessageType.COMPRESSION` (passing the `eventValue` as
  `compression` props). This ensures automatic compression is rendered by our
  newly subtle `CompressionMessage.tsx`.

## PR Notes

We will explicitly document the behavioral change in the PR description: By
default, the CLI will now forcefully attempt to summarize chat history when it
overflows, rather than immediately blocking the user with a warning.
Additionally, context percentage no longer automatically appears when usage is
high; it is strictly an opt-in footer setting.
