# Gemini CLI Footer UI & UX Research Report

This document provides a comprehensive, code-level analysis of the UI elements
located above the input field (the `Composer` component), focusing on state
transitions, conditional rendering logic, and the resulting user experience
issues.

## 1. Architectural Layout

The area directly above the input is divided into two structural rows managed
within `packages/cli/src/ui/components/Composer.tsx`:

### The Status Line (Top Row)

- **LoadingIndicator (Left):** Displays activity spinners, model thoughts, and
  loading phrases. Governed by the `showLoadingIndicator` boolean.
- **ShortcutsHint (Right):** Displays context-aware keyboard shortcuts.

### The Indicator Row (Bottom Row)

- **Mode & Notifications (Left):** Contains the `ApprovalModeIndicator` (YOLO,
  Plan, etc.), `ShellModeIndicator`, `RawMarkdownIndicator`, or the
  `ToastDisplay`.
- **Context Summary (Right):** Handled by `StatusDisplay`, showing file counts,
  active MCP servers, and hook statuses.

---

## 2. Core UX Issue: The "Fake Status" Effect

Users report that "the wit is annoying and appears real, and the status is
hidden." A deep dive into `LoadingIndicator.tsx` and `Composer.tsx` reveals
exactly why this happens:

### The Render Logic Flaw

In `LoadingIndicator.tsx`, the text displayed is determined by:

```typescript
const primaryText =
  currentLoadingPhrase === INTERACTIVE_SHELL_WAITING_PHRASE
    ? currentLoadingPhrase
    : thought?.subject
      ? (thoughtLabel ?? thought.subject)
      : currentLoadingPhrase;
```

In `Composer.tsx`, `thoughtLabel` is often hardcoded:

```tsx
thoughtLabel={inlineThinkingMode === 'full' ? 'Thinking ...' : undefined}
```

### The User Flow

1. **Initial Network Latency:** When the user submits a prompt, `thought` is
   initially `null`. The `LoadingIndicator` falls back to
   `currentLoadingPhrase`.
2. **The "Fake" Status:** The cycler (`usePhraseCycler.ts`) randomly selects a
   witty phrase like _"Resolving dependencies..."_ or _"Checking for syntax
   errors in the universe..."_. The user reads this and assumes it is a real
   technical operation.
3. **The Status Erasure:** A few seconds later, the Gemini model emits a real
   tool call or thought (e.g., _"Searching files for StatusDisplay"_). However,
   because `inlineThinkingMode` passes `thoughtLabel="Thinking ..."`, the UI
   replaces the witty phrase with the generic text _"Thinking ..."_.
4. **The Result:** The user sees: `[Resolving dependencies...]` ->
   `[Thinking ...]`. The actual status is completely buried. This creates the
   exact illusion users complain about: the jokes look like real operations, and
   the real operations are invisible.

---

## 3. Structural Conflicts & UI Instability

The conditional rendering in `Composer.tsx` creates several jarring layout
shifts and critical "blind spots":

### A. The Mode/Toast Blindness (Safety Risk)

The `ToastDisplay` and the mode indicators share the exact same flex slot and
are controlled by a mutually exclusive ternary:

```tsx
{hasToast ? (
  <ToastDisplay />
) : (
  <Box>
    {showApprovalIndicator && <ApprovalModeIndicator />}
    {uiState.shellModeActive && <ShellModeIndicator />}
...
```

**Impact:** If a user is in `YOLO` mode (a high-risk state where tools execute
without confirmation), any transient system toast (e.g., "Checkpoint saved")
will completely unmount the red YOLO warning. The user is blinded to their
operational mode during the notification.

### B. The Context Flicker

The right side of the bottom row (`StatusDisplay`) is conditionally wrapped:

```tsx
{
  !showLoadingIndicator && <StatusDisplay />;
}
```

**Impact:** Every time the model starts "thinking," the entire Context Summary
(file count, MCP status) vanishes. This causes a noticeable UI shift.

### C. The Status Vacuum (Tool Approval)

When the model pauses to ask the user to approve a tool call
(`hasPendingActionRequired` becomes true), `showLoadingIndicator` is forced to
`false`. **Impact:**

1. The Top Row (Status Line) instantly goes blank.
2. The Bottom Row right side (Context Summary) violently flickers back in.
3. The footer provides no indication that the system is waiting for the user
   (the approval UI happens up in the message history). The footer feels "dead."

### D. The Shell Mode Erasure

Secondary indicators are also bound to `!showLoadingIndicator`:

```tsx
{!showLoadingIndicator && (
  <>
    {uiState.shellModeActive && <ShellModeIndicator />}
```

**Impact:** If a user activates Shell Mode (`!`) and executes a command, the
Shell Mode indicator vanishes the moment execution begins, only to reappear when
it finishes.

---

## 4. State-by-State Usability Matrix

| State               | Status Line (Top Row)                     | Indicator Row (Bottom Row)           | Resulting UX Experience                                                                                                         |
| :------------------ | :---------------------------------------- | :----------------------------------- | :------------------------------------------------------------------------------------------------------------------------------ |
| **Idle**            | `[Shortcuts Hint]`                        | `[Mode Switcher \| Context Summary]` | Stable and informative.                                                                                                         |
| **Typing**          | `[Empty]`                                 | `[Mode Switcher \| Context Summary]` | Good focus. Shortcuts clear out to reduce noise.                                                                                |
| **Waiting for API** | `[Spinner + "Resolving dependencies..."]` | `[Mode Switcher \| Empty]`           | **Confusing.** User assumes the witty phrase is an actual system task. Context Summary flickers out. Shell indicator vanishes.  |
| **Model Thinking**  | `[Spinner + "Thinking..."]`               | `[Mode Switcher \| Empty]`           | **Opaque.** The real status (e.g., "Reading files") is overridden by the generic `thoughtLabel`.                                |
| **Tool Approval**   | `[Empty]`                                 | `[Mode Switcher \| Context Summary]` | **Vacuum.** Status line goes completely blank. Context Summary flickers back in. Appears as if processing stopped unexpectedly. |
| **Receiving Toast** | `[Spinner + State]`                       | `[Toast \| Context Summary]`         | **Dangerous.** The Mode Switcher (e.g., YOLO warning) is completely replaced by the toast message.                              |
| **Suggestions**     | `[Empty]`                                 | `[Mode Switcher \| Empty]`           | **Layout Shift.** Context Summary is hidden to make room for the pop-up menu.                                                   |

## 5. Summary of Necessary UX Improvements

1. **Decouple Tips/Wit from Status:** Witty phrases and tips should not share
   the exact same UI component and styling as real model thoughts.
2. **Prioritize Real Thoughts:** The `thoughtLabel="Thinking ..."` override
   needs to be reconsidered so users can actually see what tools the model is
   preparing to use.
3. **Persist Mode Indicators:** The `ApprovalModeIndicator` must remain visible
   at all times. Toasts should be rendered in a separate layout layer or
   alongside the mode, not replace it.
4. **Stabilize the Layout:** The `StatusDisplay` and secondary indicators should
   not unmount just because the model is processing. Fading them (opacity) or
   leaving them static would prevent the aggressive "flickering" effect.

---

## 6. Proposed Solutions

To address these core UX issues, here are three architectural options for
redesigning the footer (`Composer.tsx` and `LoadingIndicator.tsx`):

### Option 1: The Three-Row Architecture (Maximal Information)

This approach adds a dedicated row to completely segregate ambient information
from active system state.

- **Row 1 (New): The Ambient Line**
  - _Content:_ Tips, Witty Phrases, and `ShortcutsHint`.
  - _Behavior:_ Styled dimly (e.g., gray). Cycles independently. Distinct from
    any system action.
- **Row 2: The Action & Feedback Line**
  - _Content:_ `LoadingIndicator` (Left) and `ToastDisplay` (Right).
  - _Behavior:_ `LoadingIndicator` shows _only_ real `StreamingState` and
    specific `thought` subjects. The "Thinking..." override is removed so users
    see actual progress (e.g., "Searching files..."). Toasts appear here,
    ensuring they never overwrite mode indicators.
- **Row 3: The Persistent Foundation (Indicator Row)**
  - _Content:_ Mode indicators (`ApprovalModeIndicator`, `ShellModeIndicator`)
    on the Left; `StatusDisplay` (Context Summary) on the Right.
  - _Behavior:_ **Never unmounts.** This eliminates the "Context Flicker" and
    the "Mode Blindness" entirely.

- **Pros:** Complete separation of concerns. Eliminates all logical conflicts
  and "Fake Status" confusion.
- **Cons:** Consumes 3 lines of vertical terminal space permanently, which may
  feel cramped on smaller screens.

### Option 2: The Two-Row Stabilization (Strict Segregation)

This approach maintains the current vertical footprint but rigorously separates
persistent state from transient actions.

- **Row 1: The Dynamic Action Line**
  - _Left Side:_ `LoadingIndicator` showing **real status only** (no Wit/Tips
    injected into the loading stream). If waiting for tool approval, it
    explicitly states: `[Paused] Waiting for user approval...` to fix the
    "Status Vacuum".
  - _Right Side:_ `ToastDisplay`. By moving Toasts to the top row, they no
    longer conflict with the Mode Switcher.
- **Row 3 (Removed from active loop):** Tips and Wit are either removed from the
  active loading phase entirely (moved to the startup banner) or clearly
  prefixed (e.g., `💡 Tip: ...`) and only shown when completely idle.
- **Row 2: The Persistent Base**
  - _Left Side:_ Mode indicators (`ApprovalModeIndicator`, etc.). **Never
    unmounts.**
  - _Right Side:_ `StatusDisplay`. Instead of unmounting during loading (which
    causes flicker), it simply remains static or dims slightly.

- **Pros:** Fixes layout shifts and obscuration without taking more vertical
  space. Resolves the critical safety issue of Toasts hiding the YOLO warning.
- **Cons:** Requires finding a new home for Wit/Tips or heavily restricting when
  they can appear.

### Option 3: The "Smart Overlay" (Context-Aware Two-Row)

This approach tries to keep the UI minimal by using prefixes and intelligent
fallbacks rather than strict physical segregation.

- **Row 1: Status & Hints**
  - _Logic:_
    1. If `thought` exists, show real thought (e.g.,
       `[Spinner] Reading system files`).
    2. If waiting for approval, show `[!] Awaiting your approval`.
    3. If merely waiting for network, show a Tip, but explicitly prefixed:
       `[Spinner] 💡 Tip: Use Ctrl+L to clear`. (This breaks the "Fake Status"
       illusion).
- **Row 2: Indicators & Context**
  - _Logic:_ Render `[ApprovalMode] [Toast]` side-by-side if horizontal space
    allows, rather than a mutually exclusive ternary toggle. Keep
    `StatusDisplay` visible at all times to prevent the "Context Flicker."

- **Pros:** Minimal vertical footprint. Prefixing solves the Wit confusion
  without removing the feature.
- **Cons:** If horizontal space is tight (narrow terminals), side-by-side Mode
  and Toasts will still collide, requiring complex truncation logic.

---

## 7. Refined Recommendation: The 3-Row Architecture (Claude-Style)

Based on recent user feedback, the following truths must guide the final design:

1.  **Users _want_ Tips/Wit during loading:** They provide entertainment/value
    while waiting, but they _must_ be visually decoupled from real system
    status.
2.  **Toasts must be obvious and left-aligned:** Placing them "adjacent" to
    other items in a busy row makes them too easy to miss.
3.  **No Icons:** The UX team prefers a clean, professional, text-based
    aesthetic.

To satisfy all constraints without introducing logical conflicts, the UI **must
expand to a dedicated 3-Row architecture.** Attempting to compress Toasts,
Modes, Real Status, and Tips into 2 rows inevitably leads to "blind spots"
(e.g., Toasts hiding YOLO mode) or "fake status" confusion.

### The New Architecture

**Row 1 (Top): The Ambient/Entertainment Line**

- **Purpose:** Exclusively for Tips and Witty phrases during the loading state.
- **Behavior:** Only visible when `StreamingState !== Idle`. Cycles every 15s.
- **Styling:** Dimmed (e.g., gray) and explicitly prefixed with text (e.g.,
  `Tip: ...` or `Joke: ...` if needed, though being on a separate, dimmed line
  may be enough visual distinction).
- **UX Win:** By moving this to its own row, it never mimics or overwrites real
  system progress.

**Row 2 (Middle): The Action & Notification Line**

- **Purpose:** The primary focal point for _what is happening right now_.
- **Content:**
  - _Default:_ `LoadingIndicator` showing **real status only** (e.g.,
    `[Spinner] Searching files...`).
  - _When Paused:_ `Paused: Awaiting user approval...`
  - _When Toast Active:_ `ToastDisplay` (e.g., `Checkpoint saved`).
- **Conflict Resolution:** Can Toasts and Status share the exact same spot? Yes,
  with careful prioritization. A Toast is an immediate, transient notification
  of a completed action or error. If a Toast triggers while the system is
  "Thinking," the Toast should temporarily overlay the Status for a few seconds.
  The user needs to see the Toast immediately; the "Thinking" state is ongoing
  and will resume visibility once the Toast fades. Because the Mode Indicator is
  now safely on Row 3, hiding the Status temporarily is not a safety risk.

**Row 3 (Bottom): The Persistent Foundation**

- **Purpose:** The bedrock state of the CLI. This row **never unmounts**.
- **Content (Left):** `ApprovalModeIndicator` (YOLO, Plan, Auto-Edit),
  `ShellModeIndicator`. Always visible, ensuring the user always knows their
  safety level.
- **Content (Right):** `StatusDisplay` (Context Summary, File Count).
- **UX Win:** Eliminates the "Context Flicker" and the dangerous "Mode
  Blindness" caused by Toasts.

### Why this is the best path forward:

This layout mirrors successful terminal UI patterns (like Claude's CLI) where
transient "thoughts/tips" sit slightly above the hard, factual status of the
engine. While it permanently consumes one extra line of vertical space during
execution, it completely resolves the "fake status" illusion, keeps safety
indicators visible 100% of the time, and ensures notifications (Toasts) appear
exactly where the user is already looking (left-aligned, immediately above the
input).

---

## 8. UX Testing Simulation: Visual State Flow

This section tests the proposed 3-Row architecture against the current 2-Row
architecture through a simulated user session. The visual mockups are
constrained to 100 characters wide to demonstrate layout handling.

### State 1: Idle (Ready for Input)

_User Need: System readiness and helpful shortcuts._

**Current UI (2 Rows):**

```text
----------------------------------------------------------------------------------------------------
                                                             Close dialogs and suggestions with Esc…
● YOLO                                                                          125 files | 3 skills
----------------------------------------------------------------------------------------------------
```

**Proposed UI (2 Rows when Idle):**

```text
----------------------------------------------------------------------------------------------------
                                                             Close dialogs and suggestions with Esc…
● YOLO                                                                          125 files | 3 skills
----------------------------------------------------------------------------------------------------
```

_UX Analysis:_ In the idle state, the proposed UI dynamically collapses to 2
rows to preserve vertical space. The shortcuts hint occupies the ambient layer.
Both designs function well here.

### State 2: Typing

_User Need: Focus on input; reduction of visual noise._

**Current UI (2 Rows):**

```text
----------------------------------------------------------------------------------------------------

● YOLO                                                                          125 files | 3 skills
----------------------------------------------------------------------------------------------------
```

**Proposed UI (1 Row when Typing):**

```text
----------------------------------------------------------------------------------------------------
● YOLO                                                                          125 files | 3 skills
----------------------------------------------------------------------------------------------------
```

_UX Analysis:_ The current UI leaves an empty, dead row above the indicators.
The proposed UI cleanly collapses the ambient layer, leaving only the persistent
base row for maximum focus.

### State 3: Thinking (Initial / Network Latency)

_User Need: Confirmation that the system is working._

**Current UI (2 Rows):**

```text
----------------------------------------------------------------------------------------------------
⠏ Resolving dependencies...                                                          (esc to cancel)

----------------------------------------------------------------------------------------------------
```

**Proposed UI (3 Rows):**

```text
----------------------------------------------------------------------------------------------------
Tip: You can use Ctrl+L to clear the screen at any time...
⠏ Thinking...                                                                        (esc to cancel)
● YOLO                                                                          125 files | 3 skills
----------------------------------------------------------------------------------------------------
```

_UX Analysis:_

- **Current Bug:** The Context Summary violently unmounts (Flicker). The witty
  phrase "Resolving dependencies" appears as a real task (Fake Status Effect).
- **Proposed Fix:** The ambient tip cycles on the top row, clearly prefixed. The
  status row shows generic "Thinking". The base row stays firmly anchored.

### State 4: Thinking (Active Tool Execution)

_User Need: Understanding exactly what the model is doing right now._

**Current UI (2 Rows):**

```text
----------------------------------------------------------------------------------------------------
⠏ Thinking ...                                                                       (esc to cancel)

----------------------------------------------------------------------------------------------------
```

**Proposed UI (3 Rows):**

```text
----------------------------------------------------------------------------------------------------
Joke: Assembling the interwebs...
⠏ Searching files...                                                                 (esc to cancel)
● YOLO                                                                          125 files | 3 skills
----------------------------------------------------------------------------------------------------
```

_UX Analysis:_

- **Current Bug:** The generic `thoughtLabel="Thinking ..."` obscures the actual
  work the model is doing.
- **Proposed Fix:** The real status ("Searching files") is surfaced on the
  action line. The ambient layer provides entertainment without confusing the
  user about system progress.

### State 5: Tool Approval Required

_User Need: To know why the application paused and what action is required._

**Current UI (2 Rows):**

```text
----------------------------------------------------------------------------------------------------

● Plan                                                                          125 files | 3 skills
----------------------------------------------------------------------------------------------------
```

**Proposed UI (2 Rows):**

```text
----------------------------------------------------------------------------------------------------
[!] Paused: Awaiting user approval...
● Plan                                                                          125 files | 3 skills
----------------------------------------------------------------------------------------------------
```

_UX Analysis:_

- **Current Bug:** The "Thinking" status line vanishes entirely (Status Vacuum).
  The Context summary flickers back in. The footer feels disconnected from the
  required approval happening above.
- **Proposed Fix:** The ambient layer hides to remove noise. The status line
  explicitly explains the system is blocked, anchoring the user's context.

### State 6: Receiving a Toast (While Thinking)

_User Need: See the notification without losing safety context._

**Current UI (2 Rows):**

```text
----------------------------------------------------------------------------------------------------
⠏ Thinking ...                                                                       (esc to cancel)
! Interactive shell awaiting input... press tab to focus shell
----------------------------------------------------------------------------------------------------
```

**Proposed UI (3 Rows):**

```text
----------------------------------------------------------------------------------------------------
Tip: Press F12 to open the developer tools...
! Interactive shell awaiting input... press tab to focus shell                       (esc to cancel)
● YOLO                                                                          125 files | 3 skills
----------------------------------------------------------------------------------------------------
```

_UX Analysis:_

- **CRITICAL Current Bug:** The Toast completely overwrites the Mode Switcher
  (`YOLO`). The user is temporarily blinded to their safety state while trying
  to read a long instruction about shell focus.
- **Proposed Fix:** The Toast temporarily overrides the Middle Status Line (as
  it is the highest priority immediate information). The `YOLO` safety indicator
  on the bottom row remains visible 100% of the time. The `(esc to cancel)`
  instruction is preserved on the right side of the active notification.

### State 7: Suggestions Active (e.g., typing @file)

_User Need: Select a file without the UI jumping or obscuring the input._

**Current UI (2 Rows):**

```text
----------------------------------------------------------------------------------------------------

● YOLO
----------------------------------------------------------------------------------------------------
```

**Proposed UI (1 Row):**

```text
----------------------------------------------------------------------------------------------------
● YOLO                                                                          125 files | 3 skills
----------------------------------------------------------------------------------------------------
```

_UX Analysis:_

- **Current Bug:** The Context Summary is hidden to make room for the pop-up
  menu rendering "above" the input, causing a horizontal layout shift.
- **Proposed Fix:** Since the Base Row never unmounts, the suggestion menu
  simply renders _above_ the Base Row, pushing the chat history up slightly, but
  leaving the footer rock solid.

---

## 9. Layout Explorations: Ambient Placement & Toast Handling

Based on feedback, we evaluated three structural options for positioning the
"Ambient" content (Tips/Wit) relative to the primary Status, with a specific
focus on how each layout handles long, critical Toasts (e.g.,
`! Interactive shell awaiting input...`).

**Feedback Addressed:** The `(esc to cancel)` instruction has been moved
immediately adjacent to the active Status/Toast. When it was previously pushed
to the far right, it was too hidden from the user's primary focal point.

Here is an analysis of how each layout option handles both standard execution
and the arrival of a critical Toast.

### Option A: Ambient Above Status (The Baseline Proposal)

This mirrors Claude's CLI layout, placing the entertainment/tips above the hard
factual status.

**Standard Execution:**

```text
----------------------------------------------------------------------------------------------------
Tip: You can use Ctrl+L to clear the screen at any time...
⠏ Searching files... (esc to cancel)
● YOLO                                                                          125 files | 3 skills
----------------------------------------------------------------------------------------------------
```

**When a Toast Arrives:** (Toast temporarily overlays the Status Line)

```text
----------------------------------------------------------------------------------------------------
Tip: You can use Ctrl+L to clear the screen at any time...
! Interactive shell awaiting input... press tab to focus shell (esc to cancel)
● YOLO                                                                          125 files | 3 skills
----------------------------------------------------------------------------------------------------
```

**Analysis:**

- **Pros:** Follows a logical hierarchy. The user's eye naturally goes to the
  line directly above the persistent base. When the Toast arrives, it perfectly
  replaces the "Searching files" status right where the user is looking. The
  YOLO mode is fully protected.
- **Cons:** Consumes 3 vertical lines permanently during execution.

### Option B: Ambient Below Status

This flips the top two rows, placing the primary action at the very top of the
block.

**Standard Execution:**

```text
----------------------------------------------------------------------------------------------------
⠏ Searching files... (esc to cancel)
Tip: You can use Ctrl+L to clear the screen at any time...
● YOLO                                                                          125 files | 3 skills
----------------------------------------------------------------------------------------------------
```

**When a Toast Arrives:**

```text
----------------------------------------------------------------------------------------------------
! Interactive shell awaiting input... press tab to focus shell (esc to cancel)
Tip: You can use Ctrl+L to clear the screen at any time...
● YOLO                                                                          125 files | 3 skills
----------------------------------------------------------------------------------------------------
```

**Analysis:**

- **Pros:** Puts the most critical active information at the highest point of
  the footer block.
- **Cons:** "Sandwiches" the ambient text between the active notification and
  the persistent base. When a Toast arrives, it feels disconnected from the
  input prompt because the Tip is sitting between them, acting as visual noise
  exactly when the user needs to act (e.g., pressing tab).

### Option C: Ambient Inline (Far Right)

This collapses the layout back into 2 rows by pushing the Ambient text to the
far right of the Status row. This is made possible by moving `(esc to cancel)`
to the left.

**Standard Execution:**

```text
----------------------------------------------------------------------------------------------------
⠏ Searching files... (esc to cancel)                      Tip: You can use Ctrl+L to clear the scre…
● YOLO                                                                          125 files | 3 skills
----------------------------------------------------------------------------------------------------
```

**When a Toast Arrives:**

```text
----------------------------------------------------------------------------------------------------
! Interactive shell awaiting input... press tab to focus shell (esc to ca… Tip: You can use Ctrl+L…
● YOLO                                                                          125 files | 3 skills
----------------------------------------------------------------------------------------------------
```

**Analysis:**

- **Pros:** Highly space-efficient. It keeps the total footprint to exactly 2
  rows during execution.
- **Cons:** **Extreme Collision Risk.** The "Interactive shell" toast is very
  long. When placed inline with the Ambient tip, they aggressively collide. As
  shown above, either the `(esc to cancel)` instruction gets truncated, or the
  Tip gets truncated into uselessness. To make Option C work, we would need a
  hard rule that **kills the Ambient text entirely whenever a Toast is active**,
  resulting in layout shifts.

### Recommendation on Placement

**Option A** remains the most balanced from a purely typographic, focus, and
notification-handling perspective. It handles long Toasts gracefully without
truncating critical instructions like `(esc to cancel)`.

If vertical space conservation is the absolute highest priority, **Option C** is
a viable compromise, but it **requires strict truncation logic**: the Ambient
text (Tips/Wit) must be forcibly hidden if a Toast is active or if the terminal
width falls below ~100 columns to prevent critical notification collisions.

---

## 10. Responsive Collision Logic

To make the inline 2-row layout robust across different terminal sizes, strict
mathematical collision detection was implemented.

### The Rules of Precedence

1.  **Toasts > All:** If a Toast is active, it claims `100%` of the row width.
    The Ambient layer (Tips/Wit) and Shortcuts are completely unmounted.
2.  **Status > Ambient:** If the active Status (e.g., `Searching files...`) is
    long, it takes priority over the ambient tip.
3.  **Narrow Windows:** If the terminal is "narrow" (usually < 80 columns), the
    ambient layer is forcibly hidden, and the `LoadingIndicator` text is allowed
    to `wrap` onto a second line instead of truncating.

### Collision Detection Implementation

Because Ink uses Flexbox, elements will naturally try to squash each other
(`flexShrink`) before truncating. To prevent this "fidgety" squeezing, the UI
dynamically calculates the string lengths:

```typescript
// 1. Estimate Status Length
let estimatedStatusLength = 0;
if (isExperimentalLayout && uiState.activeHooks.length > 0) {
  estimatedStatusLength = 30; // Rough estimate for hooks + spinner
} else if (showLoadingIndicator) {
  const thoughtText = uiState.thought?.subject || 'Waiting for model...';
  estimatedStatusLength = thoughtText.length + 25; // Spinner(3) + timer(15) + padding
} else if (hasPendingActionRequired) {
  estimatedStatusLength = 35; // "[Paused] Awaiting user approval..."
}

// 2. Estimate Ambient Length
const estimatedAmbientLength =
  ambientPrefix.length + (ambientText?.length || 0);

// 3. Detect Collision
const willCollide =
  estimatedStatusLength + estimatedAmbientLength + 5 > terminalWidth;
```

If `willCollide` or `isNarrow` is true, the ambient Tip text is completely
hidden, and the UI elegantly degrades back to the default `? shortcuts` hint (or
nothing, if space is critically tight).

---

## 11. Styling and Default Configuration Updates

Recent refinements have been made to ensure a professional CLI aesthetic and
better discoverability of features:

### 1. Visual Consistency

- **Focus Hint Color:** The focus/unfocus hints (e.g., `(Shift+Tab to unfocus)`)
  have been changed from accent purple to **warning yellow**. This ensures they
  match the styling of other actionable system statuses in the footer, creating
  a more unified look.
- **Emoji-Free Status:** All emojis (e.g., 💬, ⏸️) have been removed from the
  Status Line in favor of clean, professional text and the standard terminal
  spinner.

### 3. Concise System Copy

- **Pause State:** Now displays as `↑ Awaiting approval` (using the up arrow
  unicode symbol) rather than `[Paused]`.
- **Shell Focus Hint:** The long interactive shell toast has been shortened to
  `! Shell awaiting input (Tab to focus)` for better readability and less row
  collision.
- **Ambient Layer:** The "Tip:" prefix has been removed from ambient tips and
  wit to create a cleaner, more integrated look.
- **Width-Aware Selection:** The phrase cycler now dynamically filters tips and
  wit based on the available terminal width, ensuring that only phrases that fit
  without colliding with the system status are selected.

### 4. Loading Phrase Layout

A single setting `ui.loadingPhraseLayout` now controls both the content and the
position of loading phrases:

- **`none`**: Pure status only (no tips or witty phrases).
- **`tips`**: Informative tips only (displayed on the far right).
- **`wit_status`**: Witty phrases only, replacing the status text (Legacy
  behavior).
- **`wit_inline`**: Witty phrases only, following the status in gray.
- **`wit_ambient`**: Witty phrases only, displayed on the far right.
- **`all_inline` (Default)**: Informative tips on the right, witty phrases
  inline (after status).
- **`all_ambient`**: Both tips and witty phrases cycle on the far right.

---

## 12. Testing Summary & Final Feedback

The implementation has been verified through targeted unit tests and manual code
review against the updated specification.

### Final Layout Behavior

- **Setting:** Toggle via `/settings` -> `UI` -> `New Footer Layout`.
- **Divider Options:**
  - `New Layout`: Divider above everything.
  - `New Layout (Divider Down)`: Divider between status and indicators.
- **Loading Phrases:** Unified via `ui.loadingPhraseLayout` (Defaults to
  `all_inline`).
- **Input State:** Drafted text remains visible during tool approval; the input
  box is greyed out and focus is removed.
- **Toasts:** Claims 100% width, left-aligned, prominent warning color.
  Overrides ambient tips.
- **Hooks:** Uses `↪` (Before) / `↩` (After) icons. Text is white and italic.
- **Responsive:**
  - Tips/Wit disappear on narrow windows or if they collide with long statuses.
  - Status text wraps onto multiple lines only when the window is narrow.
  - **Width-Aware:** Only tips that fit the remaining width are selected.
- **Cleaning:** No more `💬`, `⏸️`, `Tip:` emojis/labels, or hardcoded trailing
  ellipses (`…`). No more empty line at the bottom of the footer.

### Identified Gaps / Future Triage

- [ ] **Shortcut Hint Discoverability:** On very narrow windows, the
      `? for shortcuts` hint is completely hidden. Users might forget the hotkey
      if they rely on the visual hint.
- [ ] **Ambient Truncation:** Ambient tips are currently all-or-nothing (either
      shown or hidden). Partial truncation might allow them to persist longer on
      medium-width windows.
- [x] **Empty Footer Line:** Verified removed via `paddingBottom={0}` in both
      `Footer.tsx` and `DefaultAppLayout.tsx`.
