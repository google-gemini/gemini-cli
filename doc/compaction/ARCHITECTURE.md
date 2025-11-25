# Deliberate Context Compaction: Architecture Overview

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Interface                           │
│  (CLI Component: CompressionPrompt.tsx)                         │
│  - Displays: "What are you working on?"                         │
│  - Multiple choice: Goals 1-3, Auto, Other, Don't ask, Less    │
│  - Timeout: 30s → auto-select                                   │
└────────────────┬────────────────────────────────────────────────┘
                 │ User Selection
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                      GeminiClient (Core)                         │
│  - shouldTriggerCompression() → Hybrid: 40k tokens OR 50%      │
│  - Anti-annoyance guards: 25 msg + 5 min between prompts       │
│  - extractGoalOptions() → Parse recent history                  │
│  - promptUserForCurrentGoal() → Show UI, wait with timeout     │
│  - Handles opt-outs: disable / less-frequent                   │
└────────────────┬────────────────────────────────────────────────┘
                 │ Compression Request
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│              ChatCompressionService (Core)                       │
│  - compress(options) → Main orchestrator                        │
│  - findCompressSplitPoint() → Two strategies:                  │
│    • 'percentage': Keep 30% (conservative/auto)                │
│    • 'since-last-prompt': Keep only current exchange           │
│  - Uses enhanced prompt with trajectory focus                   │
└────────────────┬────────────────────────────────────────────────┘
                 │ Compressed History
                 ↓
┌─────────────────────────────────────────────────────────────────┐
│                   Configuration & State                          │
│  - Settings: compressionInteractive, trigger thresholds         │
│  - Runtime state: lastCompressionTime, messagesSinceCompress   │
│  - Telemetry: Tracks usage patterns, multiplier applications   │
└─────────────────────────────────────────────────────────────────┘
```

## File Modifications & Additions

### Core Logic (Modified Files)

**1. `packages/core/src/core/client.ts`** (GeminiClient)

```typescript
// NEW METHODS:
+ shouldTriggerCompression(): { shouldCompress, isSafetyValve }
+ extractGoalOptions(history): Promise<string[]>
+ promptUserForCurrentGoal(utilization, options): Promise<string>
+ truncateMiddle(message, options): Content

// NEW STATE:
+ lastCompressionTime: number
+ messagesSinceLastCompress: number

// MODIFIED:
~ tryCompressChat() - Now calls new methods, handles opt-outs
~ onNewMessage() - Increments message counter
```

**2. `packages/core/src/services/chatCompressionService.ts`**

```typescript
// MODIFIED SIGNATURE:
~ compress(chat, promptId, options: CompressionOptions)

// MODIFIED METHOD:
~ findCompressSplitPoint(history, preserveStrategy, preserveThreshold?)
  - Add 'since-last-prompt' strategy
  - Keep existing 'percentage' strategy

// NEW INTERFACE:
+ interface CompressionOptions {
    force: boolean
    model: string
    config: GeminiClientConfig
    hasFailedCompressionAttempt: boolean
    userGoal?: string              // NEW
    preserveStrategy: 'percentage' | 'since-last-prompt'  // NEW
    preserveThreshold?: number     // NEW
    interactive?: boolean          // NEW
  }

+ interface CompressResult {
    // Existing fields...
    messagesPreserved?: number     // NEW
    messagesCompressed?: number    // NEW
    discardedContextSummary?: string  // NEW
  }
```

**3. `packages/core/src/core/prompts.ts`**

```typescript
// MODIFIED:
~ getChatCompressionPrompt(historyToCompress, userGoal?: string)
  - Prepend user goal context if provided
  - Add trajectory-focused instructions
  - Add <current_goal> and <discarded_context_summary> to XML
```

**4. `packages/core/src/agents/executor.ts`**

```typescript
// MODIFIED:
~ tryCompressChat() - Pass agent's task as userGoal
  - userGoal: this.currentTask?.description
  - preserveStrategy: 'since-last-prompt'
  - interactive: false
```

### UI Components

**NEW: `packages/cli/src/ui/components/messages/CompressionPrompt.tsx`**

```typescript
interface CompressionPromptProps {
  utilizationPercent: number;
  currentTokens: number;
  goalOptions: string[]; // Extracted from conversation
  onGoalSelect: (goal: string | 'auto' | 'disable' | 'less-frequent') => void;
  timeoutMs: number; // Default: 30000
  isSafetyValve: boolean; // Hides opt-out options if true
}

// Displays:
// - Current context usage
// - Multiple-choice goals (1-3)
// - Auto-compress option
// - Other (custom input)
// - Don't ask me again (if !isSafetyValve)
// - Check in less often (if !isSafetyValve)
// - Countdown timer
// - Auto-selects on timeout
```

**MODIFIED: `packages/cli/src/ui/components/messages/CompressionMessage.tsx`**

```typescript
interface CompressionMessageProps {
  // Existing...
  userGoal?: string; // NEW
  messagesPreserved?: number; // NEW
  messagesCompressed?: number; // NEW
  goalWasSelected?: boolean; // NEW
}

// Enhanced display:
// - Shows goal if selected
// - Shows message counts
// - Shows opt-out confirmations
// - Shows multiplier feedback
```

### Configuration

**MODIFIED: `packages/cli/src/config/settingsSchema.ts`**

```typescript
// NEW SETTINGS:
+ compressionStrategy: 'percentage' | 'since-last-prompt' (default: 'since-last-prompt')
+ compressionInteractive: boolean (default: true)
+ compressionPromptTimeout: number (default: 30, min: 10, max: 300)
+ compressionTriggerTokens: number (default: 40000, min: 10000, max: 200000)
+ compressionTriggerUtilization: number (default: 0.50, min: 0.3, max: 0.95)
+ compressionMinMessagesSinceLastCompress: number (default: 25, min: 5, max: 100)
+ compressionMinTimeBetweenPrompts: number (default: 300, min: 60, max: 1800)
+ compressionFrequencyMultiplier: number (default: 1.5, min: 1.2, max: 3.0)

// EXISTING (kept for backwards compatibility):
~ model.compressionThreshold (deprecated but still works)
```

### Telemetry

**MODIFIED: `packages/core/src/telemetry/loggers.ts`**

```typescript
// ENHANCED EVENT:
~ logChatCompression({
    // Existing...
    tokens_before: number,
    tokens_after: number,

    // NEW FIELDS:
    preserve_strategy: 'percentage' | 'since-last-prompt',
    messages_preserved: number,
    messages_compressed: number,
    had_user_goal: boolean,
    interactive_mode: boolean,
    utilization_at_trigger: number,
    goal_selection_method?: 'manual' | 'timeout' | 'auto' | 'agent',
    goal_extraction_success?: boolean,
    goal_extraction_duration_ms?: number,
    prompt_timeout_occurred?: boolean,
    trigger_type?: 'absolute_tokens' | 'utilization_threshold',
    tokens_at_trigger?: number,
    messages_since_last_compress?: number,
    time_since_last_compress_seconds?: number,
    user_selected_disable?: boolean,
    user_selected_less_frequent?: boolean,
    was_safety_valve?: boolean,
    frequency_multiplier_applied?: number,
    cumulative_frequency_reduction?: number,
    new_token_threshold?: number,
    new_message_threshold?: number,
    times_less_frequent_selected?: number
  })
```

### Tests

**NEW: `packages/core/src/services/chatCompressionService.test.ts`** (additions)

```typescript
+describe('shouldTriggerCompression') +
  describe('extractGoalOptions') +
  describe('since-last-prompt strategy') +
  describe('prompt timeout');
```

**NEW: `integration-tests/context-compress-deliberate.test.ts`**

```typescript
+test('deliberate compression with goal selection') +
  test('timeout fallback to auto-compress') +
  test('opt-out: disable interactive mode') +
  test('opt-out: less frequent check-ins') +
  test('safety valve behavior at 50%');
```

## Data Flow

### Flow 1: Normal Compression (User Selects Goal)

```
1. User sends message
   ↓
2. GeminiClient.onNewMessage() → messagesSinceLastCompress++
   ↓
3. GeminiClient.shouldTriggerCompression()
   → Check: tokens > 40k? messages >= 25? time >= 5min?
   → Returns: { shouldCompress: true, isSafetyValve: false }
   ↓
4. GeminiClient.extractGoalOptions(history)
   → Truncate assistant messages (keep start + end)
   → Call model with extraction prompt
   → Parse response → ['Goal 1', 'Goal 2', 'Goal 3']
   ↓
5. GeminiClient.promptUserForCurrentGoal(options)
   → Show CompressionPrompt component
   → User selects "1. Goal 1" (within 30s)
   → Returns: 'Goal 1'
   ↓
6. GeminiClient.tryCompressChat()
   → compressionService.compress({
       userGoal: 'Goal 1',
       preserveStrategy: 'since-last-prompt'
     })
   ↓
7. ChatCompressionService.findCompressSplitPoint()
   → Strategy: 'since-last-prompt'
   → Find last user message index
   → Split: everything before = compress, from there = keep
   ↓
8. ChatCompressionService.compress()
   → Build prompt with <current_goal>Goal 1</current_goal>
   → Call model to generate trajectory-focused summary
   → Construct new history: [summary, ack, preserved messages]
   → Validate token reduction
   ↓
9. Return CompressResult
   → status: COMPRESSED
   → messagesPreserved: 2
   → messagesCompressed: 45
   ↓
10. Update state
    → lastCompressionTime = now
    → messagesSinceLastCompress = 0
    ↓
11. Display CompressionMessage
    → "✓ Chat history compressed"
    → "Goal: Implementing user authentication"
    → "Before: 52k tokens → After: 18k tokens"
    ↓
12. Log telemetry
    → goal_selection_method: 'manual'
    → preserve_strategy: 'since-last-prompt'
    → trigger_type: 'absolute_tokens'
```

### Flow 2: Timeout (User Doesn't Respond)

```
1-4. [Same as Flow 1]
   ↓
5. GeminiClient.promptUserForCurrentGoal(options)
   → Show CompressionPrompt component
   → Wait 30 seconds...
   → No response
   → Timeout triggers
   → Returns: 'auto'
   ↓
6. GeminiClient.tryCompressChat()
   → compressionService.compress({
       userGoal: undefined,
       preserveStrategy: 'percentage'  // Conservative
     })
   ↓
7. ChatCompressionService.findCompressSplitPoint()
   → Strategy: 'percentage'
   → Keep 30% of history (old behavior)
   ↓
8-12. [Similar to Flow 1, but with generic summary]
   ↓
12. Log telemetry
    → goal_selection_method: 'timeout'
    → preserve_strategy: 'percentage'
    → prompt_timeout_occurred: true
```

### Flow 3: Opt-Out (User Selects "Don't ask me again")

```
1-4. [Same as Flow 1]
   ↓
5. GeminiClient.promptUserForCurrentGoal(options)
   → User selects "6. Don't ask me again"
   → Returns: 'disable'
   ↓
6. GeminiClient handles opt-out
   → config.setCompressionInteractive(false)
   → Show message: "Interactive compression disabled"
   → Override selection to 'auto' for this compression
   ↓
7-11. [Proceeds with auto-compress]
   ↓
12. Log telemetry
    → goal_selection_method: 'auto'
    → user_selected_disable: true
    ↓
13. Future compressions
    → Interactive prompt skipped
    → Always uses auto-compress strategy
```

### Flow 4: Less Frequent (User Adjusts Frequency)

```
1-4. [Same as Flow 1]
   ↓
5. GeminiClient.promptUserForCurrentGoal(options)
   → User selects "7. Check in less often"
   → Returns: 'less-frequent'
   ↓
6. GeminiClient handles frequency adjustment
   → multiplier = config.getCompressionFrequencyMultiplier()  // 1.5
   → currentTokens = config.getCompressionTriggerTokens()  // 40000
   → currentMessages = config.getCompressionMinMessages()  // 25
   → newTokens = currentTokens × 1.5 = 60000
   → newMessages = currentMessages × 1.5 = 38
   → config.setCompressionTriggerTokens(60000)
   → config.setCompressionMinMessages(38)
   → Show message: "Check-ins 1.5x less frequent: 40k→60k tokens, 25→38 messages"
   → Override selection to 'auto' for this compression
   ↓
7-11. [Proceeds with auto-compress]
   ↓
12. Log telemetry
    → goal_selection_method: 'auto'
    → user_selected_less_frequent: true
    → frequency_multiplier_applied: 1.5
    → new_token_threshold: 60000
    → new_message_threshold: 38
    → times_less_frequent_selected: 1
    ↓
13. Future compressions
    → Triggers at 60k tokens instead of 40k
    → Requires 38 messages instead of 25
    → If user selects again: 90k, 57 messages (2.25x cumulative)
```

### Flow 5: Safety Valve (50% Utilization Forced)

```
1. User sends message
   ↓
2. GeminiClient.shouldTriggerCompression()
   → tokens: 520k (52% of 1M context)
   → Returns: { shouldCompress: true, isSafetyValve: true }
   ↓
3-4. [Goal extraction happens]
   ↓
5. GeminiClient.promptUserForCurrentGoal(options, isSafetyValve=true)
   → Show CompressionPrompt component
   → ⚠️ "Context at 50% capacity - compression required"
   → Show goals 1-3, Auto, Other
   → HIDE "Don't ask me again" and "Check in less often"
   → User must select a compression option
   ↓
6-12. [Proceeds based on user selection]
   ↓
12. Log telemetry
    → was_safety_valve: true
    → trigger_type: 'utilization_threshold'
```

### Flow 6: Agent Mode (Non-Interactive)

```
1. Agent executor detects compression needed
   ↓
2. executor.tryCompressChat()
   → compressionService.compress({
       userGoal: this.currentTask?.description,  // Agent's task
       preserveStrategy: 'since-last-prompt',
       interactive: false  // Skip UI prompts
     })
   ↓
3-8. [Compression proceeds without user interaction]
   ↓
9. Log telemetry
   → goal_selection_method: 'agent'
   → interactive_mode: false
```

## State & Preference Storage

### Runtime State (GeminiClient)

```typescript
// Per-session state (not persisted)
class GeminiClient {
  private lastCompressionTime: number = 0;
  private messagesSinceLastCompress: number = 0;
  private hasFailedCompressionAttempt: boolean = false;

  // Resets on session start
  // Updated on each compression
}
```

### User Preferences (Configuration File)

**Location**: `~/.gemini-cli/config.json` (or project-level
`.gemini/config.json`)

```json
{
  "compressionStrategy": "since-last-prompt",
  "compressionInteractive": true,
  "compressionPromptTimeout": 30,
  "compressionTriggerTokens": 40000,
  "compressionTriggerUtilization": 0.5,
  "compressionMinMessagesSinceLastCompress": 25,
  "compressionMinTimeBetweenPrompts": 300,
  "compressionFrequencyMultiplier": 1.5,

  "model": {
    "compressionThreshold": 0.5
  }
}
```

**Modification Paths**:

1. Direct edit: User edits config file
2. Settings command: CLI settings interface
3. Runtime: Code calls `config.setCompressionInteractive(false)`
   - Persists to disk for future sessions
4. Dynamic adjustment: "Check in less often" updates thresholds

**Reading**:

```typescript
// In GeminiClient or CompressionService
const isInteractive = this.config.isCompressionInteractive();
const tokenThreshold = this.config.getCompressionTriggerTokens();
const minMessages = this.config.getCompressionMinMessages();
const multiplier = this.config.getCompressionFrequencyMultiplier();
```

### Telemetry Data (Analytics)

**Location**: Sent to telemetry service (not stored locally)

**Usage**:

- Track feature adoption
- Monitor success rates
- Identify patterns (e.g., timeout frequency)
- Measure cost impact
- Understand user preferences (manual vs auto)
- Track multiplier effectiveness

## Key Design Decisions

### 1. Hybrid Trigger Strategy

- **Primary**: 40k absolute tokens (cost optimization)
- **Safety**: 50% utilization (prevents overflow)
- **Guards**: 25 messages + 5 minutes (prevents annoyance)

### 2. Two Preservation Strategies

- **Percentage** (30%): Conservative, for auto-compress
- **Since-last-prompt**: Aggressive, for goal-focused

### 3. Multiple-Choice UI

- Fast (single keypress)
- Shows understanding (extracted goals)
- Always has escape hatch (auto-compress)
- Non-blocking (30s timeout)

### 4. Opt-Out Mechanisms

- **Immediate**: "Auto-compress" option always available
- **Session**: "Don't ask me again" disables for all future sessions
- **Gradual**: "Check in less often" uses 1.5x multiplier (adjustable)
- **Safety valve**: Forces compression at 50% (no opt-out)

### 5. Non-Breaking Changes

- Old API still works (adds defaults)
- Existing settings honored
- Can disable interactive mode → reverts to old behavior

## Component Dependencies

```
CompressionPrompt.tsx
  ↓ (user selection)
GeminiClient
  ↓ (compression request)
ChatCompressionService
  ↓ (uses)
prompts.ts (getChatCompressionPrompt)
  ↓ (reads)
Config (settingsSchema.ts)
  ↓ (writes)
Telemetry (loggers.ts)
```

## Performance Considerations

### Goal Extraction Optimization

- **Truncate messages**: Keep start (500 chars) + end (300 chars)
- **Reduces tokens**: ~70% reduction in extraction payload
- **Avoids**: Sending full code blocks, tool outputs
- **Timeout**: 5 seconds max for extraction

### API Call Economics

```
Without deliberate compression (utilization-only):
  - Typical session: $2.75
  - Long session: $43

With deliberate compression (40k trigger):
  - Typical session: $1.23 (55% savings)
  - Long session: $6 (86% savings)

Additional cost from goal extraction:
  - ~1k tokens per extraction
  - ~2 extractions per typical session
  - Cost: ~$0.002 per session
  - Net savings: Still 50%+ cheaper
```

## Implementation Phases

1. **Phase 1**: Core logic (preserveStrategy, split point)
2. **Phase 2**: Goal extraction (truncation, parsing)
3. **Phase 3**: Interactive UI (prompt component)
4. **Phase 4**: Configuration (new settings)
5. **Phase 5**: Telemetry & polish

**Total effort**: ~1.5-2 weeks

## Risk Mitigation

- **Goal extraction fails**: Fall back to auto-compress
- **User timeout**: Auto-select after 30s
- **Aggressive too lossy**: Include discarded summary, offer restore
- **Too many prompts**: Guards (25 msg + 5 min), opt-out options
- **Agent mode**: Use task description, skip UI

---

_Architecture for deliberate, learning-focused context compaction in Gemini
CLI._
