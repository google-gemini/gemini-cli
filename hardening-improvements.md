# Hardening Improvements

This document tracks planned and in-progress improvements to the context
management and history hardening systems to ensure production-grade stability
and structural integrity.

## Planned Improvements

### 1. Transactional Tool Integrity

- **Status:** FINISHED for current PR.
- **Implemented:**
  - **Re-ordering:** Function responses in user turns are now sorted to strictly
    match the order of calls in the preceding model turn.
  - **Hoisting:** All `functionResponse` parts are moved to the beginning of
    their turn's `parts` array to satisfy strict schema validation requirements.
- **Note:** Mixed turns (responses + text) are preserved to support hinting and
  maintain role alternation without synthetic turns.

### 2. Robust Node Identification

- **SHA-256 Upgrade:** Switch from MD5 to SHA-256 for content-based hashing in
  `getStableId` to minimize collision risks in massive histories.

### 3. Memory Pressure Safety

- **Pressure Ceiling:** Implement a "Hard Break" policy that forces
  summarization of "pinned" nodes if they exceed a certain percentage (e.g.,
  80%) of the total context window.

### 4. Heuristic Calibration

- **Usage Metadata Feedback:** Use `usageMetadata` from actual Gemini API
  responses to dynamically adjust the `charsPerToken` ratio and improve local
  estimation accuracy.

### Orphaned Last Function Call

- **Status:** FIXED.
- **Root Cause:** `renderHistory` was called _before_ the current tool response
  was pushed to history in `processTurn`. This caused `hardenHistory` to see an
  orphaned tool call and inject a sentinel error response.
- **Fix:** Refactored `GeminiClient` to push the current request into history
  _before_ invoking context management. Updated `GeminiChat` and `Turn` to
  support a `skipHistoryPush` flag to prevent duplicate entries.
- **Verification:** Verified that structural integrity is maintained and no
  false-positive sentinels are injected in tool-heavy turn cycles.
