# Native Text Selection in Alternate Buffer Mode

## Overview

This feature enables native text selection and copying in alternate buffer mode without requiring users to press `Ctrl+S` to enter a special "copy mode". Users can now select text with their mouse (or keyboard) and press `Ctrl+C` (or `Cmd+C` on macOS) to copy, just like in any normal terminal application.

## Problem Statement

Previously, when Gemini CLI operated in alternate buffer mode (full-screen UI) with mouse events enabled for scroll wheel support, users could not perform native text selection because the terminal would send mouse events to the application instead of handling selection internally.

The workaround was to press `Ctrl+S` to enter "copy mode", which would disable mouse events, allow selection, and display a warning message. This was confusing and cumbersome for users (see issue #13031).

## Solution

The new implementation detects when `Ctrl+C` is pressed and:

1. **First press**: Temporarily disables mouse events for 200ms, allowing the terminal to handle text selection and the copy operation natively
2. **Subsequent presses** (within the Ctrl+C press counter window): Acts as the normal cancel/interrupt behavior

This provides a seamless experience where:
- Users can select text normally with their mouse/keyboard
- `Ctrl+C` / `Cmd+C` works as expected for copying
- The old `Ctrl+S` copy mode is still available as a fallback but is no longer necessary

## Implementation Details

### Core Components

1. **`nativeSelection.ts`**: Core module handling mouse event toggling
   - `temporarilyDisableMouseForCopy()`: Disables mouse tracking
   - `reEnableMouseAfterCopy()`: Re-enables mouse tracking
   - `handleCopyKeyPress()`: Orchestrates the temporary disable/enable cycle
   - `cancelCopyHandler()`: Cleanup function for pending timeouts
   - `isCopyInProgress()`: Status checker

2. **`AppContainer.tsx`**: Integration with keyboard handling
   - Modified `handleGlobalKeypress` to intercept first `Ctrl+C` in alternate buffer mode
   - Added cleanup in `registerCleanup` to cancel pending handlers on exit

### Technical Approach

When `Ctrl+C` is detected in alternate buffer mode:

```typescript
if (isAlternateBuffer && !copyModeEnabled && ctrlCPressCount === 0) {
  const copyHandled = handleCopyKeyPress();
  if (copyHandled) {
    setCtrlCPressCount(1);
    return; // Prevent cancellation on first press
  }
}
```

The `handleCopyKeyPress()` function:
1. Writes escape sequences to disable SGR mouse tracking: `\u001b[?1002l\u001b[?1006l`
2. Sets a 200ms timeout
3. After timeout, writes sequences to re-enable tracking: `\u001b[?1002h\u001b[?1006h`

### Mouse Event Escape Sequences

- **Enable mouse tracking**: `ESC[?1002h ESC[?1006h`
  - `?1002h`: Button event tracking (clicks + drags + scroll wheel)
  - `?1006h`: SGR extended mouse mode (better coordinate handling)

- **Disable mouse tracking**: `ESC[?1002l ESC[?1006l`
  - Same codes with `l` (lowercase L) suffix to disable

## User Experience

### Before
1. User sees text they want to copy
2. User presses `Ctrl+S` to enter copy mode
3. UI displays "In Copy Mode. Press any key to exit."
4. User selects text with mouse
5. User presses `Ctrl+C` to copy
6. User presses any key to exit copy mode
7. Mouse scrolling works again

### After
1. User sees text they want to copy
2. User selects text with mouse
3. User presses `Ctrl+C` to copy
4. Copy completes seamlessly
5. Mouse scrolling continues to work

## Testing

Comprehensive test coverage in `nativeSelection.test.ts`:
- ✅ Disabling mouse events
- ✅ Re-enabling mouse events  
- ✅ Full copy key press cycle with timeout
- ✅ Preventing duplicate handlers
- ✅ Cancellation and cleanup
- ✅ Status checking

## Backward Compatibility

- The old `Ctrl+S` copy mode is still available and works as before
- No breaking changes to existing functionality
- Users can continue using `Ctrl+S` if they prefer the explicit copy mode

## Future Enhancements

Potential improvements for future iterations:

1. **Selection Detection**: Query terminals that support OSC 52 to detect if text is actually selected before disabling mouse events
2. **Configurable Timeout**: Allow users to configure the 200ms delay via settings
3. **Terminal Capability Detection**: Automatically adjust behavior based on terminal emulator capabilities
4. **Visual Feedback**: Subtle UI indicator when copy mode is temporarily active

## Documentation Updates

- Updated `keyboard-shortcuts.md` with new section explaining native selection
- Removed emphasis on `Ctrl+S` as the primary copy mechanism
- Added clear explanation of first `Ctrl+C` behavior in alternate buffer mode

## Related Issues

- Fixes #13031: Users confused about text selection in alternate buffer mode
- Improves UX for copy/paste operations
- Reduces friction in the UI workflow
