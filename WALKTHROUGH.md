# Fix Destructive Agent Behavior & IDE Errors - Walkthrough

## Summary

This walkthrough documents the implementation of an Observation Log system to
prevent the agent from hallucinating about resources it hasn't actually
reviewed. The system tracks all resources accessed via tool calls and injects
this information into the system prompt with clear mandates about what the agent
can claim to have reviewed.

## Changes Made

### Phase 1: Observation Log Structure ✅

#### 1. Created `ReviewTrackerService`

**File:** `packages/core/src/services/reviewTrackerService.ts`

A new service that tracks resources (files, directories, images) that the agent
has actually reviewed via tool calls.

Key features:

- Records reviewed resources with normalized paths
- Provides sorted list of reviewed resources
- Supports session reset

#### 2. Integrated with Config

**File:** `packages/core/src/config/config.ts`

Added `ReviewTrackerService` to the config interface:

```typescript
getReviewTrackerService(): ReviewTrackerService;
```

#### 3. Recording in CoreToolScheduler

**File:** `packages/core/src/core/coreToolScheduler.ts`

The scheduler now records resources whenever certain tools are executed:

- `read_file`: Records file paths
- `view`: Records paths
- `ls`: Records directory paths
- Other file system operations

Example:

```typescript
this.config.getReviewTrackerService().recordReview(path);
```

#### 4. Injected into System Prompt

**Files:**

- `packages/core/src/prompts/promptProvider.ts`
- `packages/core/src/prompts/snippets.ts`
- `packages/core/src/prompts/snippets.legacy.ts`

The prompt provider now:

1. Retrieves reviewed resources from the tracker
2. Passes them to the snippet rendering system
3. Renders them in an "Observation Log" section

The Observation Log appears in the system prompt with:

- List of all resources actually witnessed
- Clear mandate: "You MUST NOT claim to have reviewed, read, checked, or seen
  any resources that are not explicitly listed in your Observation Log above."

### Phase 2: Validation ✅

#### Integration Test

**File:** `packages/core/src/integration/observationLog.test.ts`

Created comprehensive integration test that:

1. Creates a mock config with ReviewTrackerService
2. Schedules a read_file tool call via CoreToolScheduler
3. Verifies the resource is recorded in the tracker
4. Generates system prompt via PromptProvider
5. Confirms the Observation Log is present with the mandate

**Test Result:** ✅ PASSING

```
✓ src/integration/observationLog.test.ts (1 test) 61ms
  ✓ Observation Log Integration > should record review in CoreToolScheduler and inject into PromptProvider
```

### Phase 3: IDE and Dependency Fixes ✅

All dependencies synced and builds passing:

- ✅ TypeScript compilation successful
- ✅ All packages build successfully
- ✅ Dependencies up to date

### Example Observation Log Output

When the agent has reviewed resources:

```markdown
# Observation Log

The following resources have been explicitly witnessed by you via tool calls in
this session. You may only claim to have "reviewed", "read", "checked", or
"seen" these resources: <observed_resources>

- src/main.ts
- src/config/settings.json
- README.md </observed_resources>

**Important:** You MUST NOT claim to have reviewed, read, checked, or seen any
resources that are not explicitly listed in your Observation Log above.
```

When no resources have been reviewed yet:

```markdown
# Observation Log

Your Observation Log is currently empty. You have not witnessed any resources in
this session yet.

**Important:** You MUST NOT claim to have reviewed, read, checked, or seen any
resources that are not explicitly listed in your Observation Log above.
```

## Impact

This change prevents the agent from:

1. **Hallucinating file contents** - Can't claim to have read a file without
   actually reading it
2. **Making false assumptions** - Must verify before claiming knowledge
3. **Destructive operations based on false premises** - Reduces risk of breaking
   working code

## Testing

Run the integration test:

```bash
npm run test -w @google/gemini-cli-core -- observationLog.test.ts
```

Expected output: ✅ All tests passing

## Files Modified

- `packages/core/src/config/config.ts` - Added ReviewTrackerService to config
- `packages/core/src/core/coreToolScheduler.ts` - Records reviews on tool
  execution
- `packages/core/src/prompts/promptProvider.ts` - Injects reviewed resources
- `packages/core/src/prompts/snippets.ts` - Renders Observation Log (modern
  models)
- `packages/core/src/prompts/snippets.legacy.ts` - Renders Observation Log
  (legacy models)

## Files Created

- `packages/core/src/services/reviewTrackerService.ts` - Core service
- `packages/core/src/services/reviewTrackerService.test.ts` - Unit tests
- `packages/core/src/integration/observationLog.test.ts` - Integration test

## Verification

✅ Build successful ✅ Tests passing ✅ TypeScript compilation clean ✅
Integration test validates end-to-end flow

---

**Status:** All phases complete and verified ✅
