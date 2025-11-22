# Torres Build - Debug Log & Change History

## Version: 0.19.0-torres

---

## Problem Statement

The Gemini CLI was experiencing critical freezing/hanging issues when tool
output with collapsible content appeared. The application would become
completely unresponsive, blocking all user input.

---

## Root Causes Identified

### 1. **Stdin Conflicts Between Multiple Systems**

- `nonInteractiveCli.ts` was using `stdin.setRawMode(true)` for Ctrl+C detection
- `ToolResultDisplay.tsx` was using Ink's `useInput` hook for keyboard shortcuts
- **Both systems fighting for stdin control caused the freeze**

### 2. **Missing SIGINT Handler After Stdin Removal**

- OpenTelemetry SDK registers a SIGINT listener that prevents default Node.js
  exit
- But the SDK doesn't call `process.exit()`, leaving the process hanging on
  Ctrl+C
- Removing stdin cancellation also removed the Ctrl+C handler → critical
  regression

### 3. **Ink Components Blocking in Non-Interactive Mode**

- `useInput` hook was trying to read stdin even when `process.stdin.isTTY` was
  false
- Caused hangs in piped/non-TTY environments
- Even with `{ isActive: false }`, the hook was still initializing

### 4. **Global vs Local Build Confusion**

- User was running `/opt/homebrew/bin/gemini` (homebrew version)
- Local fixes in `/Users/jose/gemini-cli` weren't being used
- `npm run build` only builds packages/, not the bundle/ that global command
  uses

---

## Changes Made

### Phase 1: Remove Stdin Cancellation (Commits: 61821924a, 2dd3b7096)

**Files Changed:**

- `packages/cli/src/nonInteractiveCli.ts`
- `packages/cli/src/ui/components/messages/ToolResultDisplay.tsx`

**What:**

1. Removed `setupStdinCancellation()` and `cleanupStdinCancellation()` functions
2. Removed readline imports and stdin raw mode setup
3. Changed keyboard shortcut from Space to Cmd+B in ToolResultDisplay
4. Updated UI text from "(Space to expand)" to "(Cmd+B to expand)"
5. Deleted obsolete test file `nonInteractiveCli_stdin.test.ts`

**Why:**

- Space key was too easy to accidentally trigger
- Stdin raw mode conflicted with Ink's useInput hook
- Removing stdin cancellation eliminated the freeze

**Problem:**

- Created SIGINT handler regression (Ctrl+C would hang)

### Phase 2: Add SIGINT Handler (Commit: 2dd3b7096)

**Files Changed:**

- `packages/cli/src/nonInteractiveCli.ts` (lines 97-116)

**What:**

```typescript
// Handle Ctrl+C (SIGINT) explicitly because the Telemetry SDK's listener
// prevents the default Node.js exit behavior, but doesn't exit the process itself.
let isExiting = false;
process.on('SIGINT', async () => {
  if (isExiting) return;
  isExiting = true;

  // 1. Stop the generation loop
  abortController.abort();

  // 2. Ensure telemetry is flushed (idempotent, safe to call even if SDK listener also triggers)
  if (isTelemetrySdkInitialized()) {
    await shutdownTelemetry(config);
  }

  // 3. Force exit with standard Ctrl+C exit code
  process.exit(130);
});
```

**Why:**

- OpenTelemetry SDK blocks default Ctrl+C but doesn't exit
- Without this handler, pressing Ctrl+C leaves process running indefinitely
- `isExiting` flag prevents re-entry if Ctrl+C pressed multiple times

### Phase 3: Fix useInput Non-TTY Blocking (Commit: 447a973ed)

**Files Changed:**

- `packages/cli/src/ui/components/messages/ToolResultDisplay.tsx` (lines 51-58)

**What:**

```typescript
useInput(
  (input, key) => {
    if (key.meta && input === 'b') {
      setExpanded((prev) => !prev);
    }
  },
  { isActive: process.stdin.isTTY },
);
```

**Why:**

- `useInput` was trying to read stdin in non-TTY environments (piped output)
- Caused hangs when output was piped or redirected
- `isActive: process.stdin.isTTY` disables it in non-interactive contexts

**Problem:**

- Still caused blocking even with `isActive: false`

### Phase 4: Complete useInput Removal (Commit: 5997a9e62)

**Files Changed:**

- `packages/cli/src/ui/components/messages/ToolResultDisplay.tsx`

**What:**

1. Removed `useState` import and `expanded` state
2. Removed `useInput` import and hook entirely
3. Removed `useSettings` import and `truncateLines` config
4. Hardcoded `MAX_LINES = 20` constant
5. Removed all keyboard shortcut functionality
6. Changed text to just "... +N lines" (no expand instruction)

**Why:**

- Gemini agent analysis showed `useInput` blocks main thread even when inactive
- Ink's input handling is incompatible with non-interactive CLI architecture
- Simpler to just show truncated output without interactive expansion

**Trade-off:**

- Lost the ability to expand truncated output with keyboard
- But eliminated all stdin blocking issues

### Phase 5: Version Branding (Commits: 957d4eb79, 8f7883926)

**Files Changed:**

- All `package.json` files in root and packages/

**What:**

- Changed version from `0.19.0-nightly.20251122.42c2e1b21` to `0.19.0-torres`
- Updated `package-lock.json` via `npm install`

**Why:**

- Easy identification of custom fork build
- Differentiate from upstream Google releases
- Clear version string in logs/debugging

### Phase 6: Build System Fix

**What:**

1. `npm run build` - Builds packages/ (source code)
2. `npm run bundle` - Builds bundle/ (what global command uses)
3. `npm link` - Links local build to `/opt/homebrew/bin/gemini`

**Why:**

- User was running global homebrew version, not local fixes
- `bundle/` is the actual code that runs when you type `gemini`
- Symlink ensures global command uses local development build

---

## Current Architecture

### Non-Interactive Mode (`nonInteractiveCli.ts`)

- **Input:** Positional argument or piped stdin
- **Output:** Direct `process.stdout.write()` via `TextOutput`
- **No Ink rendering** - Pure text streaming
- **SIGINT:** Custom handler for clean shutdown

### Interactive Mode (implied)

- **Uses:** Full Ink TUI with React components
- **ToolResultDisplay:** Renders tool output with 20-line truncation
- **No keyboard shortcuts** - Just static truncation
- **Stdin:** Available for user input (no useInput interference)

---

## Remaining Issues

### 1. **No Expand Functionality**

**Problem:** User cannot expand truncated output beyond 20 lines **Options:**

1. **Add Ctrl+O handler at App level** (not in ToolResultDisplay)
2. **Use alternate rendering** for large outputs (plain text instead of Ink)
3. **Implement pagination** with static page breaks
4. **Write full output to temp file** and show path

**Best Option:** #1 - Global Ctrl+O handler that:

- Lives in the main app component, not ToolResultDisplay
- Sets a global flag to disable truncation
- Doesn't use `useInput` in individual components

### 2. **Gemini API Quota Errors**

- Zen MCP clink commands hit rate limits
- "You have exhausted your capacity on this model"
- Need to use different model or wait for quota reset

---

## Testing Done

- ✅ Build succeeds on main branch
- ✅ Version shows as `0.19.0-torres`
- ✅ SIGINT handler works (Ctrl+C exits cleanly)
- ✅ Truncation to 20 lines works
- ✅ No "Cmd+B to expand" message
- ⚠️ Manual testing needed for stdin blocking (user to verify)

---

## Key Learnings

1. **Ink + Stdin Raw Mode = Bad**
   - Don't mix Ink's input handling with stdin.setRawMode()
   - Pick one input system, not both

2. **useInput is Expensive**
   - Even inactive hooks can block the main thread
   - Better to handle keyboard at app level, not component level

3. **OpenTelemetry SDK Gotcha**
   - Registers SIGINT handler that prevents default exit
   - Must add explicit `process.exit(130)` in handler

4. **Build vs Bundle**
   - `npm run build` ≠ what global command runs
   - Must `npm run bundle` for global command changes
   - Must `npm link` to use local build globally

5. **Global Install Confusion**
   - Homebrew installs to `/opt/homebrew/lib/node_modules/`
   - `npm link` creates symlink to local development directory
   - Check `which gemini` and `readlink -f` to verify

---

## File Reference

### Modified Files

```
packages/cli/src/nonInteractiveCli.ts
packages/cli/src/ui/components/messages/ToolResultDisplay.tsx
package.json (all)
package-lock.json
```

### Deleted Files

```
packages/cli/src/nonInteractiveCli_stdin.test.ts
repro_keypress.js
```

### Critical Lines

```
nonInteractiveCli.ts:97-116    - SIGINT handler
ToolResultDisplay.tsx:21       - MAX_LINES constant
ToolResultDisplay.tsx:73-76    - Truncation logic
ToolResultDisplay.tsx:139      - Truncation message
```

---

## Next Steps (For Ctrl+O Expand Feature)

### Option A: Global Key Handler

```typescript
// In main App component
const [expandAll, setExpandAll] = useState(false);

useInput((input, key) => {
  if (key.ctrl && input === 'o') {
    setExpandAll(prev => !prev);
  }
});

// Pass expandAll down via context
<ToolResultDisplay expandAll={expandAll} ... />
```

### Option B: Alternate Buffer Mode

```typescript
// When output is large, switch to alternate terminal buffer
if (lines.length > MAX_LINES) {
  // Render in alternate buffer with full scrolling
  // User can scroll with terminal's native controls
}
```

### Option C: Write to Temp File

```typescript
if (lines.length > MAX_LINES) {
  const tempFile = `/tmp/gemini-output-${Date.now()}.txt`;
  fs.writeFileSync(tempFile, resultDisplay);
  return <Text>Output too large. Saved to: {tempFile}</Text>;
}
```

---

## Git History

```bash
5997a9e62 - fix: Remove useInput completely to prevent stdin blocking
8f7883926 - chore: Update package-lock.json to torres version
957d4eb79 - chore: Update version to 0.19.0-torres
447a973ed - fix: Disable useInput in non-TTY environments to prevent hangs
b998615a9 - fix: Add re-entry guard to SIGINT handler and update test mocks
4b467f981 - Merge pull request #4 (TTY EIO error handling)
2dd3b7096 - fix: Handle non-EIO errors in non-interactive stdin
e2e4f7b51 - fix: Resolve TTY read EIO errors in stdin handling
61821924a - fix: Remove stdin cancellation conflicting with Ink useInput
```

---

## GitHub PR Reference

**PR #4:** https://github.com/Grinsven/gemini-cli/pull/4

- Title: "fix: Resolve TTY read EIO errors in stdin handling"
- Status: Merged to main
- Gemini code review comments included SIGINT handler suggestion
