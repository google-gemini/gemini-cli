# Phase 1: AskUserQuestion Tool - Implementation Summary

**Date:** 2025-12-29 **Status:** Complete - Ready for Review **Validation:**
TypeScript compilation successful (0 errors)

---

## What Was Implemented

Phase 1 added interactive question capability to enable agents to query users
during execution, following Claude Code's AskUserQuestion pattern.

### AskUserQuestion Tool

Implemented a new tool that allows agents/sub-agents to ask 1-4 questions with
2-4 predefined options each, enabling:

- Clarifying ambiguous instructions mid-task
- Getting user preferences on implementation choices
- Offering multiple approaches and letting user decide
- Human-in-the-loop agent patterns

**Features:**

- Sequential question flow (one question at a time)
- Single-select mode (radio buttons)
- Descriptive options (label + explanation)
- Proper MESSAGE_BUS coordination between Core and CLI

### Tool Schema

```json
{
  "name": "ask_user_question",
  "parameters": {
    "questions": [
      {
        "question": "Which authentication method should I use?",
        "header": "Auth",
        "options": [
          { "label": "OAuth 2.0", "description": "Industry standard, secure" },
          { "label": "JWT", "description": "Stateless, simple" }
        ],
        "multiSelect": false
      }
    ]
  }
}
```

**Response format:**

```json
{
  "answers": {
    "question_1": "OAuth 2.0",
    "question_2": "PostgreSQL"
  }
}
```

---

## Files Created

### Core (Backend)

- `/packages/core/src/tools/ask-user-question.ts` - Tool implementation with
  MESSAGE_BUS integration

### CLI (Frontend)

- `/packages/cli/src/ui/components/AskUserQuestionDialog.tsx` - Interactive
  dialog component

---

## Files Modified

### Core Package

- `/packages/core/src/tools/tool-names.ts` - Added ASK_USER_QUESTION_TOOL_NAME
  constant
- `/packages/core/src/confirmation-bus/types.ts` - Added MESSAGE_BUS types
  (Question, QuestionOption, AskUserQuestionRequest, AskUserQuestionResponse)
- `/packages/core/src/config/config.ts` - Registered tool in
  createToolRegistry()
- `/packages/core/src/index.ts` - Exported new types

### CLI Package

- `/packages/cli/src/ui/contexts/UIStateContext.tsx` - Added
  askUserQuestionRequest state
- `/packages/cli/src/ui/contexts/UIActionsContext.tsx` - Added
  handleAskUserQuestionComplete action
- `/packages/cli/src/ui/components/DialogManager.tsx` - Added
  AskUserQuestionDialog case
- `/packages/cli/src/ui/AppContainer.tsx` - Added handler, MESSAGE_BUS
  subscription, state management
- `/packages/cli/src/test-utils/render.tsx` - Added mock for tests

---

## What's Different Now

### For Agents

**New capability:**

- Agents can call `ask_user_question` to get interactive input
- Questions appear as formatted dialogs with clear options
- Answers flow back to agent for decision-making

**Example use case:**

```
Agent: Analyzing your request to "add authentication"...
       [Calls ask_user_question]

User sees:
  ┌─────────────────────────────────────────┐
  │ [Auth] Question 1 of 1                  │
  │                                         │
  │ Which authentication method should I    │
  │ use?                                    │
  │                                         │
  │ › OAuth 2.0                             │
  │   Industry standard, secure             │
  │   JWT                                   │
  │   Stateless, simple                     │
  │   Other                                 │
  │   Provide custom input                  │
  └─────────────────────────────────────────┘

User selects: OAuth 2.0

Agent receives: {"answers": {"question_1": "OAuth 2.0"}}
Agent: Implementing OAuth 2.0 authentication...
```

### For Sub-Agents

Sub-agents (via `delegate_to_agent`) can also use this tool, enabling:

- Research agents asking for clarification on objectives
- Planning agents offering architectural choices
- Implementation agents confirming approach before proceeding

---

## Implementation Notes

### Phase 1 Scope (Completed)

✅ **Implemented:**

- Core tool with Zod validation
- MESSAGE_BUS request/response flow
- CLI dialog component with Ink rendering
- Sequential question flow
- Single-select mode with DescriptiveRadioButtonSelect
- Tool registration and exports

- Checkbox UI component (not needed for Phase 1)

### Design Decisions

**Sequential vs All-at-Once:**

- Chose sequential (one question at a time)
- Simpler UX, less overwhelming
- Matches existing dialog patterns (FolderTrust, ShellConfirmation)

**MESSAGE_BUS Integration:**

- Follows existing tool confirmation pattern
- Tool publishes REQUEST, waits for RESPONSE
- CLI subscribes to REQUEST, renders dialog, publishes RESPONSE
- Clean separation between Core and CLI

**Validation:**

- 1-4 questions per call
- 2-4 options per question
- Header ≤ 12 characters
- All enforced via Zod schema

---

## Testing Status

**TypeScript Validation:** ✅ Passed (0 errors in all packages) **Build
Status:** ✅ Core package builds successfully **Manual Testing:** Ready for
functional testing

**Test scenarios to verify:**

1. Single question, single-select → user chooses option
2. Multiple questions → sequential flow works
3. "Other" option → shows not-implemented message
4. Multi-select → falls back to single-select with warning

---

## Known Limitations

**"Other" Custom Input:**

- Currently shows placeholder message
- Requires TextInput component integration

## Architecture Integration

**MESSAGE_BUS Flow:**

```
Agent (Core)
  ↓ calls ask_user_question
  ↓ publishes ASK_USER_QUESTION_REQUEST
MESSAGE_BUS
  ↓ delivers to CLI
CLI (Frontend)
  ↓ sets askUserQuestionRequest in UIState
  ↓ DialogManager renders AskUserQuestionDialog
  ↓ user selects option
  ↓ calls handleAskUserQuestionComplete
  ↓ publishes ASK_USER_QUESTION_RESPONSE
MESSAGE_BUS
  ↓ delivers to tool
Tool
  ↓ resolves promise with answers
  ↓ returns to agent
```

**Clean Separation:**

- Core knows nothing about Ink or UI rendering
- CLI knows nothing about tool execution logic
- MESSAGE_BUS coordinates communication
- Follows existing architectural patterns

---

## Ready for Review

**Please verify:**

- [ ] Tool can be called from agents
- [ ] Dialog renders questions correctly
- [ ] Options display with descriptions
- [ ] Selection works (keyboard navigation)
- [ ] Answers flow back to agent
- [ ] No regressions in existing functionality

**Next steps:**

- Manual testing with real scenarios
- Git commit approval
- Move to Phase 2

---

_STOPPING per workflow. No git operations performed. Awaiting your review and
approval._
