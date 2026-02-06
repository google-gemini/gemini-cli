# Voice Input Feature - PR Readiness Assessment

**Date:** February 6, 2026  
**Status:** ❌ **NOT READY FOR PRODUCTION**  
**Feature:** Native local-first voice input via Whisper  
**Original Commit:** 3d1d925fe

## Executive Summary

The voice input feature is **BLOCKED** and **NOT READY** for a pull request to
the official Google gemini-cli repository. While the feature is functionally
complete, there is a **critical performance bug** that causes severe React
render loops, making it unsuitable for production use.

## CRITICAL BLOCKING ISSUE

### Infinite Render Loop (SHOWSTOPPER)

**Status:** ❌ **BLOCKING - UNRESOLVED**

**Symptom:**

```
✖ 6-8 frames rendered while the app was idle in the past second.
  This likely indicates severe infinite loop React state management bugs.
```

**Impact:**

- Renders 1000+ frames after voice transcription completes
- Drains CPU and battery
- Violates React performance best practices
- Triggers DebugProfiler warnings
- Makes feature unsuitable for production

**Root Cause:** The voice context value changes when transcript state updates,
causing all components wrapped in `VoiceContext.Provider` (the entire `<App />`)
to re-render. Even though only `InputPrompt` consumes the context, React must
traverse the entire component tree to check for changes.

**Attempted Fixes (All Failed):**

1. ❌ Added `clearTranscript` to useEffect dependencies → Still loops
2. ❌ Used ref pattern to avoid clearTranscript in deps → Still loops
3. ❌ Async clear with `Promise.resolve().then()` → Still loops
4. ❌ Guard in clearTranscript to return same object if null → Intermittent
   failures
5. ❌ Auto-clear after 100ms timeout → Still loops
6. ❌ Don't clear transcript at all → Still loops
7. ❌ Clear on next recording start → Still loops
8. ❌ Memoization improvements in useVoiceInput → Still loops

**Debug Evidence:**

```
[7] transcript: "null" → "null"
[9] transcript: "null" → "null"
[11] transcript: "null" → "Hello, this is a test"
[12] transcript: "Hello, this is a test" → "null"
```

Only 4 state changes, but 6-8 frames rendered. The context propagation itself
causes the loop.

**Why Standard Solutions Don't Work:**

- Libraries like `react-speech-recognition` don't have this issue because they
  don't use Context for the entire app
- Our architecture wraps `<App />` in `VoiceContext.Provider`, causing tree-wide
  re-renders
- The memoization in `useVoiceInput` is correct, but Context propagation
  bypasses it

## Required Solution (Not Implemented)

**Option 1: Event-Based Architecture (Recommended)**

- Remove VoiceContext entirely
- Use event emitter for transcript delivery
- No context re-renders
- Estimated effort: 4-6 hours

**Option 2: Narrow Context Scope**

- Move `VoiceContext.Provider` to wrap only `InputPrompt`
- Requires refactoring AppContainer structure
- Estimated effort: 2-3 hours

**Option 3: Separate Transcript from State**

- Keep recording state in context
- Use callback/ref for transcript delivery
- Estimated effort: 3-4 hours

## Other Blocking Issues

### 1. Linting Errors (CRITICAL)

**Status:** ❌ BLOCKING

12 ESLint errors in `packages/core/src/code_assist/server.ts` (unrelated to
voice feature)

### 2. React Hook Dependency Warning

**Status:** ⚠️ WARNING

```
useVoiceInput.ts:185:6 - React Hook useCallback has a missing dependency: 'state.isRecording'
```

## Feature Quality Assessment

### ✅ Strengths

- Clean hook-based implementation
- Good error handling
- Comprehensive test coverage (5 passing tests)
- Proper documentation of keyboard shortcuts
- Fallback support (sox → arecord)

### ❌ Critical Weaknesses

- **Infinite render loop makes feature unusable in production**
- No end-to-end integration tests
- External dependencies (sox, whisper) not bundled
- Platform support unclear (Windows)

## PR Requirements Status

- [ ] **All checks pass** - BLOCKED by infinite render loop
- [ ] **Performance acceptable** - BLOCKED by 1000+ renders
- [ ] **Production ready** - BLOCKED by critical bug
- [x] **Functionally complete** - Feature works despite performance issue
- [ ] **Documentation complete** - Missing feature guide
- [ ] **Issue linked** - Not created yet

## Recommendations

### Immediate Actions Required

1. **DO NOT SUBMIT PR** until infinite render loop is fixed
2. **Implement Event-Based Architecture** (Option 1 above)
3. **Verify fix** with multiple test runs showing <5 renders
4. **Add integration test** that detects render loops

### After Fix

1. Fix linting errors in server.ts
2. Fix React hook dependency warning
3. Write comprehensive feature documentation
4. Create/link feature request issue
5. Run full preflight checks
6. Manual testing on clean systems

## Timeline Estimate

- **Fix infinite render loop:** 4-6 hours (event-based refactor)
- **Verify fix thoroughly:** 2-3 hours (multiple test scenarios)
- **Fix other blocking issues:** 1-2 hours
- **Write documentation:** 2-3 hours
- **PR review cycles:** 3-7 days

**Total:** 2-3 weeks minimum

## Conclusion

The voice input feature **CANNOT BE SHIPPED** in its current state due to a
critical performance bug that causes infinite render loops. The feature is
functionally complete and well-implemented, but the architectural approach of
using Context for the entire app creates unavoidable performance issues.

**Required Action:** Refactor to event-based architecture or narrow context
scope before this feature can be considered for production.

---

**Status:** ❌ BLOCKED - DO NOT SUBMIT PR  
**Next Step:** Implement event-based architecture to eliminate render loop  
**ETA:** 2-3 weeks after refactor begins
