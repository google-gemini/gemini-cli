# Phase 0 + Phase 1: Complete Manual Testing Plan

**Date:** 2025-12-29 **Features:** SubagentStop Hook, Loop Detection, Timeout
Fix, AskUserQuestion Tool (ALL features) **Estimated Time:** 45-60 minutes

---

## Prerequisites

```bash
# Ensure AGI version is linked
which gemini  # Should point to /Users/arpit/Desktop/agi-cli

# Set API key
export GEMINI_API_KEY="your-key-here"

# Navigate to test workspace
cd /Users/arpit/Desktop/super-claude-kit

# Verify test files exist
ls .gemini/hooks/subagent-stop.sh
ls .gemini/agents/loop-tester.toml
cat .gemini/settings.json
```

---

## Test Suite

### TEST 1: SubagentStop Hook (5 min) ✅ ALREADY PASSED

**You've already verified this works!**

**Log showed:**

```
===== SubagentStop Hook Fired =====
Agent: codebase_investigator
Turns: 3
Tool calls: 3
Termination: GOAL
```

**Status:** ✅ VERIFIED - Accurate metrics, hook fires correctly

---

### TEST 2: Loop Detection - Tool Calls (10 min)

**Purpose:** Verify agents detect and break tool call loops

**Setup:**

```bash
# Verify loop-tester agent exists
cat .gemini/agents/loop-tester.toml

# Should have:
# - loop_threshold = 5
# - enable_loop_detection = true
```

**Test:**

```bash
# Clear previous logs
> /tmp/agi-test-log.txt

gemini

# In CLI:
> Use the loop_tester agent to test loop detection
```

**Expected Behavior:**

1. Agent starts reading package.json
2. Reads it again... and again... (up to 5 times)
3. On 6th attempt: **"Loop detected: Repeated read_file call 6 times with
   identical arguments"**
4. Agent stops immediately
5. Subagent Finished - Termination Reason: **CYCLE_DETECTED**

**Verification:**

- [ ] Loop detected after 5-6 identical calls (not infinite)
- [ ] Clear error message mentioning tool name and count
- [ ] Termination reason: CYCLE_DETECTED
- [ ] NO recovery attempt
- [ ] SubagentStop hook still fires (check /tmp/agi-test-log.txt)

**Log should show:**

```
Agent: loop_tester
Termination: CYCLE_DETECTED
```

---

### TEST 3: Timeout Warning + Grace Period (10 min)

**Purpose:** Verify 80% timeout warning and grace period synchronization

**Setup:**

```bash
# Create short-timeout agent
cat > .gemini/agents/timeout-tester.toml << 'EOF'
name = "timeout_tester"
description = "Test timeout and grace period"

[prompts]
system_prompt = """
Work slowly. Read many files but don't call complete_task.
Think carefully between each file read.
"""

query = "Read files slowly to test timeout behavior"

[model]
model = "gemini-2.5-flash"

[run]
timeout_mins = 1  # 1 minute timeout

tools = ["read_file", "glob", "list_directory", "complete_task"]
EOF
```

**Test:**

```bash
gemini

> Use timeout_tester agent
```

**Watch the timeline:**

- **~48 seconds:** Should see: "⏰ Warning: Agent has used 80% of allocated time
  (48s / 60s, 12s remaining)"
- **~60 seconds:** "Execution limit reached (TIMEOUT). Attempting one final
  recovery turn with Xs grace period"
  - **X should be the remaining time** (5-15s, NOT always 60s!)
- **~65-75 seconds:** Agent completes or times out

**Verification:**

- [ ] 80% warning appears around 48 seconds
- [ ] Warning only shows ONCE (no spam)
- [ ] Grace period message shows actual remaining time
- [ ] If agent near 60s, grace period is adjusted (e.g., "5s grace period")
- [ ] Grace period doesn't always say "60s"

---

### TEST 4: AskUserQuestion - Single Question (10 min)

**Purpose:** Verify basic question/answer flow

**Test:**

```bash
gemini

> I need to add authentication to this project. First, use ask_user_question to ask me which authentication method I prefer. Offer OAuth 2.0, JWT, and Session-based as options. Then tell me what I chose.
```

**Expected:**

1. Agent analyzes request
2. Agent calls `ask_user_question`
3. Dialog appears:
   ```
   ┌──────────────────────────────────────────┐
   │ [Auth] Question 1 of 1                   │
   │                                          │
   │ Which authentication method should...?   │
   │                                          │
   │ 1. OAuth 2.0                             │
   │    Industry standard, secure             │
   │ 2. JWT                                   │
   │    Stateless, token-based                │
   │ 3. Session-based                         │
   │    Server-side sessions                  │
   │ 4. Other                                 │
   │    Provide custom input                  │
   └──────────────────────────────────────────┘
   ```
4. Navigate with ↑/↓, select with Enter
5. Agent says: "You chose: [your selection]"

**Verification:**

- [ ] Dialog renders with border and header chip
- [ ] Options show with descriptions
- [ ] Keyboard navigation works (↑/↓)
- [ ] Enter selects option
- [ ] Dialog closes after selection
- [ ] Agent receives answer correctly
- [ ] Agent acknowledges answer in response

---

### TEST 5: AskUserQuestion - "Other" Custom Input (10 min)

**Purpose:** Verify custom text input works

**Test:**

```bash
gemini

> Use ask_user_question to ask me which programming language I prefer. Offer Python, JavaScript, and Other as options. I will select Other and type "Rust".
```

**Expected:**

1. Dialog appears with 3 options + Other
2. Navigate to "Other" and press Enter
3. **Input mode activates:**
   ```
   Enter custom input (Esc to cancel):
   Rust█
   (Press Enter to submit)
   ```
4. Type "Rust"
5. See characters appear as you type
6. Backspace works to delete
7. Enter submits
8. Agent receives: `{"question_1": "Rust"}`

**Verification:**

- [ ] "Other" option exists and is selectable
- [ ] Selecting "Other" switches to text input mode
- [ ] Can type characters (they appear on screen)
- [ ] Backspace deletes characters
- [ ] Cursor visible (inverse space)
- [ ] Enter submits input
- [ ] Esc cancels and returns to options
- [ ] Agent receives custom text correctly

---

### TEST 6: AskUserQuestion - Multi-Select Mode (10 min)

**Purpose:** Verify checkbox multi-select works

**Test:**

```bash
gemini

> Use ask_user_question to ask me which features I want in my app. The question should have multiSelect=true. Offer these options: Authentication, Caching, Logging, Monitoring. I will select multiple.
```

**Expected:**

1. Dialog appears in multi-select mode
2. **Checkboxes visible:**

   ```
   Select one or more options (↑/↓ navigate, Space toggle, Enter confirm):

   [ ] Authentication
       User login and permissions
   [ ] Caching
       Speed up responses
   [ ] Logging
       Track system events
   [ ] Monitoring
       System health metrics

   0 selected (Press Enter to confirm)
   ```

3. Navigate with ↑/↓
4. Press **Space** to toggle:
   - `[ ]` becomes `[x]`
   - Text becomes **bold**
   - Counter updates: "2 selected"
5. Press **Space** again to untoggle:
   - `[x]` becomes `[ ]`
   - Text becomes normal
6. Press **Enter** to confirm
7. Agent receives: `{"question_1": ["Authentication", "Caching"]}`

**Verification:**

- [ ] Checkboxes render ([ ] and [x])
- [ ] Space key toggles selection
- [ ] Selected items show [x] and bold text
- [ ] Selection counter updates
- [ ] Enter requires at least one selection
- [ ] Agent receives array of selected items
- [ ] Can select multiple items
- [ ] Can unselect items

---

### TEST 7: AskUserQuestion - Multiple Questions (10 min)

**Purpose:** Verify sequential question flow

**Test:**

```bash
gemini

> I'm building a web app. Use ask_user_question to ask me THREE questions:
> 1. Which database? (PostgreSQL, MySQL, SQLite)
> 2. Which framework? (React, Vue, Angular)
> 3. Which hosting? (AWS, Vercel, Heroku)
> Then summarize my choices.
```

**Expected:**

1. First question appears: "Which database?"
2. Select answer (e.g., PostgreSQL)
3. Second question appears: "Which framework?"
4. Select answer (e.g., React)
5. Third question appears: "Which hosting?"
6. Select answer (e.g., Vercel)
7. Agent says: "Your choices: PostgreSQL, React, Vercel"

**Verification:**

- [ ] Questions appear sequentially (not all at once)
- [ ] Progress indicator updates (1 of 3, 2 of 3, 3 of 3)
- [ ] Previous answers don't show (clean UI)
- [ ] All 3 answers collected
- [ ] Agent receives structured response with all answers
- [ ] Agent can reference all answers

---

### TEST 8: Regression - Existing Features (5 min)

**Purpose:** Verify nothing broke

**Test:**

```bash
gemini

# Test 1: Basic tool
> List files in current directory

# Test 2: Agent without questions
> Use codebase_investigator to analyze README.md

# Test 3: Exit
> /exit
```

**Verification:**

- [ ] Basic tools still work (list_directory)
- [ ] Agents still work (codebase_investigator)
- [ ] No crashes or errors
- [ ] Exit is clean

---

## Test Results Template

**Record results here:**

| Test                      | Status     | Time | Notes            |
| ------------------------- | ---------- | ---- | ---------------- |
| 1. SubagentStop Hook      | ✅ PASS    | -    | Already verified |
| 2. Loop Detection         | ⬜ PENDING |      |                  |
| 3. Timeout + Grace Period | ⬜ PENDING |      |                  |
| 4. AskUserQuestion Single | ⬜ PENDING |      |                  |
| 5. "Other" Custom Input   | ⬜ PENDING |      |                  |
| 6. Multi-Select Mode      | ⬜ PENDING |      |                  |
| 7. Multiple Questions     | ⬜ PENDING |      |                  |
| 8. Regression Check       | ⬜ PENDING |      |                  |

**Issues Found:** [List any bugs or unexpected behavior]

**Overall Status:**

- [ ] All tests pass
- [ ] Ready for commit
- [ ] Ready for next phase

---

## Quick Start Testing

**Run this script to test everything:**

```bash
#!/bin/bash
export GEMINI_API_KEY="your-key"
cd /Users/arpit/Desktop/super-claude-kit

echo "=== TEST 2: Loop Detection ==="
gemini -p "Use loop_tester agent" --output-format json | jq .response

echo "\n=== TEST 4: Single Question ==="
gemini -p "Use ask_user_question to ask: Which language? Options: Python, JavaScript, TypeScript" --output-format json

echo "\n=== TEST 5: Custom Input ==="
# Interactive - can't script this one

echo "\n=== TEST 6: Multi-Select ==="
# Interactive - can't script this one

echo "\n=== TEST 8: Regression ==="
gemini -p "List files" --output-format json | jq .response
```

---

_Start with Test 2 (Loop Detection) - it's quick and will verify Phase 0 works!_
