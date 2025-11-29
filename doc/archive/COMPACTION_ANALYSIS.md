# Chat History Compaction Analysis

## Overview

The Gemini CLI implements an intelligent chat history compression system (also
called "compaction") that automatically summarizes older conversation context
when the token count approaches the model's context window limit. This document
provides a comprehensive analysis of how compaction works to enable improvements
through elicitation.

## Core Architecture

### Main Components

**Primary Service**: `ChatCompressionService`
(`packages/core/src/services/chatCompressionService.ts`)

- Central orchestrator for all compression operations
- Handles compression logic, validation, and error recovery

**Key Integration Points**:

1. `GeminiClient.tryCompressChat()` - Automatic compression during message
   streaming
2. Agent executor - Compression before each agent turn
3. CLI `/compress` command - Manual user-triggered compression

## Compression Triggers

### Automatic Triggers

Compression automatically activates when:

1. **Token Threshold Exceeded** (default: 50% of model's context window)
   - Configured via `model.compressionThreshold` setting
   - Range: 0.0 to 1.0 (percentage of max tokens)

2. **Context Window Near Capacity** (95% during message send)
   - Prevents overflow during ongoing conversations
   - Called in `GeminiClient.sendMessageStream()` at line 481

3. **Agent Turn Start**
   - Proactively compresses before each agent iteration
   - Ensures agent has maximum available context

### Manual Trigger

Users can force compression via:

- `/compress` or `/summarize` CLI commands
- Bypasses threshold checks
- Can retry after failed compression attempts

## Compression Algorithm

### Step 1: Determine Split Point

**Function**: `findCompressSplitPoint()` (chatCompressionService.ts:36-76)

The algorithm identifies where to split chat history:

```
[Older Messages to Compress] | [Recent Messages to Keep]
         ↓                              ↓
    Summarized                    Preserved
```

**Key Parameters**:

- `COMPRESSION_PRESERVE_THRESHOLD = 0.3` (keep latest 30% of history)
- Uses character count as proxy for tokens (1 token ≈ 4 characters)

**Split Point Rules**:

1. Only split at user message boundaries
2. Never split if user message has pending function responses
3. Ensure last message is from the model (protocol requirement)
4. Preserve sufficient recent context for coherence

### Step 2: Generate Structured Summary

**Prompt Template**: `packages/core/src/core/prompts.ts:353-411`

The compression prompt requests a structured XML summary:

```xml
<state_snapshot>
    <overall_goal>
        <!-- Single sentence: user's primary objective -->
    </overall_goal>

    <key_knowledge>
        <!-- Crucial facts, conventions, constraints discovered -->
    </key_knowledge>

    <file_system_state>
        <!-- Files created/modified/deleted with current status -->
    </file_system_state>

    <recent_actions>
        <!-- Summary of significant actions taken -->
    </recent_actions>

    <current_plan>
        <!-- Step-by-step plan with completion status -->
    </current_plan>
</state_snapshot>
```

**Why Structured XML?**

- Ensures consistent, parseable output
- Captures different aspects of conversation state
- Easy for model to reconstruct context from sections

### Step 3: Construct New History

The compressed history combines:

1. **Summary message** (as user message with system-like formatting)
2. **Acknowledgment** (model confirms receipt: "Got it. Thanks for the
   additional context!")
3. **Preserved recent messages** (latest 30% of original history)

### Step 4: Validate Compression

**Critical Check**: Ensure compression actually reduces tokens

```typescript
if (newTokenCount > oldTokenCount) {
  return CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT;
}
```

**Failure Scenarios**:

- Summary is longer than original content
- Token counting error occurs
- Model generates oversized response

## Compression Status Types

**Enum**: `CompressionStatus` (packages/core/src/core/turn.ts:163-175)

| Status                                    | Meaning                  | User Impact                             |
| ----------------------------------------- | ------------------------ | --------------------------------------- |
| `COMPRESSED`                              | Success                  | History reduced, more context available |
| `COMPRESSION_FAILED_INFLATED_TOKEN_COUNT` | Summary too large        | Original history retained               |
| `COMPRESSION_FAILED_TOKEN_COUNT_ERROR`    | Token calculation failed | Original history retained               |
| `NOOP`                                    | No compression needed    | History unchanged                       |

## State Management

### Failure Tracking

**Flag**: `hasFailedCompressionAttempt` (GeminiClient)

**Behavior**:

- Set to `true` after first compression failure
- Prevents repeated failed attempts (wasteful API calls)
- Can be overridden with `force=true` parameter
- Reset on successful compression

**Rationale**: If compression fails once, it likely will fail again unless
history grows significantly or user forces retry.

## Token Counting

### Threshold Calculation

```typescript
const tokenThreshold = modelTokenLimit * compressionThreshold;
const shouldCompress = currentTokenCount > tokenThreshold;
```

**Example** (with 100k token limit, 0.5 threshold):

- Compression triggers at 50k tokens
- Preserves ~30k tokens (30%)
- Compresses ~20k tokens into summary

### Character-to-Token Proxy

**Heuristic**: 1 token ≈ 4 characters

Used in `findCompressSplitPoint()` for quick estimation:

- Serializes history to JSON
- Counts characters
- Divides by 4 to estimate tokens
- Faster than calling tokenizer for every split point

## UI/UX Components

### Compression Message Display

**Component**: `CompressionMessage.tsx`
(packages/cli/src/ui/components/messages/)

**User Feedback**:

- Loading spinner during compression
- Success: "Chat history compressed from X to Y tokens"
- Failure messages tailored to scenario:
  - Small history (<50k): "Compression was not beneficial for this history size"
  - Large history: "Chat history compression did not reduce size. Continuing
    with full history."
  - Token error: "Could not compress chat history due to a token counting error"

### Command Interface

**File**: `packages/cli/src/ui/commands/compressCommand.ts`

**Commands**: `/compress`, `/summarize`

**Flow**:

1. User types command
2. Show loading spinner
3. Call `tryCompressChat(promptId, force=true)`
4. Display result message
5. Update turn counter

## Telemetry & Monitoring

**Event**: `chat_compression`

**Logged Data**:

- `tokens_before`: Pre-compression token count
- `tokens_after`: Post-compression token count
- Logged regardless of success/failure

**Purpose**: Track compression effectiveness, identify failure patterns

## Known Issues & Limitations

### Issue #1: Incomplete Token Counting (from integration test comments)

**Quote**: "Context compression is broken and doesn't include the system
instructions or tool counts, so it thinks compression is beneficial when it is
in fact not."

**Impact**:

- Validation may report false positives
- Compressed history might be larger than expected when system prompt + tools
  included
- Could lead to unnecessary compression attempts

**Location**: `integration-tests/context-compress-interactive.test.ts:54-56`

### Issue #2: Function Response Handling

**Constraint**: Cannot compress if last user message has pending function
responses

**Why**: Gemini API protocol requires function responses immediately follow
function calls

**Impact**: May delay compression when function calls occur near threshold

## Improvement Opportunities

### 1. Enhanced Compression Prompts

**Current State**: Single monolithic compression prompt

**Potential Improvements**:

- Multi-turn compression dialogue (ask clarifying questions)
- Task-specific compression strategies (coding vs. Q&A)
- Progressive compression (compress in stages vs. all-at-once)
- Elicit better summaries through explicit examples

### 2. Smarter Split Point Selection

**Current**: Character-based heuristic, preserves fixed 30%

**Could Improve**:

- Semantic boundary detection (preserve related message clusters)
- Dynamic preservation percentage based on recent activity
- Topic modeling to identify natural break points
- Preserve critical context (error messages, key decisions)

### 3. Token Counting Accuracy

**Current Issue**: Doesn't account for system prompt + tool definitions

**Fixes**:

- Include full prompt overhead in calculations
- Use actual tokenizer instead of character proxy
- Account for XML formatting overhead in structured summaries

### 4. Compression Quality Metrics

**Currently Missing**:

- No measure of information loss
- No validation that summary captures essential context
- No user feedback mechanism on quality

**Could Add**:

- Benchmark compression on known conversations
- Measure downstream task performance after compression
- A/B test different compression strategies
- User rating system for summaries

### 5. Adaptive Thresholds

**Current**: Fixed threshold (default 50%)

**Could Improve**:

- Model-specific thresholds (larger models tolerate more history)
- Task-adaptive (compress more aggressively for long-running agents)
- User behavior learning (adjust based on when user manually compresses)

### 6. Selective Compression

**Current**: All-or-nothing (compress old portion or don't)

**Alternatives**:

- Hierarchical compression (multiple summary layers)
- Tag preservation (keep certain message types uncompressed)
- Importance-based sampling (preserve high-value messages)

## File Reference Map

For elicitation and improvement work:

**Core Logic**:

- `packages/core/src/services/chatCompressionService.ts` - Main compression
  service
- `packages/core/src/core/prompts.ts:353-411` - Compression prompt template
- `packages/core/src/core/client.ts:700-732` - Auto-compression in client

**Configuration**:

- `packages/cli/src/config/settingsSchema.ts:691-700` - Settings schema
- Constants in chatCompressionService.ts (lines 13-14)

**UI/Commands**:

- `packages/cli/src/ui/commands/compressCommand.ts` - Manual compression command
- `packages/cli/src/ui/components/messages/CompressionMessage.tsx` - Display
  component

**Tests**:

- `packages/core/src/services/chatCompressionService.test.ts` - Unit tests
- `integration-tests/context-compress-interactive.test.ts` - Integration tests

## Testing Compression Changes

**Unit Tests**: Run compression service tests

```bash
npm test -- chatCompressionService.test.ts
```

**Integration Tests**: Test full CLI flow

```bash
npm test -- context-compress-interactive.test.ts
```

**Manual Testing**:

1. Start CLI with a model
2. Have a long conversation (or load long history)
3. Type `/compress` to manually trigger
4. Verify token counts and summary quality
5. Test continued conversation with compressed history

## Elicitation Strategy Recommendations

### For Improving Compression Prompts:

1. **Test Current Behavior**: Run compression on diverse conversation types
2. **Identify Patterns**: What information gets lost? What's over-represented?
3. **Craft Examples**: Create ideal summaries for representative conversations
4. **Iterative Prompting**: Use elicitation to refine XML structure and
   instructions
5. **Validate**: Test on held-out conversations, measure downstream performance

### For Improving Split Logic:

1. **Analyze Split Points**: Where does current algorithm split in real
   conversations?
2. **Manual Annotation**: Mark ideal split points in sample conversations
3. **Feature Engineering**: What signals indicate good split points?
4. **A/B Testing**: Compare current vs. improved splitting strategies

### For Improving Token Counting:

1. **Ground Truth**: Manually verify actual token counts with full prompt
2. **Error Analysis**: Quantify current estimation errors
3. **Fix Systematic Issues**: Add missing overheads (system prompt, tools)
4. **Validate**: Ensure compressed history never exceeds original

---

## Quick Reference

**Enable/Disable Compression**: Edit settings, change
`model.compressionThreshold`

- Set to 1.0 to effectively disable (never triggers)
- Set to 0.2 for aggressive compression (at 20% capacity)

**Force Compression**: Type `/compress` in CLI

**Check Compression Settings**: Look for compression messages in chat history

**Debug Token Counts**: Check telemetry logs for `chat_compression` events

---

_Document created for elicitation-driven improvement of the Gemini CLI
compression system._
