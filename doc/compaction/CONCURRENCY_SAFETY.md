# Concurrency Safety: User Elicitation Edge Cases

## Potential Bugs & Race Conditions

### 1. Multiple Compression Checks in Parallel

**Scenario:**

```
T=0:   User sends message A
T=0.1: sendMessageStream() checks compression → triggers prompt
T=0.5: User sends message B (before responding to prompt)
T=0.6: sendMessageStream() checks compression again → another prompt?
```

**Problem:** Two prompts appear simultaneously, confusing the user

**Mitigation:**

```typescript
class GeminiClient {
  private compressionInProgress: boolean = false
  private compressionPromptActive: boolean = false

  async tryCompressChat(promptId: string, force: boolean = false): Promise<CompressResult> {
    // Guard: Only one compression at a time
    if (this.compressionInProgress && !force) {
      return { status: CompressionStatus.NOOP }
    }

    // Guard: Don't show multiple prompts
    if (this.compressionPromptActive && !force) {
      return { status: CompressionStatus.NOOP }
    }

    try {
      this.compressionInProgress = true

      // ... compression logic

      if (isInteractive) {
        this.compressionPromptActive = true
        try {
          const selection = await this.promptUserForCurrentGoal(...)
          // ... handle selection
        } finally {
          this.compressionPromptActive = false
        }
      }

      // ... rest of compression
    } finally {
      this.compressionInProgress = false
    }
  }
}
```

### 2. User Sends Message While Prompt Active

**Scenario:**

```
┌─────────────────────────────┐
│ What are you working on?    │
│ 1. Auth                     │
│ Select [1-2]: _             │
└─────────────────────────────┘

User types: "Actually, can you help me with the database?"
User presses Enter
```

**Problem:** User's new message conflicts with active prompt

**Mitigation Option A: Queue Messages**

```typescript
class GeminiClient {
  private messageQueue: Array<{
    message: string;
    resolve: Function;
    reject: Function;
  }> = [];
  private compressionPromptActive: boolean = false;

  async sendMessageStream(message: string): Promise<Response> {
    // If prompt is active, queue the message
    if (this.compressionPromptActive) {
      return new Promise((resolve, reject) => {
        this.messageQueue.push({ message, resolve, reject });
        this.showMessage('Message queued (compression prompt active)...');
      });
    }

    // Normal flow
    const response = await this.actualSendMessage(message);

    // Process queued messages after compression completes
    if (!this.compressionPromptActive && this.messageQueue.length > 0) {
      const queued = this.messageQueue.shift();
      if (queued) {
        queued.resolve(await this.sendMessageStream(queued.message));
      }
    }

    return response;
  }
}
```

**Mitigation Option B: Cancel Prompt (RECOMMENDED)**

```typescript
class GeminiClient {
  private activePromptCancellation?: () => void

  async sendMessageStream(message: string): Promise<Response> {
    // Cancel active prompt if user sends a new message
    if (this.compressionPromptActive && this.activePromptCancellation) {
      this.activePromptCancellation()
      this.showMessage('Compression cancelled (new message sent)')
    }

    // Normal flow continues
    return this.actualSendMessage(message)
  }

  async promptUserForCurrentGoal(...): Promise<GoalSelection> {
    return new Promise((resolve, reject) => {
      // Set up cancellation
      this.activePromptCancellation = () => {
        this.compressionPromptActive = false
        resolve({ type: 'auto' })  // Fall back to auto-compress
      }

      // Show prompt with timeout
      const selection = await this.showPromptWithTimeout(...)

      // Clear cancellation
      this.activePromptCancellation = undefined

      resolve(selection)
    })
  }
}
```

### 3. Timeout Fires While User Is Typing

**Scenario:**

```
T=0:   Prompt shows: "Select [1-3]:"
T=28:  User starts typing "1"
T=30:  Timeout fires → auto-selects auto-compress
T=30.1: User's "1" keystroke arrives
```

**Problem:** User's input arrives after timeout, gets ignored

**Mitigation:**

```typescript
// In CompressionPrompt.tsx
interface PromptState {
  hasUserInteracted: boolean  // Did user press any key?
  timeoutExtended: boolean
}

function CompressionPrompt({ timeoutMs, ... }: CompressionPromptProps) {
  const [state, setState] = useState<PromptState>({
    hasUserInteracted: false,
    timeoutExtended: false
  })
  const [remainingSeconds, setRemainingSeconds] = useState(timeoutMs / 1000)

  useEffect(() => {
    const interval = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          // Check if user has started typing
          if (state.hasUserInteracted && !state.timeoutExtended) {
            // Extend timeout by 10 seconds
            setState({ ...state, timeoutExtended: true })
            return 10
          }
          // Timeout for real
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [state.hasUserInteracted])

  const handleKeyPress = (key: string) => {
    // Mark that user has started interacting
    if (!state.hasUserInteracted) {
      setState({ ...state, hasUserInteracted: true })
    }

    // Handle the actual input
    processInput(key)
  }
}
```

**Alternative: Accept Late Input Within Grace Period**

```typescript
async promptUserForCurrentGoal(...): Promise<GoalSelection> {
  const GRACE_PERIOD_MS = 2000  // 2 seconds after timeout

  const selectionPromise = this.showPrompt(...)
  const timeoutPromise = sleep(timeoutMs).then(() => 'TIMEOUT')

  const result = await Promise.race([selectionPromise, timeoutPromise])

  if (result === 'TIMEOUT') {
    this.showTimeoutMessage()

    // Wait for grace period in case user was typing
    const lateSelection = await Promise.race([
      selectionPromise,
      sleep(GRACE_PERIOD_MS).then(() => null)
    ])

    if (lateSelection) {
      this.showMessage('Input received, cancelling auto-compress')
      return lateSelection
    }

    return { type: 'auto' }
  }

  return result
}
```

### 4. Agent Mode vs Interactive Mode Conflict

**Scenario:**

```
T=0: User starts agent with task "Implement auth"
T=1: Agent is running autonomously
T=2: Agent generates many messages → triggers compression
T=3: Interactive prompt appears: "What are you working on?"
```

**Problem:** User shouldn't be prompted during agent execution

**Mitigation:**

```typescript
class GeminiClient {
  private isAgentMode: boolean = false;

  async tryCompressChat(
    promptId: string,
    force: boolean = false,
  ): Promise<CompressResult> {
    // ... trigger check logic

    // Determine if interactive
    const isInteractive =
      this.config.isCompressionInteractive() && !force && !this.isAgentMode; // NEW: Never interactive in agent mode

    if (isInteractive) {
      // Show prompt to user
    } else {
      // Use auto-compress or agent's task as goal
      if (this.isAgentMode && this.currentAgentTask) {
        userGoal = this.currentAgentTask.description;
        preserveStrategy = 'since-last-prompt';
      } else {
        userGoal = undefined;
        preserveStrategy = 'percentage';
      }
    }
  }

  // Called by AgentExecutor
  setAgentMode(enabled: boolean, task?: AgentTask) {
    this.isAgentMode = enabled;
    this.currentAgentTask = task;
  }
}

// In AgentExecutor
class AgentExecutor {
  async executeTask(task: AgentTask) {
    // Mark client as in agent mode
    this.client.setAgentMode(true, task);

    try {
      // Run agent
      await this.runAgent(task);
    } finally {
      // Clear agent mode
      this.client.setAgentMode(false);
    }
  }
}
```

### 5. Stale Goal Options (State Changed During Prompt)

**Scenario:**

```
T=0:   Compression triggers (42k tokens)
T=1:   Extract goals: ["Implementing auth", "Adding API"]
T=2:   Show prompt to user
T=5:   User is reading the options...
T=6:   User sends message "Can you help with database?" (in another terminal/tab?)
T=7:   History now at 48k tokens, goal is database not auth
T=10:  User selects "1. Implementing auth" (stale option)
```

**Problem:** Extracted goals don't reflect current conversation state

**Mitigation:**

```typescript
async tryCompressChat(promptId: string, force: boolean = false): Promise<CompressResult> {
  // Snapshot current state
  const snapshotTokens = this.getCurrentTokenCount()
  const snapshotHistory = await this.getHistory()

  // Extract goals from snapshot
  const goalExtractionResult = await this.extractGoalOptions(snapshotHistory)

  // Prompt user
  const selection = await this.promptUserForCurrentGoal(decision, goalExtractionResult.goals)

  // Before compressing, check if state has changed significantly
  const currentTokens = this.getCurrentTokenCount()
  const tokenDelta = Math.abs(currentTokens - snapshotTokens)

  if (tokenDelta > 5000) {
    // Significant change - re-extract goals
    this.showMessage(`Context changed during selection (${tokenDelta} tokens). Re-analyzing...`)

    const newGoalResult = await this.extractGoalOptions(await this.getHistory())

    // Show confirmation: "You selected 'auth', but context shows 'database'. Proceed?"
    const confirmed = await this.confirmGoalStillValid(selection, newGoalResult.goals)

    if (!confirmed) {
      // Re-prompt with fresh goals
      return this.tryCompressChat(promptId, true)
    }
  }

  // Proceed with compression
  // ...
}
```

**Simpler Mitigation: Lock History During Prompt**

```typescript
class GeminiClient {
  private historyLocked: boolean = false

  async sendMessageStream(message: string): Promise<Response> {
    // Wait if history is locked for compression
    while (this.historyLocked) {
      await sleep(100)
    }

    return this.actualSendMessage(message)
  }

  async tryCompressChat(...): Promise<CompressResult> {
    try {
      // Lock history during extraction and prompt
      this.historyLocked = true

      const goalResult = await this.extractGoalOptions(history)
      const selection = await this.promptUserForCurrentGoal(...)

      // Unlock before actual compression (compression is safe)
      this.historyLocked = false

      // Compress with locked snapshot
      return await this.compressionService.compress(...)
    } finally {
      this.historyLocked = false
    }
  }
}
```

### 6. Recursive Compression Trigger

**Scenario:**

```
T=0: Compression starts
T=1: Call model to generate summary
T=2: Model response adds messages to history
T=3: Token count increases
T=4: sendMessage() internally calls shouldTriggerCompression() → another compression?
```

**Problem:** Compression might trigger itself recursively

**Mitigation:**

```typescript
class GeminiClient {
  private compressionInProgress: boolean = false
  private isCompressionApiCall: boolean = false

  async tryCompressChat(...): Promise<CompressResult> {
    if (this.compressionInProgress) {
      return { status: CompressionStatus.NOOP }
    }

    try {
      this.compressionInProgress = true

      // ... compression logic

      // Mark that API calls are for compression
      this.isCompressionApiCall = true
      const result = await this.compressionService.compress(...)
      this.isCompressionApiCall = false

      return result
    } finally {
      this.compressionInProgress = false
    }
  }

  private shouldTriggerCompression(): TriggerDecision {
    // Never trigger during compression
    if (this.compressionInProgress || this.isCompressionApiCall) {
      return {
        shouldCompress: false,
        isSafetyValve: false,
        reason: 'compression_in_progress',
        // ...
      }
    }

    // Normal trigger logic
    // ...
  }
}
```

### 7. Multiple Prompts from Different Entry Points

**Scenario:**

```
Code Path A: client.sendMessage() → check compression
Code Path B: agent.beforeTurn() → check compression
Code Path C: /compress command → check compression

If all happen near-simultaneously, multiple prompts?
```

**Problem:** Multiple code paths might trigger compression at once

**Mitigation: Single Entry Point with Lock**

```typescript
class GeminiClient {
  private compressionLock: Promise<void> | null = null

  async tryCompressChat(...): Promise<CompressResult> {
    // Wait for any in-flight compression
    if (this.compressionLock) {
      await this.compressionLock
      // Check if compression is still needed after waiting
      const stillNeeded = this.shouldTriggerCompression()
      if (!stillNeeded.shouldCompress && !force) {
        return { status: CompressionStatus.NOOP }
      }
    }

    // Create lock promise
    let releaseLock: () => void
    this.compressionLock = new Promise(resolve => {
      releaseLock = resolve
    })

    try {
      // Perform compression
      const result = await this.actualCompress(...)
      return result
    } finally {
      // Release lock
      releaseLock!()
      this.compressionLock = null
    }
  }
}
```

### 8. User Closes Terminal During Prompt

**Scenario:**

```
T=0: Prompt shows: "What are you working on?"
T=5: User closes terminal / kills process
T=6: Process dies, no cleanup
```

**Problem:** Partial state might be saved (e.g., compressionPromptActive=true)

**Mitigation:**

```typescript
class GeminiClient {
  constructor() {
    // Register cleanup on process exit
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
    process.on('exit', () => this.cleanup());
  }

  cleanup() {
    // Reset compression state
    this.compressionInProgress = false;
    this.compressionPromptActive = false;
    this.historyLocked = false;

    // Cancel any active prompt
    if (this.activePromptCancellation) {
      this.activePromptCancellation();
    }

    // Don't persist these flags to disk
  }
}
```

### 9. Prompt Shown During Error State

**Scenario:**

```
T=0: User encounters API error
T=1: Error message displayed
T=2: User is reading error, trying to understand
T=3: Compression triggers (threshold reached)
T=4: Prompt overlays error message
```

**Problem:** Prompt interrupts user's error troubleshooting

**Mitigation:**

```typescript
class GeminiClient {
  private recentErrors: Array<{ timestamp: number; error: Error }> = [];

  onError(error: Error) {
    this.recentErrors.push({ timestamp: Date.now(), error });
    // Keep only last 5 minutes
    this.recentErrors = this.recentErrors.filter(
      (e) => Date.now() - e.timestamp < 300000,
    );
  }

  private shouldTriggerCompression(): TriggerDecision {
    // Check for recent errors
    const recentErrorCount = this.recentErrors.filter(
      (e) => Date.now() - e.timestamp < 60000, // Last minute
    ).length;

    if (recentErrorCount >= 2) {
      // User is dealing with errors, don't interrupt
      return {
        shouldCompress: false,
        isSafetyValve: false,
        reason: 'recent_errors_detected',
        // ...
      };
    }

    // Normal trigger logic
    // ...
  }
}
```

### 10. Prompt During Streaming Response

**Scenario:**

```
T=0: User asks question
T=1: Model starts streaming response
T=2: Token count hits threshold
T=3: Compression prompt shows while response is streaming
```

**Problem:** Prompt interrupts user's reading of response

**Mitigation:**

```typescript
class GeminiClient {
  private isStreaming: boolean = false;

  async sendMessageStream(message: string): Promise<Response> {
    this.isStreaming = true;

    try {
      for await (const chunk of this.streamResponse(message)) {
        yield chunk;
      }
    } finally {
      this.isStreaming = false;
    }
  }

  private shouldTriggerCompression(): TriggerDecision {
    // Never trigger during active streaming
    if (this.isStreaming) {
      return {
        shouldCompress: false,
        isSafetyValve: false,
        reason: 'streaming_in_progress',
        // ...
      };
    }

    // Normal trigger logic
    // ...
  }
}
```

---

## Recommended Implementation Strategy

### Phase 1: Core Guards (Must-Have)

```typescript
class GeminiClient {
  // Mutual exclusion
  private compressionInProgress: boolean = false
  private compressionPromptActive: boolean = false
  private compressionLock: Promise<void> | null = null

  // State tracking
  private isStreaming: boolean = false
  private isAgentMode: boolean = false
  private historyLocked: boolean = false

  // Cancellation
  private activePromptCancellation?: () => void

  async tryCompressChat(...): Promise<CompressResult> {
    // Guard 1: Wait for any in-flight compression
    if (this.compressionLock) {
      await this.compressionLock
      if (!this.shouldStillCompress()) {
        return NOOP
      }
    }

    // Guard 2: Don't start multiple compressions
    if (this.compressionInProgress && !force) {
      return NOOP
    }

    // Guard 3: Don't show multiple prompts
    if (this.compressionPromptActive && !force) {
      return NOOP
    }

    // Create lock
    let releaseLock: () => void
    this.compressionLock = new Promise(r => releaseLock = r)

    try {
      this.compressionInProgress = true

      // ... compression logic

      if (shouldShowPrompt) {
        this.compressionPromptActive = true
        try {
          const selection = await this.promptWithCancellation(...)
          // ...
        } finally {
          this.compressionPromptActive = false
        }
      }

      // ...
    } finally {
      this.compressionInProgress = false
      releaseLock!()
      this.compressionLock = null
    }
  }

  private shouldTriggerCompression(): TriggerDecision {
    // Never trigger if:
    if (this.compressionInProgress) return NO('compression_in_progress')
    if (this.isStreaming) return NO('streaming_in_progress')
    if (this.isAgentMode && config.isInteractive()) return NO('agent_mode')

    // Normal logic...
  }
}
```

### Phase 2: User Experience Enhancements (Nice-to-Have)

```typescript
// Graceful prompt cancellation
async sendMessageStream(message: string) {
  if (this.compressionPromptActive && this.activePromptCancellation) {
    this.activePromptCancellation()
    this.showMessage('Compression cancelled (new message)')
  }
  // Continue...
}

// Timeout extension when user is typing
function CompressionPrompt() {
  const [userInteracted, setUserInteracted] = useState(false)
  const [extendedTimeout, setExtendedTimeout] = useState(false)

  useEffect(() => {
    if (remainingSeconds === 0 && userInteracted && !extendedTimeout) {
      // Extend by 10 seconds
      setRemainingSeconds(10)
      setExtendedTimeout(true)
    }
  }, [remainingSeconds, userInteracted])
}

// Stale goal detection
async tryCompressChat() {
  const snapshot = {
    tokens: this.getCurrentTokenCount(),
    history: await this.getHistory()
  }

  const selection = await this.promptUser()

  // Check for staleness
  if (Math.abs(this.getCurrentTokenCount() - snapshot.tokens) > 5000) {
    const proceed = await this.confirmStaleSelection()
    if (!proceed) return this.tryCompressChat(promptId, true)
  }
}
```

### Phase 3: Robustness (Production-Ready)

```typescript
// Error state awareness
private recentErrors: Error[] = []
private shouldTriggerCompression() {
  if (this.hasRecentErrors(threshold: 2, windowMs: 60000)) {
    return NO('error_recovery_in_progress')
  }
}

// Process cleanup
constructor() {
  process.on('SIGINT', () => this.cleanup())
  process.on('SIGTERM', () => this.cleanup())
}

cleanup() {
  this.compressionInProgress = false
  this.compressionPromptActive = false
  this.historyLocked = false
  this.activePromptCancellation?.()
}
```

---

## Testing Strategy

### Unit Tests for Guards

```typescript
describe('Compression Guards', () => {
  it('prevents multiple simultaneous compressions', async () => {
    const [result1, result2] = await Promise.all([
      client.tryCompressChat(promptId),
      client.tryCompressChat(promptId),
    ]);
    expect([result1.status, result2.status]).toContain(CompressionStatus.NOOP);
  });

  it('does not trigger during streaming', async () => {
    client.startStreaming();
    const decision = client.shouldTriggerCompression();
    expect(decision.shouldCompress).toBe(false);
    expect(decision.reason).toBe('streaming_in_progress');
  });

  it('uses non-interactive mode for agents', async () => {
    client.setAgentMode(true, { description: 'Test task' });
    const result = await client.tryCompressChat(promptId);
    expect(result.selectionMethod).toBe('agent');
  });
});
```

### Integration Tests for Race Conditions

```typescript
describe('Concurrent Message Handling', () => {
  it('queues messages during active prompt', async () => {
    // Trigger compression prompt
    client.triggerCompression();

    // Send message while prompt active
    const messagePromise = client.sendMessage('New message');

    // Message should be queued
    expect(client.messageQueue.length).toBe(1);

    // Complete prompt
    client.selectGoal('1');

    // Message should process
    await messagePromise;
    expect(client.messageQueue.length).toBe(0);
  });

  it('cancels prompt when new message sent', async () => {
    const promptPromise = client.promptUserForGoal();

    await sleep(1000); // Wait for prompt to show

    // User sends new message
    await client.sendMessage('Help with database');

    // Prompt should auto-cancel
    const result = await promptPromise;
    expect(result.type).toBe('auto');
  });
});
```

### Manual Test Scenarios

```markdown
## Manual Testing Checklist

### Scenario 1: Rapid Message Sending

- [ ] Trigger compression prompt
- [ ] While prompt is showing, send 3 messages rapidly
- [ ] Verify only one prompt appears
- [ ] Verify messages are queued or prompt is cancelled

### Scenario 2: Timeout Edge Cases

- [ ] Trigger prompt, wait 28 seconds
- [ ] Start typing selection
- [ ] Verify timeout extends or accepts late input
- [ ] Verify no double-selection

### Scenario 3: Agent Mode

- [ ] Start agent task
- [ ] Verify no interactive prompts during agent execution
- [ ] Verify compression uses agent's task as goal

### Scenario 4: Error Recovery

- [ ] Trigger 2-3 API errors
- [ ] Verify compression doesn't interrupt error handling
- [ ] Verify compression resumes after errors clear

### Scenario 5: Streaming Response

- [ ] Ask question that produces long response
- [ ] While streaming, verify compression doesn't trigger
- [ ] After streaming completes, verify compression can trigger
```

---

## Summary: Critical Guards to Implement

**Must-Have (Phase 1):**

1. ✅ `compressionInProgress` flag - Prevents multiple compressions
2. ✅ `compressionPromptActive` flag - Prevents multiple prompts
3. ✅ `compressionLock` - Serializes compression attempts
4. ✅ `isStreaming` check - Don't interrupt streaming
5. ✅ `isAgentMode` check - Non-interactive for agents

**Should-Have (Phase 2):** 6. ✅ Prompt cancellation on new message 7. ✅
Timeout extension when user interacts 8. ✅ Stale goal detection

**Nice-to-Have (Phase 3):** 9. ✅ Error state awareness 10. ✅ Process cleanup
handlers 11. ✅ History locking during prompt

---

_Concurrency Safety Document - v1.0_
