# AGI Enhancements: Comprehensive Testing Strategy

**Date:** 2025-12-29 **Phases Covered:** Phase 0 (SubagentStop, Loop Detection,
Timeout) + Phase 1 (AskUserQuestion)

---

## Testing Goals

1. **Verify functionality** - Each feature works as designed
2. **Prevent regressions** - Existing features still work
3. **Edge case coverage** - Handle errors gracefully
4. **Integration validation** - Features work together

---

## Part 1: Manual Testing (Do This First)

### Phase 0: Manual Verification

#### Test 1: SubagentStop Hook (10 minutes)

**Setup:**

```bash
cd /Users/arpit/Desktop/super-claude-kit

# Ensure hook and settings exist from previous test
ls .gemini/hooks/subagent-stop.sh
cat .gemini/settings.json  # Should have SubagentStop hook configured

# Clear log
> /tmp/agi-test-log.txt
```

**Test:**

```bash
export GEMINI_API_KEY="your-key"
gemini -p "Use codebase_investigator to analyze the tools directory"
```

**Expected:**

- Agent runs and completes
- Check log: `cat /tmp/agi-test-log.txt`
- Should see:
  - Agent: codebase_investigator
  - Turns: [actual count, not approximation like "1" or "2"]
  - Tool calls: [actual count matching what agent did]
  - Execution time: [milliseconds]
  - Termination: GOAL

**Verification checklist:**

- [ ] Hook fires (log file has entry)
- [ ] Turn count is accurate (≥2 for real agent work)
- [ ] Tool call count matches actual calls
- [ ] Execution time is reasonable (>1000ms for real work)

#### Test 2: Tool Call Loop Detection (5 minutes)

**Test:**

```bash
gemini

# In CLI:
> Use the loop_tester agent
```

**Expected:**

- Agent starts calling read_file
- After 5-6 identical calls: **Loop detected!**
- Message: "Repeated read_file call X times with identical arguments"
- Termination Reason: CYCLE_DETECTED
- NO recovery attempt

**Verification checklist:**

- [ ] Loop detected after threshold (5 calls)
- [ ] Agent stops immediately
- [ ] Termination reason: CYCLE_DETECTED
- [ ] Clear error message
- [ ] No infinite loop

#### Test 3: Timeout and Grace Period (5 minutes)

**Create test agent:**

```bash
cat > .gemini/agents/timeout-test.toml << 'EOF'
name = "timeout_test"
description = "Tests timeout warnings and grace period"

[prompts]
system_prompt = "Work slowly, read multiple files. Do NOT call complete_task."
query = "Read many files slowly"

[model]
model = "gemini-2.5-flash"

[run]
timeout_mins = 1  # 1 minute for fast testing

tools = ["read_file", "glob", "complete_task"]
EOF
```

**Test:**

```bash
gemini
> Use timeout_test agent
```

**Expected timeline:**

- ~48s: "⏰ Warning: Agent has used 80% of allocated time..."
- ~60s: "Execution limit reached (TIMEOUT). Attempting one final recovery turn
  with Xs grace period"
- X should be reasonable (not always 60s if near timeout)

**Verification checklist:**

- [ ] 80% warning appears
- [ ] Grace period message shows actual time available
- [ ] If agent is near timeout, grace period < 60s
- [ ] Agent either recovers or fails gracefully

#### Test 4: Content Loop Detection (Manual/Optional)

**This is hard to trigger manually** - requires LLM to generate repetitive text.

**Verification:** Check that the code is there

```bash
grep -n "checkContentLoop" packages/core/src/agents/local-executor.ts
# Should see line ~704: calls checkContentLoop during streaming
```

**Trust but verify:** Algorithm exists and is integrated. LLM rarely generates
true loops.

---

### Phase 1: Manual Verification

#### Test 5: AskUserQuestion - Single Question (15 minutes)

**Rebuild and link** (if not already done):

```bash
cd /Users/arpit/Desktop/agi-cli
npm run build --workspace @google/gemini-cli-core
npm run build --workspace @google/gemini-cli
cd packages/cli && npm link
```

**Create test scenario:**

```bash
cd /Users/arpit/Desktop/super-claude-kit

# Create simple test file
cat > test-auth.md << 'EOF'
# Authentication System

This file needs authentication.

TODO: Implement auth
EOF
```

**Test:**

```bash
export GEMINI_API_KEY="your-key"
gemini

# In CLI:
> I need to add authentication to this project. Before implementing, ask me which method I prefer using the ask_user_question tool.
```

**Expected:**

1. Agent analyzes request
2. Agent calls `ask_user_question`
3. Dialog appears:
   ```
   ┌─────────────────────────────────────┐
   │ [Auth] Question 1 of 1              │
   │                                     │
   │ Which authentication method...?     │
   │                                     │
   │ 1. OAuth 2.0                        │
   │    Industry standard, secure        │
   │ 2. JWT                              │
   │    Stateless, simple                │
   │ 3. Other                            │
   │    Provide custom input             │
   └─────────────────────────────────────┘
   ```
4. Navigate with ↑/↓, select with Enter
5. If "Other" selected: Shows "not yet implemented" message
6. Agent receives answer and continues

**Verification checklist:**

- [ ] Dialog renders properly
- [ ] Options display with descriptions
- [ ] Keyboard navigation works (↑/↓)
- [ ] Enter selects option
- [ ] Answer flows back to agent
- [ ] Agent acknowledges answer and proceeds

#### Test 6: AskUserQuestion - Multiple Questions (10 minutes)

**Create multi-question scenario:**

**Test:**

```bash
gemini

> I'm building a web application. Ask me 3 questions:
> 1. Which database to use?
> 2. Which authentication method?
> 3. Which deployment platform?
> Use ask_user_question for each.
```

**Expected:**

- First question appears
- Select answer
- Second question appears
- Select answer
- Third question appears
- Select answer
- Agent receives all 3 answers

**Verification checklist:**

- [ ] Sequential flow (one question at a time)
- [ ] Progress indicator updates (Question 1 of 3, 2 of 3, 3 of 3)
- [ ] All answers collected
- [ ] Agent receives structured response with all 3 answers

---

## Part 2: Automated Unit Tests (To Be Written)

### Phase 0 Unit Tests

#### Test File: `packages/core/src/agents/loop-detection-utils.test.ts`

**Coverage:**

````typescript
describe('LocalAgentLoopDetector', () => {
  it('should detect tool call loop after threshold', () => {
    const detector = new LocalAgentLoopDetector();

    // Call same tool 5 times
    for (let i = 0; i < 5; i++) {
      const result = detector.checkToolCallLoop({
        name: 'read_file',
        args: { file_path: 'test.txt' },
      });

      if (i < 4) {
        expect(result.detected).toBe(false);
      } else {
        expect(result.detected).toBe(true);
        expect(result.loopType).toBe('TOOL_CALL');
      }
    }
  });

  it('should NOT detect loop when args differ', () => {
    const detector = new LocalAgentLoopDetector();

    detector.checkToolCallLoop({
      name: 'read_file',
      args: { file_path: 'a.txt' },
    });
    detector.checkToolCallLoop({
      name: 'read_file',
      args: { file_path: 'b.txt' },
    });
    const result = detector.checkToolCallLoop({
      name: 'read_file',
      args: { file_path: 'c.txt' },
    });

    expect(result.detected).toBe(false);
  });

  it('should detect content loop', () => {
    const detector = new LocalAgentLoopDetector();
    const repetitiveText = 'This is a test. '.repeat(15);

    const result = detector.checkContentLoop(repetitiveText);

    expect(result.detected).toBe(true);
    expect(result.loopType).toBe('CONTENT');
  });

  it('should ignore code blocks in content detection', () => {
    const detector = new LocalAgentLoopDetector();
    const codeWithRepetition =
      '```\nconst x = 1;\nconst x = 1;\nconst x = 1;\n```';

    const result = detector.checkContentLoop(codeWithRepetition);

    expect(result.detected).toBe(false); // Code blocks ignored
  });

  it('should reset state', () => {
    const detector = new LocalAgentLoopDetector();

    // Trigger near-loop
    for (let i = 0; i < 4; i++) {
      detector.checkToolCallLoop({ name: 'test', args: {} });
    }

    // Reset
    detector.reset();

    // Should not trigger on first call after reset
    const result = detector.checkToolCallLoop({ name: 'test', args: {} });
    expect(result.detected).toBe(false);
  });
});
````

#### Test File: `packages/core/src/hooks/hookEventHandler.test.ts` (extend existing)

**Add SubagentStop tests:**

```typescript
describe('fireSubagentStopEvent', () => {
  it('should fire SubagentStop event with agent metrics', async () => {
    const mockResults = [
      {
        success: true,
        duration: 100,
        hookConfig: { type: HookType.Command, command: './test.sh' },
        eventName: HookEventName.SubagentStop,
      },
    ];

    const result = await hookEventHandler.fireSubagentStopEvent(
      'test_agent',
      'Task completed',
      'GOAL',
      5000,
      3,
      7,
    );

    expect(result.success).toBe(true);
    expect(mockHookRunner.executeHooksParallel).toHaveBeenCalledWith(
      expect.anything(),
      HookEventName.SubagentStop,
      expect.objectContaining({
        agent_name: 'test_agent',
        turn_count: 3,
        tool_calls_count: 7,
      }),
    );
  });
});
```

### Phase 1 Unit Tests

#### Test File: `packages/core/src/tools/ask-user-question.test.ts`

**Coverage:**

```typescript
describe('AskUserQuestionTool', () => {
  it('should validate question count (1-4)', () => {
    const tool = new AskUserQuestionTool();

    // Too many questions
    expect(() => {
      tool.build({ questions: Array(5).fill({...validQuestion}) });
    }).toThrow();
  });

  it('should validate options count (2-4)', () => {
    const tool = new AskUserQuestionTool();

    // Too few options
    expect(() => {
      tool.build({
        questions: [{
          question: "Test?",
          header: "Test",
          options: [{label: "Only one", description: "desc"}]
        }]
      });
    }).toThrow();
  });

  it('should validate header length (≤12 chars)', () => {
    const tool = new AskUserQuestionTool();

    expect(() => {
      tool.build({
        questions: [{
          question: "Test?",
          header: "ThisIsTooLongForHeader",
          options: [...]
        }]
      });
    }).toThrow();
  });

  it('should send MESSAGE_BUS request and wait for response', async () => {
    const mockMessageBus = createMockMessageBus();
    const tool = new AskUserQuestionTool(mockMessageBus);
    const invocation = tool.build({
      questions: [{
        question: "Which database?",
        header: "Database",
        options: [
          {label: "PostgreSQL", description: "Robust"},
          {label: "SQLite", description: "Simple"}
        ]
      }]
    });

    // Simulate user response
    setTimeout(() => {
      mockMessageBus.emit('ask-user-question-response', {
        correlationId: expect.any(String),
        answers: { question_1: "PostgreSQL" }
      });
    }, 100);

    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toContain("PostgreSQL");
    expect(mockMessageBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageBusType.ASK_USER_QUESTION_REQUEST
      })
    );
  });
});
```

---

## Part 3: Integration Tests (To Be Written)

### Phase 0 Integration Tests

#### Test File: `integration-tests/subagent-stop-hook.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { setupRig } from './test-utils';

describe('SubagentStop Hook', () => {
  it('should fire when codebase_investigator completes', async () => {
    const rig = await setupRig('subagent-stop-fires', {
      settings: {
        hooks: {
          SubagentStop: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'echo "HOOK_FIRED:$agent_name"',
                },
              ],
            },
          ],
        },
      },
    });

    await rig.run({
      args: 'Use codebase_investigator to list files in current directory',
    });

    const output = rig.getOutput();
    expect(output).toContain('HOOK_FIRED:codebase_investigator');
  });

  it('should provide accurate turn and tool counts', async () => {
    // Create hook that logs metrics to file
    const rig = await setupRig('subagent-metrics', {
      settings: {
        hooks: {
          SubagentStop: [
            {
              hooks: [
                {
                  type: 'command',
                  command:
                    'echo "$turn_count:$tool_calls_count" > /tmp/metrics.txt',
                },
              ],
            },
          ],
        },
      },
    });

    await rig.run({
      args: 'Use codebase_investigator to analyze this codebase',
    });

    const metrics = await fs.readFile('/tmp/metrics.txt', 'utf-8');
    const [turns, tools] = metrics.trim().split(':').map(Number);

    expect(turns).toBeGreaterThan(0);
    expect(tools).toBeGreaterThan(0);
    // Verify not approximated (would be 1 if approximated)
    expect(turns).toBeGreaterThan(1);
  });
});
```

#### Test File: `integration-tests/loop-detection.test.ts`

```typescript
describe('Loop Detection', () => {
  it('should detect tool call loops', async () => {
    const rig = await setupRig('tool-loop-detection', {
      agents: {
        loop_trigger: {
          systemPrompt:
            'Call read_file on "test.txt" exactly 7 times with identical arguments',
          tools: ['read_file', 'complete_task'],
          runConfig: {
            max_turns: 10,
            timeout_mins: 2,
            enable_loop_detection: true,
            loop_threshold: 5,
          },
        },
      },
    });

    const result = await rig.run({
      args: 'Use loop_trigger agent',
    });

    expect(result.terminateReason).toBe('CYCLE_DETECTED');
    expect(result.output).toContain('Loop detected');
    expect(result.output).toContain('read_file');
  });

  it('should NOT detect false positives on file iteration', async () => {
    const rig = await setupRig('file-iteration-not-loop', {
      agents: {
        file_reader: {
          systemPrompt: 'Read 10 different files in tools directory',
          tools: ['read_file', 'glob', 'complete_task'],
        },
      },
    });

    const result = await rig.run({
      args: 'Use file_reader to read multiple files',
    });

    // Should NOT be CYCLE_DETECTED
    expect(result.terminateReason).not.toBe('CYCLE_DETECTED');
    expect(result.terminateReason).toBe('GOAL');
  });
});
```

### Phase 1 Integration Tests

#### Test File: `integration-tests/ask-user-question.test.ts`

```typescript
describe('AskUserQuestion Tool', () => {
  it('should present question dialog and return user answer', async () => {
    const rig = await setupRig('ask-user-single-question');

    // Simulate user selecting first option
    rig.onQuestionPrompt((questions) => {
      return { question_1: questions[0].options[0].label };
    });

    await rig.run({
      prompt: `Call ask_user_question to ask:
        Question: "Which database should I use?"
        Header: "Database"
        Options: [{label: "PostgreSQL", description: "Robust"}, {label: "SQLite", description: "Simple"}]`,
    });

    const toolCalls = rig.getToolCalls();
    const askQuestionCall = toolCalls.find(
      (t) => t.name === 'ask_user_question',
    );

    expect(askQuestionCall).toBeDefined();
    expect(askQuestionCall.response.answers.question_1).toBe('PostgreSQL');
  });

  it('should handle multiple questions sequentially', async () => {
    const rig = await setupRig('ask-user-multiple-questions');

    rig.onQuestionPrompt((questions, questionIndex) => {
      // Answer each question with first option
      return {
        [`question_${questionIndex + 1}`]:
          questions[questionIndex].options[0].label,
      };
    });

    await rig.run({
      prompt: 'Ask me 3 questions about tech stack using ask_user_question',
    });

    const askQuestionCall = rig.getLastToolCall('ask_user_question');
    expect(Object.keys(askQuestionCall.response.answers)).toHaveLength(3);
  });

  it('should fail gracefully in non-interactive mode', async () => {
    const rig = await setupRig('ask-user-non-interactive', {
      headless: true,
    });

    const result = await rig.run({
      prompt: 'Call ask_user_question...',
    });

    expect(result.error).toContain('non-interactive mode');
  });
});
```

---

## Part 4: Test Execution Plan

### Step 1: Manual Testing (Do Today)

**Time:** 30-45 minutes

1. ✅ Run Test 1: SubagentStop hook
2. ✅ Run Test 2: Loop detection
3. ⚠️ Run Test 3: Timeout (optional, takes 1 minute)
4. ✅ Run Test 5: AskUserQuestion single
5. ✅ Run Test 6: AskUserQuestion multiple

**Success criteria:**

- All 5 tests pass manually
- No crashes or errors
- Features behave as documented

### Step 2: Write Unit Tests (Next Session)

**Time:** 2-3 hours

1. Write `loop-detection-utils.test.ts` (1 hour)
2. Extend `hookEventHandler.test.ts` for SubagentStop (30 min)
3. Write `ask-user-question.test.ts` (1 hour)

**Run:**

```bash
npm test --workspace @google/gemini-cli-core
```

**Target:** >80% coverage on new code

### Step 3: Write Integration Tests (Future)

**Time:** 3-4 hours

1. Write `subagent-stop-hook.test.ts`
2. Write `loop-detection.test.ts`
3. Write `ask-user-question.test.ts`

**Run:**

```bash
npm run test:integration
```

### Step 4: Regression Testing

**Verify existing features still work:**

```bash
# Run full test suite
npm test

# Run integration tests
npm run test:integration:sandbox:none

# Check for failures
```

---

## Part 5: Testing Checklist

### Phase 0 Verification

**SubagentStop Hook:**

- [ ] Fires on agent completion (success)
- [ ] Fires on agent timeout
- [ ] Fires on agent error
- [ ] Fires on cycle detection
- [ ] Provides accurate turn count
- [ ] Provides accurate tool call count
- [ ] Execution time is realistic
- [ ] Can add additionalContext

**Loop Detection:**

- [ ] Detects 5+ identical tool calls
- [ ] Detects 10+ repetitive content chunks
- [ ] Ignores code blocks in content
- [ ] Ignores tables, lists, markdown structures
- [ ] Configurable via TOML (enable_loop_detection, loop_threshold)
- [ ] No recovery attempt on CYCLE_DETECTED
- [ ] Clear error messages

**Timeout Fixes:**

- [ ] 80% warning appears
- [ ] Grace period synchronized with deadline
- [ ] No grace period if <5s remaining
- [ ] Timeout warning only shows once (no spam)

### Phase 1 Verification

**AskUserQuestion Tool:**

- [ ] Accepts 1-4 questions
- [ ] Each question has 2-4 options
- [ ] Header validation (≤12 chars)
- [ ] Sequential question flow
- [ ] Keyboard navigation (↑/↓/Enter)
- [ ] Options display with descriptions
- [ ] Progress indicator (Question X of Y)
- [ ] Answers returned to agent correctly
- [ ] "Other" shows placeholder
- [ ] Multi-select shows warning and falls back
- [ ] Fails gracefully in non-interactive mode

---

## Part 6: Quick Smoke Test (5 minutes)

**Verify nothing broke:**

```bash
cd /Users/arpit/Desktop/super-claude-kit
export GEMINI_API_KEY="your-key"

# Test basic functionality
gemini -p "List files in current directory" --output-format json

# Expected: JSON output with file list
# If this works: Core functionality intact

# Test agents still work
gemini -p "Use codebase_investigator to summarize tools/"

# Expected: Agent runs and completes
# If this works: Agent system intact
```

---

## Part 7: Test Results Template

**Create:** `TEST-RESULTS.md`

```markdown
# Test Results - Phase 0 + Phase 1

**Date:** [DATE] **Tester:** [YOUR NAME] **Commit:** [COMMIT HASH]

## Manual Tests

### Phase 0

| Test              | Status | Notes                          |
| ----------------- | ------ | ------------------------------ |
| SubagentStop Hook | ✅/❌  | Turn count: X, Tool count: Y   |
| Loop Detection    | ✅/❌  | Loop detected after: X calls   |
| Timeout Warning   | ✅/❌  | Warning appeared at: X seconds |
| Grace Period      | ✅/❌  | Grace period: X seconds        |

### Phase 1

| Test                  | Status | Notes                                      |
| --------------------- | ------ | ------------------------------------------ |
| Single Question       | ✅/❌  | Dialog rendered: Y/N, Answer received: Y/N |
| Multiple Questions    | ✅/❌  | All 3 questions worked: Y/N                |
| "Other" Option        | ✅/❌  | Placeholder showed: Y/N                    |
| Multi-select Fallback | ✅/❌  | Warning showed: Y/N                        |

## Unit Tests

| Suite                                   | Tests | Passed | Failed |
| --------------------------------------- | ----- | ------ | ------ |
| loop-detection-utils.test.ts            | X     | X      | X      |
| ask-user-question.test.ts               | X     | X      | X      |
| hookEventHandler.test.ts (SubagentStop) | X     | X      | X      |

## Integration Tests

| Suite                      | Tests | Passed | Failed |
| -------------------------- | ----- | ------ | ------ |
| subagent-stop-hook.test.ts | X     | X      | X      |
| loop-detection.test.ts     | X     | X      | X      |
| ask-user-question.test.ts  | X     | X      | X      |

## Issues Found

[List any bugs, unexpected behavior, or improvements needed]

## Sign-Off

- [ ] All manual tests pass
- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] No regressions
- [ ] Ready for next phase
```

---

## Recommendation

**Do this NOW (today):**

1. Manual tests for Phase 0 (Tests 1-3) - 20 minutes
2. Manual tests for Phase 1 (Tests 5-6) - 25 minutes
3. Quick smoke test - 5 minutes
4. Document results in TEST-RESULTS.md

**Do NEXT SESSION:**

1. Write unit tests (2-3 hours)
2. Run automated test suite
3. Write integration tests if time permits

**This ensures:**

- ✅ Features work NOW (before moving to Phase 2)
- ✅ Regression prevention (tests catch future breaks)
- ✅ Documentation (test results for portfolio)

---

_Ready to start manual testing? I can guide you step-by-step through each test._
