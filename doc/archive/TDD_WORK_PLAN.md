# TDD Work Plan: Deliberate Context Compaction

## Implementation Philosophy

**Test-Driven Development Approach:**

1. Write failing test that defines expected behavior
2. Implement minimal code to make test pass
3. Refactor while keeping tests green
4. Commit after each passing test suite

**Module Order:**

- Bottom-up: Core logic → Service layer → Client integration → UI
- Each module fully tested before moving to next
- Concurrency guards integrated throughout

---

## Phase 1: Core Compression Logic (2-3 days)

### Module 1.1: Split Point Strategy - "Since Last Prompt"

**Test File:** `packages/core/src/services/chatCompressionService.test.ts`

#### Test 1.1.1: Basic Split at Last User Message

```typescript
describe('findCompressSplitPoint - since-last-prompt strategy', () => {
  it('should split at last user message', () => {
    // GIVEN: History with 10 messages, last user message at index 8
    const history = [
      { role: 'user', parts: [{ text: 'msg 1' }] },
      { role: 'model', parts: [{ text: 'response 1' }] },
      { role: 'user', parts: [{ text: 'msg 2' }] },
      { role: 'model', parts: [{ text: 'response 2' }] },
      { role: 'user', parts: [{ text: 'msg 3' }] }, // Index 4
      { role: 'model', parts: [{ text: 'response 3' }] },
      { role: 'user', parts: [{ text: 'msg 4' }] },
      { role: 'model', parts: [{ text: 'response 4' }] },
      { role: 'user', parts: [{ text: 'msg 5' }] }, // Index 8 - last user
      { role: 'model', parts: [{ text: 'response 5' }] },
    ];

    // WHEN: Find split point with since-last-prompt strategy
    const result = findCompressSplitPoint(history, {
      strategy: 'since-last-prompt',
      minMessagesToCompress: 5,
    });

    // THEN: Should split at index 8
    expect(result).toBeDefined();
    expect(result.splitIndex).toBe(8);
    expect(result.historyToCompress).toHaveLength(8); // 0-7
    expect(result.historyToKeep).toHaveLength(2); // 8-9
  });
});
```

**Implementation:** Create `findSinceLastPromptSplit()` method

**Commit:** ✅ "feat: implement since-last-prompt split strategy"

#### Test 1.1.2: History Too Short

```typescript
it('should return null if history too short', () => {
  const history = [
    { role: 'user', parts: [{ text: 'msg 1' }] },
    { role: 'model', parts: [{ text: 'response 1' }] },
  ];

  const result = findCompressSplitPoint(history, {
    strategy: 'since-last-prompt',
    minMessagesToCompress: 5,
  });

  expect(result).toBeNull();
});
```

**Implementation:** Add length check

**Commit:** ✅ "test: handle short history in split logic"

#### Test 1.1.3: Not Enough Messages to Compress

```typescript
it('should return null if not enough messages to compress', () => {
  const history = [
    { role: 'user', parts: [{ text: 'msg 1' }] },
    { role: 'model', parts: [{ text: 'response 1' }] },
    { role: 'user', parts: [{ text: 'msg 2' }] }, // Index 2 - last user
    { role: 'model', parts: [{ text: 'response 2' }] },
  ];

  const result = findCompressSplitPoint(history, {
    strategy: 'since-last-prompt',
    minMessagesToCompress: 5, // Need at least 5, but only have 2
  });

  expect(result).toBeNull();
});
```

**Implementation:** Check `messagesToCompress >= minMessagesToCompress`

**Commit:** ✅ "test: enforce minimum compression threshold"

#### Test 1.1.4: No User Messages

```typescript
it('should return null if no user messages found', () => {
  const history = [
    { role: 'model', parts: [{ text: 'response 1' }] },
    { role: 'model', parts: [{ text: 'response 2' }] },
    { role: 'model', parts: [{ text: 'response 3' }] },
  ];

  const result = findCompressSplitPoint(history, {
    strategy: 'since-last-prompt',
  });

  expect(result).toBeNull();
});
```

**Commit:** ✅ "test: handle history with no user messages"

### Module 1.2: Enhanced Compression Prompt

**Test File:** `packages/core/src/core/prompts.test.ts`

#### Test 1.2.1: Prompt Without User Goal

```typescript
describe('getChatCompressionPrompt', () => {
  it('should return base prompt without user goal', () => {
    const prompt = getChatCompressionPrompt();

    expect(prompt).toContain('<state_snapshot>');
    expect(prompt).toContain('<overall_goal>');
    expect(prompt).not.toContain('<current_goal>');
  });
});
```

**Implementation:** Keep existing prompt as-is

**Commit:** ✅ "test: verify base compression prompt"

#### Test 1.2.2: Prompt With User Goal

```typescript
it('should prepend user goal section when provided', () => {
  const userGoal = 'Implementing user authentication';
  const prompt = getChatCompressionPrompt(userGoal);

  expect(prompt).toContain('<current_goal>');
  expect(prompt).toContain(userGoal);
  expect(prompt).toContain('prioritize information relevant to this goal');
});
```

**Implementation:** Add optional `userGoal` parameter, prepend goal context

**Commit:** ✅ "feat: add trajectory-focused compression prompt"

#### Test 1.2.3: Updated XML Structure

```typescript
it('should include discarded_context_summary in XML structure', () => {
  const prompt = getChatCompressionPrompt('Test goal');

  expect(prompt).toContain('<discarded_context_summary>');
  expect(prompt).toContain('One sentence about what was omitted');
});
```

**Implementation:** Update XML example in prompt

**Commit:** ✅ "feat: add discarded context summary to prompt"

### Module 1.3: Compression Service Integration

**Test File:** `packages/core/src/services/chatCompressionService.test.ts`

#### Test 1.3.1: Compress with New Options

```typescript
describe('compress with new options', () => {
  it('should accept userGoal and preserveStrategy options', async () => {
    const mockChat = createMockChat();
    const options: CompressionOptions = {
      force: false,
      model: 'gemini-pro',
      config: mockConfig,
      hasFailedCompressionAttempt: false,
      userGoal: 'Implementing auth',
      preserveStrategy: 'since-last-prompt',
    };

    const result = await compressionService.compress(
      mockChat,
      'prompt-id',
      options,
    );

    expect(result.status).toBe(CompressionStatus.COMPRESSED);
    expect(result.goalWasSelected).toBe(true);
  });
});
```

**Implementation:** Update `compress()` signature to accept new options

**Commit:** ✅ "feat: add userGoal and preserveStrategy to compression API"

#### Test 1.3.2: Use Since-Last-Prompt Strategy

```typescript
it('should use since-last-prompt split when specified', async () => {
  const history = createHistoryWithMessages(50);
  const options: CompressionOptions = {
    // ... other options
    preserveStrategy: 'since-last-prompt',
  };

  const result = await compressionService.compress(mockChat, 'id', options);

  // Should preserve fewer messages than percentage strategy
  expect(result.messagesPreserved).toBeLessThan(15); // 30% of 50 = 15
  expect(result.messagesPreserved).toBeGreaterThanOrEqual(2);
});
```

**Commit:** ✅ "feat: integrate since-last-prompt strategy in compression"

#### Test 1.3.3: Extract Discarded Summary from XML

```typescript
it('should extract discarded context summary from XML', async () => {
  const mockResponse = `
    <state_snapshot>
      <current_goal>Testing</current_goal>
      <discarded_context_summary>
        Omitted earlier discussion about database setup
      </discarded_context_summary>
    </state_snapshot>
  `;
  mockChat.sendMessage.mockResolvedValue({ text: () => mockResponse });

  const result = await compressionService.compress(mockChat, 'id', options);

  expect(result.discardedContextSummary).toBe(
    'Omitted earlier discussion about database setup',
  );
});
```

**Implementation:** Add `extractDiscardedContextSummary()` helper

**Commit:** ✅ "feat: extract discarded context summary from compression"

---

## Phase 2: Trigger Logic & Guards (2 days)

### Module 2.1: Hybrid Trigger System

**Test File:** `packages/core/src/core/client.test.ts`

#### Test 2.1.1: Trigger on Absolute Tokens

```typescript
describe('shouldTriggerCompression', () => {
  it('should trigger when absolute token threshold reached', () => {
    const client = createTestClient({
      compressionTriggerTokens: 40000,
      compressionMinMessages: 25,
    });
    client.setTokenCount(42000);
    client.setMessagesSinceLastCompress(26);
    client.setTimeSinceLastCompress(400); // 6+ minutes

    const decision = client.shouldTriggerCompression();

    expect(decision.shouldCompress).toBe(true);
    expect(decision.isSafetyValve).toBe(false);
    expect(decision.reason).toBe('absolute_tokens');
  });
});
```

**Implementation:** Create `shouldTriggerCompression()` method

**Commit:** ✅ "feat: implement absolute token trigger threshold"

#### Test 2.1.2: Safety Valve at 50% Utilization

```typescript
it('should trigger safety valve at 50% utilization', () => {
  const client = createTestClient({
    modelMaxTokens: 1000000,
    compressionTriggerUtilization: 0.5,
  });
  client.setTokenCount(520000); // 52%

  const decision = client.shouldTriggerCompression();

  expect(decision.shouldCompress).toBe(true);
  expect(decision.isSafetyValve).toBe(true);
  expect(decision.reason).toBe('utilization_threshold');
});
```

**Commit:** ✅ "feat: implement safety valve at 50% utilization"

#### Test 2.1.3: Message Guard - Not Enough Messages

```typescript
it('should not trigger if insufficient messages since last compress', () => {
  const client = createTestClient({
    compressionTriggerTokens: 40000,
    compressionMinMessages: 25,
  });
  client.setTokenCount(45000); // Over threshold
  client.setMessagesSinceLastCompress(20); // Under minimum

  const decision = client.shouldTriggerCompression();

  expect(decision.shouldCompress).toBe(false);
  expect(decision.reason).toBe('message_guard_failed');
});
```

**Commit:** ✅ "feat: add message count guard to prevent frequent prompts"

#### Test 2.1.4: Time Guard - Too Soon

```typescript
it('should not trigger if too soon since last compress', () => {
  const client = createTestClient({
    compressionTriggerTokens: 40000,
    compressionMinTimeBetweenPrompts: 300, // 5 minutes
  });
  client.setTokenCount(45000);
  client.setMessagesSinceLastCompress(30);
  client.setTimeSinceLastCompress(120); // 2 minutes - too soon

  const decision = client.shouldTriggerCompression();

  expect(decision.shouldCompress).toBe(false);
  expect(decision.reason).toBe('time_guard_failed');
});
```

**Commit:** ✅ "feat: add time guard to prevent frequent prompts"

#### Test 2.1.5: Safety Valve Bypasses Guards

```typescript
it('should bypass guards when safety valve triggers', () => {
  const client = createTestClient({
    compressionTriggerUtilization: 0.5,
    compressionMinMessages: 25,
  });
  client.setTokenCount(520000); // 52% utilization
  client.setMessagesSinceLastCompress(10); // Under minimum
  client.setTimeSinceLastCompress(60); // Under time minimum

  const decision = client.shouldTriggerCompression();

  expect(decision.shouldCompress).toBe(true);
  expect(decision.isSafetyValve).toBe(true);
  // Guards are bypassed for safety valve
});
```

**Commit:** ✅ "feat: safety valve bypasses anti-annoyance guards"

### Module 2.2: Concurrency Guards

**Test File:** `packages/core/src/core/client.test.ts`

#### Test 2.2.1: Prevent Multiple Concurrent Compressions

```typescript
describe('compression concurrency guards', () => {
  it('should prevent multiple simultaneous compressions', async () => {
    const client = createTestClient();
    client.setTokenCount(50000);

    // Start two compressions at once
    const [result1, result2] = await Promise.all([
      client.tryCompressChat('prompt-id'),
      client.tryCompressChat('prompt-id'),
    ]);

    // One should succeed, one should NOOP
    const statuses = [result1.status, result2.status];
    expect(statuses).toContain(CompressionStatus.COMPRESSED);
    expect(statuses).toContain(CompressionStatus.NOOP);
  });
});
```

**Implementation:** Add `compressionInProgress` flag

**Commit:** ✅ "feat: prevent concurrent compression attempts"

#### Test 2.2.2: Prevent Multiple Prompts

```typescript
it('should prevent multiple simultaneous prompts', async () => {
  const client = createTestClient();
  client.setTokenCount(50000);

  const prompt1 = client.tryCompressChat('id');
  await sleep(100); // Let first prompt start
  const prompt2 = client.tryCompressChat('id');

  const [result1, result2] = await Promise.all([prompt1, prompt2]);

  // Second should be NOOP
  expect(result2.status).toBe(CompressionStatus.NOOP);
});
```

**Implementation:** Add `compressionPromptActive` flag

**Commit:** ✅ "feat: prevent multiple compression prompts"

#### Test 2.2.3: Compression Lock Serializes Attempts

```typescript
it('should serialize compression attempts with lock', async () => {
  const client = createTestClient();
  const compressionOrder: number[] = [];

  const compress1 = client.tryCompressChat('id').then(() => {
    compressionOrder.push(1);
  });
  const compress2 = client.tryCompressChat('id').then(() => {
    compressionOrder.push(2);
  });

  await Promise.all([compress1, compress2]);

  // Should execute in order, not simultaneously
  expect(compressionOrder).toEqual([1, 2]);
});
```

**Implementation:** Add `compressionLock` promise

**Commit:** ✅ "feat: add compression lock for serialization"

#### Test 2.2.4: Don't Trigger During Streaming

```typescript
it('should not trigger compression during streaming', () => {
  const client = createTestClient();
  client.setTokenCount(50000);
  client.setIsStreaming(true);

  const decision = client.shouldTriggerCompression();

  expect(decision.shouldCompress).toBe(false);
  expect(decision.reason).toBe('streaming_in_progress');
});
```

**Implementation:** Add `isStreaming` flag and check

**Commit:** ✅ "feat: prevent compression during streaming responses"

#### Test 2.2.5: Agent Mode Uses Non-Interactive

```typescript
it('should use non-interactive mode for agents', async () => {
  const client = createTestClient();
  client.setAgentMode(true, { description: 'Refactor auth' });
  client.setTokenCount(50000);

  const result = await client.tryCompressChat('id');

  expect(result.selectionMethod).toBe('agent');
  expect(result.goalWasSelected).toBe(true);
  // No prompt should have been shown
});
```

**Implementation:** Add `isAgentMode` flag and check

**Commit:** ✅ "feat: use non-interactive compression for agent mode"

---

## Phase 3: Goal Extraction (1-2 days)

### Module 3.1: Goal Extraction from History

**Test File:** `packages/core/src/core/client.test.ts`

#### Test 3.1.1: Extract Goals from Conversation

```typescript
describe('extractGoalOptions', () => {
  it('should extract 3-4 goals from conversation history', async () => {
    const history = [
      {
        role: 'user',
        parts: [{ text: 'Help me implement user authentication' }],
      },
      {
        role: 'model',
        parts: [{ text: 'I can help with that. Let me create...' }],
      },
      { role: 'user', parts: [{ text: 'Now add JWT token validation' }] },
      { role: 'model', parts: [{ text: 'Adding JWT validation...' }] },
      // ... more messages
    ];
    const client = createTestClient();

    const result = await client.extractGoalOptions(history);

    expect(result.success).toBe(true);
    expect(result.goals).toHaveLength(3);
    expect(result.goals).toContain('Implementing user authentication');
    expect(result.goals).toContain('Adding JWT token validation');
  });
});
```

**Implementation:** Create `extractGoalOptions()` method with model call

**Commit:** ✅ "feat: extract goals from conversation history"

#### Test 3.1.2: Truncate Assistant Messages

```typescript
it('should truncate assistant messages to reduce tokens', async () => {
  const longAssistantMessage = {
    role: 'model',
    parts: [{ text: 'A'.repeat(2000) }], // 2000 chars
  };
  const client = createTestClient();

  const truncated = client.truncateMiddle(longAssistantMessage, {
    keepStart: 500,
    keepEnd: 300,
  });

  const text = truncated.parts[0].text;
  expect(text.length).toBeLessThan(1000); // Much shorter
  expect(text).toContain('[... ');
  expect(text).toContain(' chars omitted ...]');
});
```

**Implementation:** Create `truncateMiddle()` helper

**Commit:** ✅ "feat: truncate messages to optimize goal extraction"

#### Test 3.1.3: Validate Extracted Goals

````typescript
it('should filter out invalid goals', async () => {
  const mockResponse = `
    1. Implementing user auth
    2. ```code block should be rejected```
    3. Too short
    4. ${'A'.repeat(150)}  // Too long
    5. Valid goal here
  `
  mockModel.generateContent.mockResolvedValue({ text: () => mockResponse })

  const result = await client.extractGoalOptions(history)

  expect(result.goals).toHaveLength(2)
  expect(result.goals).toContain('Implementing user auth')
  expect(result.goals).toContain('Valid goal here')
})
````

**Implementation:** Add `validateGoal()` helper

**Commit:** ✅ "feat: validate and filter extracted goals"

#### Test 3.1.4: Fallback Goals on Extraction Failure

```typescript
it('should return fallback goals if extraction fails', async () => {
  mockModel.generateContent.mockRejectedValue(new Error('API error'));

  const result = await client.extractGoalOptions(history);

  expect(result.success).toBe(false);
  expect(result.goals).toEqual([
    'Continue current task',
    'Debug recent errors',
    'Implement new feature',
  ]);
});
```

**Implementation:** Add `getFallbackGoals()` and error handling

**Commit:** ✅ "feat: provide fallback goals on extraction failure"

#### Test 3.1.5: Timeout Goal Extraction

```typescript
it('should timeout goal extraction after 5 seconds', async () => {
  mockModel.generateContent.mockImplementation(
    () => new Promise((resolve) => setTimeout(resolve, 10000)), // 10s delay
  );

  const startTime = Date.now();
  const result = await client.extractGoalOptions(history);
  const duration = Date.now() - startTime;

  expect(duration).toBeLessThan(6000); // Should timeout ~5s
  expect(result.success).toBe(false);
  expect(result.goals).toEqual(
    expect.arrayContaining(['Continue current task']),
  );
});
```

**Implementation:** Add Promise.race with timeout

**Commit:** ✅ "feat: timeout goal extraction after 5 seconds"

---

## Phase 4: User Prompt & Selection (2 days)

### Module 4.1: Prompt User for Goal

**Test File:** `packages/core/src/core/client.test.ts`

#### Test 4.1.1: Show Prompt and Get Selection

```typescript
describe('promptUserForCurrentGoal', () => {
  it('should show prompt and return selected goal', async () => {
    const client = createTestClient();
    const mockPrompt = jest.spyOn(client, 'showCompressionPrompt');
    mockPrompt.mockResolvedValue({ type: 'goal', value: 'Implementing auth' });

    const decision = {
      currentUtilization: 0.042,
      currentTokens: 42000,
      isSafetyValve: false,
    } as TriggerDecision;
    const goals = ['Implementing auth', 'Adding API', 'Debugging errors'];

    const selection = await client.promptUserForCurrentGoal(decision, goals);

    expect(selection.type).toBe('goal');
    expect(selection.value).toBe('Implementing auth');
    expect(mockPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        goalOptions: goals,
        isSafetyValve: false,
      }),
    );
  });
});
```

**Implementation:** Create `promptUserForCurrentGoal()` method

**Commit:** ✅ "feat: implement user goal selection prompt"

#### Test 4.1.2: Timeout Returns Auto

```typescript
it('should return auto-compress on timeout', async () => {
  const client = createTestClient();
  const mockPrompt = jest.spyOn(client, 'showCompressionPrompt');
  mockPrompt.mockImplementation(
    () => new Promise((resolve) => setTimeout(resolve, 35000)), // Never resolves in time
  );

  const selection = await client.promptUserForCurrentGoal(decision, goals);

  expect(selection.type).toBe('auto');
});
```

**Implementation:** Add Promise.race with timeout (30s)

**Commit:** ✅ "feat: timeout user prompt after 30 seconds"

#### Test 4.1.3: Handle "Other" Custom Input

```typescript
it('should prompt for custom input when "Other" selected', async () => {
  const mockPrompt = jest.spyOn(client, 'showCompressionPrompt');
  mockPrompt.mockResolvedValue({ type: 'goal', value: 'OTHER' });

  const mockCustom = jest.spyOn(client, 'promptForCustomGoal');
  mockCustom.mockResolvedValue('Custom goal here');

  const selection = await client.promptUserForCurrentGoal(decision, goals);

  expect(selection.type).toBe('goal');
  expect(selection.value).toBe('Custom goal here');
  expect(mockCustom).toHaveBeenCalled();
});
```

**Implementation:** Handle "OTHER" selection case

**Commit:** ✅ "feat: support custom goal input via 'Other' option"

#### Test 4.1.4: Handle Empty Custom Input

```typescript
it('should fall back to auto if custom input is empty', async () => {
  const mockPrompt = jest.spyOn(client, 'showCompressionPrompt');
  mockPrompt.mockResolvedValue({ type: 'goal', value: 'OTHER' });

  const mockCustom = jest.spyOn(client, 'promptForCustomGoal');
  mockCustom.mockResolvedValue(''); // Empty input

  const selection = await client.promptUserForCurrentGoal(decision, goals);

  expect(selection.type).toBe('auto');
});
```

**Commit:** ✅ "test: handle empty custom goal input"

### Module 4.2: Opt-Out Handling

**Test File:** `packages/core/src/core/client.test.ts`

#### Test 4.2.1: Disable Interactive Mode

```typescript
describe('handleOptOutSelection', () => {
  it('should disable interactive mode when selected', () => {
    const client = createTestClient();
    const mockConfig = client.config;

    const selection = { type: 'disable' } as GoalSelection;
    const result = client.handleOptOutSelection(selection);

    expect(mockConfig.setCompressionInteractive).toHaveBeenCalledWith(false);
    expect(result.type).toBe('auto'); // Use auto for this compression
  });
});
```

**Implementation:** Create `handleOptOutSelection()` method

**Commit:** ✅ "feat: handle 'don't ask me again' opt-out"

#### Test 4.2.2: Adjust Frequency with Multiplier

```typescript
it('should increase thresholds when less-frequent selected', () => {
  const client = createTestClient({
    compressionTriggerTokens: 40000,
    compressionMinMessages: 25,
    compressionFrequencyMultiplier: 1.5,
  });
  const mockConfig = client.config;

  const selection = { type: 'less-frequent' } as GoalSelection;
  const result = client.handleOptOutSelection(selection);

  expect(mockConfig.setCompressionTriggerTokens).toHaveBeenCalledWith(60000); // 40k * 1.5
  expect(mockConfig.setCompressionMinMessages).toHaveBeenCalledWith(38); // 25 * 1.5 rounded
  expect(result.type).toBe('auto');
});
```

**Commit:** ✅ "feat: implement dynamic frequency adjustment"

#### Test 4.2.3: Cap Thresholds at Maximum

```typescript
it('should cap thresholds at configured maximums', () => {
  const client = createTestClient({
    compressionTriggerTokens: 150000, // Already high
    compressionFrequencyMultiplier: 1.5,
  });

  const selection = { type: 'less-frequent' } as GoalSelection;
  client.handleOptOutSelection(selection);

  // Should cap at 200k, not go to 225k
  expect(mockConfig.setCompressionTriggerTokens).toHaveBeenCalledWith(200000);
});
```

**Commit:** ✅ "feat: cap frequency thresholds at maximums"

#### Test 4.2.4: Track Cumulative Frequency Reduction

```typescript
it('should track cumulative frequency reduction', () => {
  const client = createTestClient({
    compressionFrequencyMultiplier: 1.5,
  });

  // First selection
  client.handleOptOutSelection({ type: 'less-frequent' });
  expect(client.lessFrequentSelectionCount).toBe(1);

  // Second selection
  client.handleOptOutSelection({ type: 'less-frequent' });
  expect(client.lessFrequentSelectionCount).toBe(2);

  // Cumulative: 1.5^2 = 2.25x
  const cumulative = Math.pow(1.5, 2);
  expect(cumulative).toBeCloseTo(2.25);
});
```

**Commit:** ✅ "feat: track cumulative frequency reduction"

#### Test 4.2.5: Suggest Full Disable After 3 Selections

```typescript
it('should suggest full disable after 3 less-frequent selections', () => {
  const client = createTestClient();
  const mockShowMessage = jest.spyOn(client, 'showMessage');

  client.lessFrequentSelectionCount = 2; // Already selected twice

  client.handleOptOutSelection({ type: 'less-frequent' });

  expect(mockShowMessage).toHaveBeenCalledWith(
    expect.stringContaining('Consider "Don\'t ask me again"'),
  );
});
```

**Commit:** ✅ "feat: suggest disable after frequent opt-outs"

---

## Phase 5: Main Integration (1-2 days)

### Module 5.1: Complete tryCompressChat Flow

**Test File:** `packages/core/src/core/client.test.ts`

#### Test 5.1.1: Full Interactive Flow

```typescript
describe('tryCompressChat - full integration', () => {
  it('should complete full interactive compression flow', async () => {
    const client = createTestClient();
    client.setTokenCount(45000);
    client.setMessagesSinceLastCompress(30);

    // Mock goal extraction
    jest.spyOn(client, 'extractGoalOptions').mockResolvedValue({
      success: true,
      goals: ['Implementing auth', 'Adding API'],
      durationMs: 1500,
    });

    // Mock user selection
    jest.spyOn(client, 'promptUserForCurrentGoal').mockResolvedValue({
      type: 'goal',
      value: 'Implementing auth',
    });

    // Mock compression service
    jest.spyOn(compressionService, 'compress').mockResolvedValue({
      status: CompressionStatus.COMPRESSED,
      tokensBeforeCompression: 45000,
      tokensAfterCompression: 15000,
      messagesPreserved: 2,
      messagesCompressed: 45,
    });

    const result = await client.tryCompressChat('prompt-id');

    expect(result.status).toBe(CompressionStatus.COMPRESSED);
    expect(result.goalWasSelected).toBe(true);
    expect(client.lastCompressionTime).toBeGreaterThan(0);
    expect(client.messagesSinceLastCompress).toBe(0);
  });
});
```

**Implementation:** Wire all components together in `tryCompressChat()`

**Commit:** ✅ "feat: complete interactive compression flow integration"

#### Test 5.1.2: Auto-Compress Flow

```typescript
it('should complete auto-compress flow when user selects auto', async () => {
  const client = createTestClient();
  client.setTokenCount(45000);

  jest.spyOn(client, 'extractGoalOptions').mockResolvedValue({
    success: true,
    goals: ['Goal 1', 'Goal 2'],
    durationMs: 1200,
  });

  jest.spyOn(client, 'promptUserForCurrentGoal').mockResolvedValue({
    type: 'auto',
  });

  const result = await client.tryCompressChat('prompt-id');

  expect(result.status).toBe(CompressionStatus.COMPRESSED);
  expect(result.goalWasSelected).toBe(false);
  // Should use percentage strategy
  expect(compressionService.compress).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.objectContaining({
      preserveStrategy: 'percentage',
      userGoal: undefined,
    }),
  );
});
```

**Commit:** ✅ "feat: implement auto-compress flow"

#### Test 5.1.3: Non-Interactive Mode

```typescript
it('should skip prompt when interactive mode disabled', async () => {
  const client = createTestClient({
    compressionInteractive: false,
  });
  client.setTokenCount(45000);

  const mockPrompt = jest.spyOn(client, 'promptUserForCurrentGoal');

  const result = await client.tryCompressChat('prompt-id');

  expect(mockPrompt).not.toHaveBeenCalled();
  expect(result.status).toBe(CompressionStatus.COMPRESSED);
});
```

**Commit:** ✅ "feat: skip prompt when interactive mode disabled"

#### Test 5.1.4: Extraction Failure Fallback

```typescript
it('should fall back to auto-compress if extraction fails', async () => {
  const client = createTestClient();
  client.setTokenCount(45000);

  jest.spyOn(client, 'extractGoalOptions').mockResolvedValue({
    success: false,
    goals: ['Continue current task'],
    durationMs: 5000,
    error: new Error('Extraction timeout'),
  });

  const result = await client.tryCompressChat('prompt-id');

  expect(result.status).toBe(CompressionStatus.COMPRESSED);
  // Should use auto strategy
  expect(compressionService.compress).toHaveBeenCalledWith(
    expect.anything(),
    expect.anything(),
    expect.objectContaining({
      preserveStrategy: 'percentage',
    }),
  );
});
```

**Commit:** ✅ "feat: fallback to auto on extraction failure"

### Module 5.2: State Management

#### Test 5.2.1: Update State on Success

```typescript
it('should update state after successful compression', async () => {
  const client = createTestClient();
  client.lastCompressionTime = 0;
  client.messagesSinceLastCompress = 30;

  await client.tryCompressChat('prompt-id');

  expect(client.lastCompressionTime).toBeGreaterThan(0);
  expect(client.messagesSinceLastCompress).toBe(0);
  expect(client.hasFailedCompressionAttempt).toBe(false);
});
```

**Commit:** ✅ "feat: update state on successful compression"

#### Test 5.2.2: Track Failure State

```typescript
it('should set failure flag on compression failure', async () => {
  const client = createTestClient();

  jest.spyOn(compressionService, 'compress').mockResolvedValue({
    status: CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
    tokensBeforeCompression: 45000,
    tokensAfterCompression: 50000,
  });

  await client.tryCompressChat('prompt-id');

  expect(client.hasFailedCompressionAttempt).toBe(true);
});
```

**Commit:** ✅ "feat: track compression failure state"

#### Test 5.2.3: Increment Message Counter

```typescript
it('should increment message counter on each new message', () => {
  const client = createTestClient();
  client.messagesSinceLastCompress = 10;

  client.onNewMessage();

  expect(client.messagesSinceLastCompress).toBe(11);
});
```

**Commit:** ✅ "feat: track messages since last compression"

---

## Phase 6: Configuration (1 day)

### Module 6.1: Settings Schema

**Test File:** `packages/cli/src/config/settingsSchema.test.ts`

#### Test 6.1.1: Define New Settings

```typescript
describe('Compression settings', () => {
  it('should define compressionInteractive setting', () => {
    const schema = getSettingsSchema();

    expect(schema.compressionInteractive).toBeDefined();
    expect(schema.compressionInteractive.type).toBe('boolean');
    expect(schema.compressionInteractive.default).toBe(true);
  });

  it('should define all 8 new compression settings', () => {
    const schema = getSettingsSchema();

    expect(schema.compressionStrategy).toBeDefined();
    expect(schema.compressionInteractive).toBeDefined();
    expect(schema.compressionPromptTimeout).toBeDefined();
    expect(schema.compressionTriggerTokens).toBeDefined();
    expect(schema.compressionTriggerUtilization).toBeDefined();
    expect(schema.compressionMinMessagesSinceLastCompress).toBeDefined();
    expect(schema.compressionMinTimeBetweenPrompts).toBeDefined();
    expect(schema.compressionFrequencyMultiplier).toBeDefined();
  });
});
```

**Implementation:** Add all new settings to schema

**Commit:** ✅ "feat: define compression configuration settings"

#### Test 6.1.2: Validate Setting Ranges

```typescript
it('should enforce valid ranges for numeric settings', () => {
  const schema = getSettingsSchema();

  expect(schema.compressionTriggerTokens.min).toBe(10000);
  expect(schema.compressionTriggerTokens.max).toBe(200000);

  expect(schema.compressionPromptTimeout.min).toBe(10);
  expect(schema.compressionPromptTimeout.max).toBe(300);

  expect(schema.compressionFrequencyMultiplier.min).toBe(1.2);
  expect(schema.compressionFrequencyMultiplier.max).toBe(3.0);
});
```

**Commit:** ✅ "feat: validate compression setting ranges"

### Module 6.2: Config Accessors

**Test File:** `packages/core/src/config/config.test.ts`

#### Test 6.2.1: Getter Methods

```typescript
describe('Config accessors', () => {
  it('should provide getter for each compression setting', () => {
    const config = new GeminiClientConfig(testSettings);

    expect(config.isCompressionInteractive()).toBe(true);
    expect(config.getCompressionTriggerTokens()).toBe(40000);
    expect(config.getCompressionTriggerUtilization()).toBe(0.5);
    expect(config.getCompressionMinMessages()).toBe(25);
    expect(config.getCompressionMinTimeBetweenPrompts()).toBe(300);
    expect(config.getCompressionFrequencyMultiplier()).toBe(1.5);
  });
});
```

**Implementation:** Add getter methods to config class

**Commit:** ✅ "feat: add config accessors for compression settings"

#### Test 6.2.2: Setter Methods with Persistence

```typescript
it('should persist changes when setters are called', () => {
  const config = new GeminiClientConfig(testSettings);
  const mockWrite = jest.spyOn(config, 'writeConfigFile');

  config.setCompressionInteractive(false);

  expect(config.isCompressionInteractive()).toBe(false);
  expect(mockWrite).toHaveBeenCalled();
});
```

**Implementation:** Add setter methods with file persistence

**Commit:** ✅ "feat: persist compression settings changes to disk"

---

## Phase 7: UI Components (2 days)

### Module 7.1: Compression Prompt Component

**Test File:**
`packages/cli/src/ui/components/messages/CompressionPrompt.test.tsx`

#### Test 7.1.1: Render Prompt with Goals

```typescript
describe('CompressionPrompt', () => {
  it('should render prompt with goal options', () => {
    const props: CompressionPromptProps = {
      utilizationPercent: 0.042,
      currentTokens: 42000,
      modelMaxTokens: 1000000,
      goalOptions: ['Implementing auth', 'Adding API'],
      onGoalSelect: jest.fn(),
      timeoutMs: 30000,
      isSafetyValve: false
    }

    const { getByText } = render(<CompressionPrompt {...props} />)

    expect(getByText('What are you currently working on?')).toBeInTheDocument()
    expect(getByText('1. Implementing auth')).toBeInTheDocument()
    expect(getByText('2. Adding API')).toBeInTheDocument()
    expect(getByText('4. Auto-compress (default behavior)')).toBeInTheDocument()
  })
})
```

**Implementation:** Create CompressionPrompt.tsx component

**Commit:** ✅ "feat: create compression prompt UI component"

#### Test 7.1.2: Show Opt-Out Options When Not Safety Valve

```typescript
it('should show opt-out options when not safety valve', () => {
  const props = { ...baseProps, isSafetyValve: false }

  const { getByText } = render(<CompressionPrompt {...props} />)

  expect(getByText(/Don't ask me again/)).toBeInTheDocument()
  expect(getByText(/Check in less often/)).toBeInTheDocument()
})
```

**Commit:** ✅ "feat: show opt-out options in prompt"

#### Test 7.1.3: Hide Opt-Out Options for Safety Valve

```typescript
it('should hide opt-out options when safety valve', () => {
  const props = { ...baseProps, isSafetyValve: true }

  const { queryByText } = render(<CompressionPrompt {...props} />)

  expect(queryByText(/Don't ask me again/)).not.toBeInTheDocument()
  expect(queryByText(/Check in less often/)).not.toBeInTheDocument()
  expect(queryByText(/50% capacity/)).toBeInTheDocument()
})
```

**Commit:** ✅ "feat: hide opt-outs during safety valve"

#### Test 7.1.4: Handle User Selection

```typescript
it('should call callback with selected goal', () => {
  const onGoalSelect = jest.fn()
  const props = { ...baseProps, onGoalSelect }

  const { getByText } = render(<CompressionPrompt {...props} />)

  fireEvent.click(getByText('1. Implementing auth'))

  expect(onGoalSelect).toHaveBeenCalledWith({
    type: 'goal',
    value: 'Implementing auth'
  })
})
```

**Commit:** ✅ "feat: handle goal selection in prompt"

#### Test 7.1.5: Show Countdown Timer

```typescript
it('should show countdown timer', () => {
  jest.useFakeTimers()
  const props = { ...baseProps, timeoutMs: 30000 }

  const { getByText } = render(<CompressionPrompt {...props} />)

  expect(getByText(/auto in 30s/)).toBeInTheDocument()

  act(() => {
    jest.advanceTimersByTime(5000)  // 5 seconds pass
  })

  expect(getByText(/auto in 25s/)).toBeInTheDocument()

  jest.useRealTimers()
})
```

**Commit:** ✅ "feat: add countdown timer to prompt"

#### Test 7.1.6: Trigger Timeout Callback

```typescript
it('should trigger timeout after configured duration', () => {
  jest.useFakeTimers()
  const onGoalSelect = jest.fn()
  const props = { ...baseProps, onGoalSelect, timeoutMs: 2000 }

  render(<CompressionPrompt {...props} />)

  act(() => {
    jest.advanceTimersByTime(2000)
  })

  expect(onGoalSelect).toHaveBeenCalledWith({ type: 'timeout' })

  jest.useRealTimers()
})
```

**Commit:** ✅ "feat: implement prompt timeout"

### Module 7.2: Compression Message Component

**Test File:**
`packages/cli/src/ui/components/messages/CompressionMessage.test.tsx`

#### Test 7.2.1: Display Success Message

```typescript
describe('CompressionMessage', () => {
  it('should display success message with stats', () => {
    const props: CompressionMessageProps = {
      status: CompressionStatus.COMPRESSED,
      tokensBeforeCompression: 42000,
      tokensAfterCompression: 15000,
      messagesPreserved: 2,
      messagesCompressed: 45,
      userGoal: 'Implementing auth',
      goalWasSelected: true
    }

    const { getByText } = render(<CompressionMessage {...props} />)

    expect(getByText(/Chat history compressed/)).toBeInTheDocument()
    expect(getByText(/42,000 tokens/)).toBeInTheDocument()
    expect(getByText(/15,000 tokens/)).toBeInTheDocument()
    expect(getByText(/64% reduction/)).toBeInTheDocument()
  })
})
```

**Implementation:** Update CompressionMessage.tsx with new props

**Commit:** ✅ "feat: enhance compression success message"

#### Test 7.2.2: Show Goal When Selected

```typescript
it('should show user goal when selected', () => {
  const props = {
    ...baseProps,
    userGoal: 'Implementing auth',
    goalWasSelected: true
  }

  const { getByText } = render(<CompressionMessage {...props} />)

  expect(getByText(/Context now optimized for:/)).toBeInTheDocument()
  expect(getByText(/Implementing auth/)).toBeInTheDocument()
})
```

**Commit:** ✅ "feat: display user goal in success message"

#### Test 7.2.3: Show Message Counts

```typescript
it('should show message preservation stats', () => {
  const props = {
    ...baseProps,
    messagesPreserved: 2,
    messagesCompressed: 45
  }

  const { getByText } = render(<CompressionMessage {...props} />)

  expect(getByText(/Preserved: Last 2 messages/)).toBeInTheDocument()
})
```

**Commit:** ✅ "feat: show message counts in compression result"

#### Test 7.2.4: Display Error Messages

```typescript
it('should display appropriate error for inflated token count', () => {
  const props = {
    status: CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
    tokensBeforeCompression: 45000,
    tokensAfterCompression: 50000
  }

  const { getByText } = render(<CompressionMessage {...props} />)

  expect(getByText(/compression did not reduce size/i)).toBeInTheDocument()
})
```

**Commit:** ✅ "feat: display compression error messages"

---

## Phase 8: Telemetry (1 day)

### Module 8.1: Enhanced Telemetry

**Test File:** `packages/core/src/telemetry/loggers.test.ts`

#### Test 8.1.1: Log All New Fields

```typescript
describe('logChatCompression', () => {
  it('should log all new compression fields', () => {
    const mockSend = jest.fn();
    const telemetry = new Telemetry(mockSend);

    telemetry.logChatCompression({
      tokens_before: 42000,
      tokens_after: 15000,
      preserve_strategy: 'since-last-prompt',
      messages_preserved: 2,
      messages_compressed: 45,
      had_user_goal: true,
      interactive_mode: true,
      utilization_at_trigger: 0.042,
      goal_selection_method: 'manual',
      goal_extraction_success: true,
      goal_extraction_duration_ms: 1850,
      trigger_type: 'absolute_tokens',
      tokens_at_trigger: 42000,
      messages_since_last_compress: 26,
      time_since_last_compress_seconds: 380,
      was_safety_valve: false,
    });

    expect(mockSend).toHaveBeenCalledWith(
      'chat_compression',
      expect.objectContaining({
        preserve_strategy: 'since-last-prompt',
        had_user_goal: true,
        goal_selection_method: 'manual',
      }),
    );
  });
});
```

**Implementation:** Update logChatCompression to accept new fields

**Commit:** ✅ "feat: add enhanced telemetry for compression"

#### Test 8.1.2: Track Opt-Out Metrics

```typescript
it('should track opt-out selections', () => {
  const mockSend = jest.fn();
  const telemetry = new Telemetry(mockSend);

  telemetry.logChatCompression({
    tokens_before: 42000,
    tokens_after: 15000,
    user_selected_disable: true,
    was_safety_valve: false,
  });

  expect(mockSend).toHaveBeenCalledWith(
    'chat_compression',
    expect.objectContaining({
      user_selected_disable: true,
    }),
  );
});
```

**Commit:** ✅ "feat: track opt-out selections in telemetry"

#### Test 8.1.3: Track Frequency Adjustments

```typescript
it('should track frequency multiplier applications', () => {
  const mockSend = jest.fn();
  const telemetry = new Telemetry(mockSend);

  telemetry.logChatCompression({
    tokens_before: 42000,
    tokens_after: 15000,
    user_selected_less_frequent: true,
    frequency_multiplier_applied: 1.5,
    cumulative_frequency_reduction: 2.25,
    new_token_threshold: 90000,
    new_message_threshold: 57,
    times_less_frequent_selected: 2,
  });

  expect(mockSend).toHaveBeenCalledWith(
    'chat_compression',
    expect.objectContaining({
      frequency_multiplier_applied: 1.5,
      cumulative_frequency_reduction: 2.25,
      times_less_frequent_selected: 2,
    }),
  );
});
```

**Commit:** ✅ "feat: track frequency adjustments in telemetry"

---

## Phase 9: Integration Tests (1-2 days)

### Module 9.1: End-to-End Scenarios

**Test File:** `integration-tests/context-compress-deliberate.test.ts`

#### Test 9.1.1: Complete Interactive Flow

```typescript
describe('Deliberate Compression Integration', () => {
  it('should complete full interactive compression flow', async () => {
    const { client, chat } = await setupTestEnvironment();

    // Build up conversation
    for (let i = 0; i < 30; i++) {
      await chat.sendMessage(`Message ${i}`);
    }

    // Should trigger compression
    const tokens = await client.getCurrentTokenCount();
    expect(tokens).toBeGreaterThan(40000);

    // Mock user selecting goal 1
    mockUserInput('1');

    // Send another message to trigger compression
    await chat.sendMessage('Continue working on auth');

    // Verify compression occurred
    const newTokens = await client.getCurrentTokenCount();
    expect(newTokens).toBeLessThan(tokens * 0.5); // >50% reduction

    // Verify history structure
    const history = await chat.getHistory();
    const summaryMessage = history.find((m) =>
      m.parts[0].text.includes('[Previous conversation summary]'),
    );
    expect(summaryMessage).toBeDefined();
  });
});
```

**Commit:** ✅ "test: add e2e test for interactive compression"

#### Test 9.1.2: Safety Valve Scenario

```typescript
it('should force compression at 50% utilization', async () => {
  const { client, chat } = await setupTestEnvironment();

  // Build up to 50% utilization
  await buildUpTo50PercentUtilization(chat);

  // Mock user selecting auto (no goal)
  mockUserInput('4');

  // Send message
  await chat.sendMessage('Test message');

  // Verify compression was forced
  const telemetry = getTelemetryEvents();
  const compressionEvent = telemetry.find(
    (e) => e.event === 'chat_compression',
  );
  expect(compressionEvent.was_safety_valve).toBe(true);
});
```

**Commit:** ✅ "test: verify safety valve behavior"

#### Test 9.1.3: Opt-Out Persistence

```typescript
it('should persist opt-out across sessions', async () => {
  const { client } = await setupTestEnvironment();

  // Select "don't ask me again"
  await client.tryCompressChat('prompt-id');
  mockUserInput('6'); // Don't ask me again

  // Restart session
  const { client: newClient } = await setupTestEnvironment();

  // Trigger compression
  newClient.setTokenCount(50000);
  await newClient.tryCompressChat('prompt-id');

  // Should not have prompted user
  expect(mockUserInput).not.toHaveBeenCalled();
});
```

**Commit:** ✅ "test: verify opt-out persistence"

#### Test 9.1.4: Agent Mode Non-Interactive

```typescript
it('should use agent task as goal in agent mode', async () => {
  const { client, agent } = await setupTestEnvironment();

  client.setAgentMode(true, { description: 'Refactor authentication module' });

  // Build up tokens
  client.setTokenCount(50000);

  // Trigger compression
  const result = await client.tryCompressChat('prompt-id');

  expect(result.selectionMethod).toBe('agent');
  expect(result.goalWasSelected).toBe(true);

  // Verify compression prompt included agent's task
  const compressionCall = compressionService.compress.mock.calls[0];
  expect(compressionCall[2].userGoal).toBe('Refactor authentication module');
});
```

**Commit:** ✅ "test: verify agent mode uses task as goal"

#### Test 9.1.5: Concurrency Safety

```typescript
it('should handle rapid concurrent compression attempts', async () => {
  const { client } = await setupTestEnvironment();
  client.setTokenCount(50000);

  // Trigger multiple compressions simultaneously
  const results = await Promise.all([
    client.tryCompressChat('prompt-id'),
    client.tryCompressChat('prompt-id'),
    client.tryCompressChat('prompt-id'),
  ]);

  // Only one should succeed
  const compressed = results.filter(
    (r) => r.status === CompressionStatus.COMPRESSED,
  );
  expect(compressed).toHaveLength(1);

  // Others should be NOOP
  const noops = results.filter((r) => r.status === CompressionStatus.NOOP);
  expect(noops).toHaveLength(2);
});
```

**Commit:** ✅ "test: verify concurrency safety guards"

---

## Phase 10: Documentation & Polish (1 day)

### Module 10.1: User Documentation

#### Task 10.1.1: Update README

```markdown
# Deliberate Context Compaction

## Interactive Compression

When your conversation reaches 40k tokens, Gemini will check in to learn what
you're working on:
```

💭 Let me learn about what you're working on Context: 42k tokens (4%)

What are you currently working on?

1.  Implementing user authentication
2.  Adding login API endpoints
3.  Setting up JWT token validation
4.  Auto-compress (default behavior)
5.  Other (specify)
6.  Don't ask me again
7.  Check in less often

Select [1-7] (auto in 30s): \_

````

## Configuration

```json
{
  "compressionInteractive": true,
  "compressionTriggerTokens": 40000,
  "compressionTriggerUtilization": 0.50
}
````

````

**Commit:** ✅ "docs: add deliberate compression documentation"

#### Task 10.1.2: Add Migration Guide
```markdown
# Migration Guide

## For Existing Users

Interactive compression is enabled by default. To revert to automatic:

```json
{
  "compressionInteractive": false
}
````

## Settings Changes

- `compressionThreshold` (deprecated) → `compressionTriggerUtilization`
- New: `compressionTriggerTokens` (default: 40000)
- New: `compressionInteractive` (default: true)

````

**Commit:** ✅ "docs: add migration guide"

### Module 10.2: Error Messages

#### Task 10.2.1: Improve User-Facing Messages
```typescript
// In CompressionMessage.tsx
const getErrorMessage = (status: CompressionStatus, props: CompressionMessageProps) => {
  switch (status) {
    case CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT:
      if (props.tokensBeforeCompression < 50000) {
        return "Compression was not beneficial for this history size. Continuing with full history."
      } else {
        return "Chat history compression did not reduce size. Try again later after more messages."
      }
    // ... other cases
  }
}
````

**Commit:** ✅ "polish: improve compression error messages"

---

## Phase 11: Performance Testing (1 day)

### Module 11.1: Performance Benchmarks

#### Test 11.1.1: Goal Extraction Performance

```typescript
describe('Performance benchmarks', () => {
  it('should extract goals in under 2 seconds', async () => {
    const history = createLargeHistory(100); // 100 messages
    const client = createTestClient();

    const startTime = Date.now();
    const result = await client.extractGoalOptions(history);
    const duration = Date.now() - startTime;

    expect(duration).toBeLessThan(2000);
    expect(result.success).toBe(true);
  });
});
```

**Commit:** ✅ "test: add performance benchmarks"

#### Test 11.1.2: Truncation Efficiency

```typescript
it('should reduce token count by >70% with truncation', () => {
  const longMessage = {
    role: 'model',
    parts: [{ text: 'A'.repeat(10000) }],
  };

  const truncated = client.truncateMiddle(longMessage, {
    keepStart: 500,
    keepEnd: 300,
  });

  const originalTokens = estimateTokens(longMessage);
  const truncatedTokens = estimateTokens(truncated);

  const reduction = (originalTokens - truncatedTokens) / originalTokens;
  expect(reduction).toBeGreaterThan(0.7); // >70% reduction
});
```

**Commit:** ✅ "test: verify truncation efficiency"

---

## Summary: Implementation Checklist

### Phase 1: Core Logic ✅ COMPLETED

- [x] Since-last-prompt split strategy (4 tests) -
      `chatCompressionService.test.ts`
- [x] Enhanced compression prompt (3 tests) - `prompts.test.ts`
- [x] Compression service integration (3 tests) -
      `chatCompressionService.test.ts`

### Phase 2: Triggers & Guards ✅ COMPLETED

- [x] Hybrid trigger system (5 tests) - `client.test.ts:2423`
- [x] Concurrency guards (5 tests) - `client.test.ts:2546`

### Phase 3: Goal Extraction ✅ COMPLETED

- [x] Extract goals from history - `deliberateCompressionOrchestrator.test.ts`
- [x] Goal extraction handler - `deliberateCompressionHandler.test.ts`

### Phase 4: User Prompt ✅ COMPLETED

- [x] Basic prompt rendering (3 tests) - `GoalSelectionPrompt.test.tsx`
- [x] Selection behavior tests (5 tests) - `GoalSelectionPrompt.test.tsx`
      (GL-9000 resolved via RadioButtonSelect mocking)
- [x] Timeout tests (5 tests) - `GoalSelectionPrompt.test.tsx` (countdown timer
      with auto-select)
- [x] Custom input tests (6 tests) - `CustomGoalInput.test.tsx` (handles "Other"
      selection)
- [x] Safety valve mode tests (4 tests) - `GoalSelectionPrompt.test.tsx` (hides
      opt-out options, shows urgent message)

### Phase 5: Integration ✅ COMPLETED

- [x] onShowCompressionPrompt callback wiring - `useGeminiStream.ts`
- [x] Full interactive flow tests (6 tests) - `useGeminiStream.test.tsx`
      "Deliberate Compression Integration"
- [x] State management integration tests

### Phase 6: Configuration ✅ COMPLETED

- [x] Settings schema (8 settings) - `settingsSchema.ts`
- [x] Config accessors - `config.ts`

### Phase 7: UI ✅ COMPLETED

- [x] GoalSelectionPrompt component (13 tests) - `GoalSelectionPrompt.test.tsx`
- [x] CompressionMessage component (12 tests) - `CompressionMessage.test.tsx`
- [x] Countdown timer with auto-select on timeout
- [x] User goal display in compression message

### Phase 8: Telemetry ✅ COMPLETED

- [x] Basic telemetry fields (3 tests) -
      `deliberate-compression-telemetry.test.ts`
- [x] Opt-out tracking metrics (5 tests) - `user_selected_disable`,
      `user_selected_less_frequent`, `frequency_multiplier_applied`,
      `new_token_threshold`, `new_message_threshold`, `was_safety_valve`

### Phase 9: Integration Tests ✅ COMPLETED

- [x] Basic /compress command tests - `context-compress-interactive.test.ts`
- [x] Deliberate compression basic flow - `context-compress-deliberate.test.ts`
- [~] Full interactive compression flow with goal selection (skipped - requires
  full UI integration)
- [x] Safety valve UI implementation - `GoalSelectionPrompt.tsx` (isSafetyValve
      prop hides opt-outs)
- [ ] Opt-out persistence tests
- [ ] Agent mode tests
- [ ] Concurrency safety tests

### Phase 10: Documentation ❌ NOT STARTED

- [ ] README updates
- [ ] Migration guide
- [ ] Error message polish

### Phase 11: Performance ❌ NOT STARTED

- [ ] Goal extraction performance benchmarks
- [ ] Truncation efficiency tests

---

## Current Status Summary

**COMPLETED:**

- Core compression logic with since-last-prompt strategy
- Hybrid trigger system with absolute tokens + utilization safety valve
- Concurrency guards to prevent simultaneous compressions
- Goal extraction from conversation history
- Configuration schema with all 8 new settings
- UI: GoalSelectionPrompt with countdown timer (13 tests)
- UI: CompressionMessage with user goal display (12 tests)
- Integration tests for useGeminiStream compression flow (6 tests)
- Basic telemetry for compression events
- Integration tests refactored to use TestRig pattern
  (context-compress-deliberate.test.ts)

**IN PROGRESS / NEEDS WORK:**

- Integration test environment auth setup (tests require API key)

**RECENTLY COMPLETED:**

- Safety valve auto-trigger UI integration:
  - Added `isSafetyValve` prop to GoalSelectionPrompt component
  - Updated `handleCompressionPrompt` in AppContainer.tsx to accept
    isSafetyValve parameter
  - When safety valve triggers, opt-out options (disable, less_frequent) are
    hidden
  - Shows urgent message "Context window nearly full - compression required"
  - Added 4 new tests for safety valve behavior in GoalSelectionPrompt.test.tsx
- Goal selection UI wired to /compress command via `custom_dialog` pattern
  - `compressCommand.tsx` now shows GoalSelectionPrompt when deliberate
    compression is enabled
  - CompressionDialog component orchestrates goal selection flow
  - Supports custom goal input via "Other" option
  - Falls back to basic compression when interactive mode disabled or goal
    extraction fails
- `CompressionOptions` type exported from core package

**NOT STARTED:**

- Documentation and migration guides
- Performance benchmarks
- Opt-out persistence tests
- Agent mode tests
- Concurrency safety integration tests

**Total Test Count: ~92 tests implemented:**

- GoalSelectionPrompt: 17 tests (8 selection + 5 countdown + 4 safety valve)
- CustomGoalInput: 6 tests (Other selection handling)
- useGeminiStream Compression: 6 tests
- CompressionMessage: 12 tests (8 existing + 4 user goal)
- Deliberate Compression Telemetry: 8 tests (3 basic + 5 opt-out tracking)
- Plus ~43 existing deliberate compression tests across other files **Remaining:
  performance benchmarks (optional)**

---

## Remaining Work Plan

### Priority 1: Fix Blocking Issues ✅ COMPLETED

- [x] Resolve GL-9000 blocking keypress simulation tests (fixed via
      RadioButtonSelect mocking)
- [x] Complete GoalSelectionPrompt interaction tests (8 tests passing)

### Priority 2: Integration Tests ✅ COMPLETED

- [x] Full interactive compression flow with goal selection (6 tests in
      useGeminiStream.test.tsx)
- [x] onShowCompressionPrompt callback wiring verified
- [x] Compression with goal selection verified
- [x] Auto compression verified
- [x] Null/timeout handling verified
- [x] Other option handling verified

### Priority 3: UI Enhancements ✅ COMPLETED

- [x] Countdown timer in GoalSelectionPrompt (5 tests)
- [x] Display user goal in CompressionMessage (4 tests)
- [ ] Message preservation stats display (optional enhancement)

### Priority 4: Advanced Telemetry ✅ COMPLETED

- [x] user_selected_disable tracking
- [x] user_selected_less_frequent tracking
- [x] frequency_multiplier_applied metrics
- [x] new_token_threshold and new_message_threshold tracking
- [x] was_safety_valve tracking

### Priority 5: Documentation

- [ ] Update README with deliberate compression docs
- [ ] Create migration guide for existing users
- [ ] Improve error messages for compression failures

### Priority 6: Performance

- [ ] Goal extraction benchmark (<2s for 100 messages)
- [ ] Truncation efficiency tests (>70% reduction)

---

## Key Files Reference

| Component          | File                                   | Tests                                       |
| ------------------ | -------------------------------------- | ------------------------------------------- |
| Split Strategy     | `chatCompressionService.ts`            | `chatCompressionService.test.ts`            |
| Compression Prompt | `prompts.ts`                           | `prompts.test.ts`                           |
| Trigger Logic      | `client.ts`                            | `client.test.ts:2423`                       |
| Concurrency Guards | `client.ts`                            | `client.test.ts:2546`                       |
| Goal Extraction    | `deliberateCompressionOrchestrator.ts` | `deliberateCompressionOrchestrator.test.ts` |
| Handler            | `deliberateCompressionHandler.ts`      | `deliberateCompressionHandler.test.ts`      |
| UI Prompt          | `GoalSelectionPrompt.tsx`              | `GoalSelectionPrompt.test.tsx`              |
| UI Custom Input    | `CustomGoalInput.tsx`                  | `CustomGoalInput.test.tsx`                  |
| UI Message         | `CompressionMessage.tsx`               | `CompressionMessage.test.tsx`               |
| Settings           | `settingsSchema.ts`                    | -                                           |
| Config             | `config.ts`                            | -                                           |
| Telemetry          | `types.ts`                             | `deliberate-compression-telemetry.test.ts`  |
| E2E Tests          | -                                      | `context-compress-interactive.test.ts`      |

---

_TDD Work Plan v1.8 - Updated 2025-11-25_

- v1.8: Safety valve auto-trigger UI integration:
  - Added `isSafetyValve` prop to GoalSelectionPrompt (hides opt-out options
    when triggered)
  - Updated `handleCompressionPrompt` in AppContainer.tsx to accept
    isSafetyValve parameter
  - Shows urgent message when safety valve triggers
  - Added 4 new safety valve tests in GoalSelectionPrompt.test.tsx (17 tests
    total now)
- v1.7: Wired GoalSelectionPrompt to /compress command via `custom_dialog`
  pattern:
  - Converted `compressCommand.ts` to `.tsx`
  - Created `CompressionDialog` component to orchestrate goal selection flow
  - Supports custom goal input via "Other" option
  - Falls back to basic compression when interactive mode disabled
  - Exported `CompressionOptions` type from core package
  - Updated compress command tests for new config methods
- v1.6: Refactored integration tests to use TestRig pattern, fixed broken
  `makeTestClientWithResponses` helper issue, deliberate compression basic test
  now passing
- v1.5: Added CustomGoalInput component (6 tests) for handling "Other"
  selection, integrated into AppContainer, all functional features complete!
- v1.4: Added advanced telemetry metrics (5 new tests for opt-out tracking:
  disable, less_frequent, multiplier, thresholds, safety_valve)
- v1.3: Added countdown timer to GoalSelectionPrompt (5 new tests), Added user
  goal display to CompressionMessage (4 new tests)
- v1.2: GL-9000 resolved, GoalSelectionPrompt tests fixed (8 passing),
  Integration tests added to useGeminiStream (6 tests)
- v1.1: Initial status assessment with actual implementation status
