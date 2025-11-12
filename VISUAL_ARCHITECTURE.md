# Gemini CLI - Visual Architecture Documentation

## Table of Contents
1. [High-Level Architecture](#high-level-architecture)
2. [Module Interaction Diagrams](#module-interaction-diagrams)
3. [State Machine Diagrams](#state-machine-diagrams)
4. [Sequence Diagrams](#sequence-diagrams)
5. [Layer Architecture](#layer-architecture)
6. [Data Flow Diagrams](#data-flow-diagrams)

---

## 1. High-Level Architecture

### 1.1 Overall System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          GEMINI CLI SYSTEM                              │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────────┐ │
│  │                        CLI INTERFACE                              │ │
│  │  ┌──────────────┐         ┌──────────────┐                       │ │
│  │  │ Interactive  │         │     Non-     │                       │ │
│  │  │    Mode      │         │ Interactive  │                       │ │
│  │  │ (Ink/React)  │         │     Mode     │                       │ │
│  │  └──────┬───────┘         └──────┬───────┘                       │ │
│  └─────────┼────────────────────────┼───────────────────────────────┘ │
│            │                        │                                 │
│  ┌─────────▼────────────────────────▼───────────────────────────────┐ │
│  │                   APPLICATION LAYER                              │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │ │
│  │  │   Command    │  │   Prompt     │  │   Session    │           │ │
│  │  │   Service    │  │  Processor   │  │   Manager    │           │ │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │ │
│  └─────────┼──────────────────┼──────────────────┼───────────────────┘ │
│            │                  │                  │                     │
│  ┌─────────▼──────────────────▼──────────────────▼───────────────────┐ │
│  │                        CORE LAYER                                │ │
│  │  ┌──────────────────────────────────────────────────────┐        │ │
│  │  │              GeminiClient (Orchestrator)             │        │ │
│  │  │  - Chat Management                                   │        │ │
│  │  │  - Model Routing                                     │        │ │
│  │  │  - Context Compression                               │        │ │
│  │  │  - Loop Detection                                    │        │ │
│  │  └─────────┬────────────────────────────────────────────┘        │ │
│  │            │                                                     │ │
│  │  ┌─────────▼────────┐  ┌────────────┐  ┌──────────────────┐    │ │
│  │  │   GeminiChat     │  │   Turn     │  │ CoreToolScheduler│    │ │
│  │  │   (History)      │  │ (Execution)│  │  (Tool Mgmt)     │    │ │
│  │  └─────────┬────────┘  └─────┬──────┘  └────────┬─────────┘    │ │
│  └────────────┼───────────────────┼──────────────────┼─────────────┘ │
│               │                   │                  │               │
│  ┌────────────▼───────────────────▼──────────────────▼─────────────┐ │
│  │                  INFRASTRUCTURE LAYER                           │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │ │
│  │  │  Gemini  │  │   Tool   │  │  Policy  │  │   MCP    │        │ │
│  │  │   API    │  │ Registry │  │  Engine  │  │  Client  │        │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │ │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐        │ │
│  │  │  Agent   │  │ Storage  │  │Telemetry │  │   IDE    │        │ │
│  │  │ Executor │  │  System  │  │  Service │  │ Integration      │ │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘        │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Legend:
  ┌─┐     Component/Module
  │ │     Container
  └─┘
   ▼      Data/Control Flow
```

### 1.2 Component Interaction Overview

```
┌──────────────┐
│     User     │
└──────┬───────┘
       │ Input (text, @files, /commands)
       ▼
┌──────────────────────────────────────┐
│      CLI Entry Point                 │
│  - Interactive (Ink/React UI)        │
│  - Non-Interactive (Direct output)   │
└──────┬───────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────┐
│         Prompt Processing Pipeline              │
│  1. Slash Command Handler                       │
│  2. @ File Inclusion Processor                  │
│  3. Shell Command Processor                     │
│  4. Argument Processor                          │
└──────┬──────────────────────────────────────────┘
       │ Processed Parts[]
       ▼
┌─────────────────────────────────────────────────┐
│           GeminiClient                          │
│  - Manages conversation history                 │
│  - Routes to appropriate model                  │
│  - Handles compression                          │
│  - Detects loops                                │
└──────┬──────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────┐
│           GeminiChat                            │
│  - Streams response from API                    │
│  - Validates content                            │
│  - Retries on invalid streams                   │
│  - Records conversation                         │
└──────┬──────────────────────────────────────────┘
       │
       ├─────► Text Response ──────┐
       │                           │
       └─────► Tool Calls          │
              │                    │
              ▼                    │
       ┌──────────────────┐        │
       │ CoreToolScheduler│        │
       │  - Validates     │        │
       │  - Confirms      │        │
       │  - Executes      │        │
       │  - Schedules     │        │
       └─────┬────────────┘        │
             │                     │
             ▼                     │
       ┌──────────────┐            │
       │ Tool Results │            │
       └─────┬────────┘            │
             │                     │
             └──────► Back to      │
                     GeminiChat ◄──┘
                         │
                         ▼
                   ┌──────────┐
                   │   User   │
                   └──────────┘
```

---

## 2. Module Interaction Diagrams

### 2.1 CLI, Core, and Services Interaction

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         PACKAGES STRUCTURE                              │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  @google/gemini-cli (CLI Package)                               │  │
│  │                                                                  │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐    │  │
│  │  │  UI Components │  │    Services    │  │   Commands     │    │  │
│  │  │  (Ink/React)   │  │                │  │                │    │  │
│  │  │                │  │ - Command      │  │ - Extensions   │    │  │
│  │  │ - App.tsx      │  │   Service      │  │ - MCP          │    │  │
│  │  │ - Layouts      │  │ - Prompt       │  │ - Builtin      │    │  │
│  │  │ - Components   │  │   Processors   │  │                │    │  │
│  │  │ - Hooks        │  │ - File Loader  │  │                │    │  │
│  │  └────────┬───────┘  └────────┬───────┘  └────────┬───────┘    │  │
│  │           │                   │                    │            │  │
│  │           └───────────────────┼────────────────────┘            │  │
│  │                               │                                 │  │
│  │           ┌───────────────────▼───────────────────┐             │  │
│  │           │  nonInteractiveCli.ts                 │             │  │
│  │           │  - Direct execution without UI        │             │  │
│  │           └───────────────────┬───────────────────┘             │  │
│  └───────────────────────────────┼─────────────────────────────────┘  │
│                                  │                                    │
│                    Uses Core API │                                    │
│  ┌───────────────────────────────▼─────────────────────────────────┐  │
│  │  @google/gemini-cli-core (Core Package)                         │  │
│  │                                                                  │  │
│  │  ┌──────────────────────────────────────────────────────────┐   │  │
│  │  │                    Core Systems                          │   │  │
│  │  │                                                          │   │  │
│  │  │  ┌─────────────────┐  ┌──────────────────┐             │   │  │
│  │  │  │  GeminiClient   │  │  GeminiChat      │             │   │  │
│  │  │  │  (Controller)   │  │  (Chat State)    │             │   │  │
│  │  │  └────────┬────────┘  └────────┬─────────┘             │   │  │
│  │  │           │                    │                        │   │  │
│  │  │           └────────────────────┘                        │   │  │
│  │  │                    │                                    │   │  │
│  │  │           ┌────────▼────────┐                           │   │  │
│  │  │           │  Turn           │                           │   │  │
│  │  │           │  (Execution)    │                           │   │  │
│  │  │           └─────────────────┘                           │   │  │
│  │  └──────────────────────────────────────────────────────────┘   │  │
│  │                                                                  │  │
│  │  ┌──────────────────────────────────────────────────────────┐   │  │
│  │  │                   Tool System                            │   │  │
│  │  │                                                          │   │  │
│  │  │  ┌──────────────────┐  ┌──────────────────┐            │   │  │
│  │  │  │ CoreToolScheduler│  │  ToolRegistry    │            │   │  │
│  │  │  │                  │  │                  │            │   │  │
│  │  │  │ - Validates      │◄─┤ - Read File     │            │   │  │
│  │  │  │ - Confirms       │  │ - Write File    │            │   │  │
│  │  │  │ - Executes       │  │ - Shell         │            │   │  │
│  │  │  │ - Queues         │  │ - Grep/Glob     │            │   │  │
│  │  │  └──────────────────┘  │ - Web Search    │            │   │  │
│  │  │                        │ - MCP Tools     │            │   │  │
│  │  │                        └──────────────────┘            │   │  │
│  │  └──────────────────────────────────────────────────────────┘   │  │
│  │                                                                  │  │
│  │  ┌──────────────────────────────────────────────────────────┐   │  │
│  │  │                  Policy & Security                       │   │  │
│  │  │                                                          │   │  │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │  │
│  │  │  │PolicyEngine  │  │MessageBus    │  │Confirmation  │  │   │  │
│  │  │  │(Rules)       │  │(Events)      │  │Bus (Coord)   │  │   │  │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘  │   │  │
│  │  └──────────────────────────────────────────────────────────┘   │  │
│  │                                                                  │  │
│  │  ┌──────────────────────────────────────────────────────────┐   │  │
│  │  │                     Services                             │   │  │
│  │  │                                                          │   │  │
│  │  │  ┌─────────────────┐  ┌──────────────────┐             │   │  │
│  │  │  │ Agent Executor  │  │ Compression Svc  │             │   │  │
│  │  │  └─────────────────┘  └──────────────────┘             │   │  │
│  │  │  ┌─────────────────┐  ┌──────────────────┐             │   │  │
│  │  │  │  Loop Detection │  │ Model Router     │             │   │  │
│  │  │  └─────────────────┘  └──────────────────┘             │   │  │
│  │  │  ┌─────────────────┐  ┌──────────────────┐             │   │  │
│  │  │  │ FileSystem Svc  │  │  Telemetry Svc   │             │   │  │
│  │  │  └─────────────────┘  └──────────────────┘             │   │  │
│  │  └──────────────────────────────────────────────────────────┘   │  │
│  │                                                                  │  │
│  │  ┌──────────────────────────────────────────────────────────┐   │  │
│  │  │               External Integrations                      │   │  │
│  │  │                                                          │   │  │
│  │  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │  │
│  │  │  │  MCP Client  │  │  IDE Client  │  │ Code Assist  │  │   │  │
│  │  │  │ (Servers)    │  │ (VSCode/Zed) │  │ (OAuth)      │  │   │  │
│  │  │  └──────────────┘  └──────────────┘  └──────────────┘  │   │  │
│  │  └──────────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ┌──────────────────────────────────────────────────────────────────┐  │
│  │  @google/genai (External API Client)                            │  │
│  │  - GenerateContent API                                           │  │
│  │  - Streaming Support                                             │  │
│  └──────────────────────────────────────────────────────────────────┘  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Tool Execution Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                      TOOL EXECUTION FLOW                               │
└────────────────────────────────────────────────────────────────────────┘

┌──────────────┐
│ Model Returns│
│  Tool Call   │
└──────┬───────┘
       │ FunctionCall { name, args, id }
       ▼
┌─────────────────────────────────────────────────┐
│          CoreToolScheduler.schedule()           │
│  Creates ToolCallRequestInfo                    │
└──────┬──────────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────────────────┐
│    State: VALIDATING                            │
│  - Lookup tool in ToolRegistry                  │
│  - Build tool invocation from args              │
│  - Check if tool exists                         │
└──────┬──────────────────────────────────────────┘
       │
       ├─── Tool Not Found ───► ERROR State
       │
       ├─── Invalid Args ─────► ERROR State
       │
       ▼
┌─────────────────────────────────────────────────┐
│  invocation.shouldConfirmExecute()              │
│  - Checks PolicyEngine                          │
│  - Evaluates approval mode (YOLO/ALWAYS)        │
│  - Checks allow list                            │
└──────┬──────────────────────────────────────────┘
       │
       ├─── No Confirmation Needed ───┐
       │                              │
       ▼                              │
┌─────────────────────┐               │
│ State: AWAITING_    │               │
│ APPROVAL            │               │
│                     │               │
│ User Decision:      │               │
│  - ProceedOnce      │───────────────┤
│  - ProceedAlways    │───────────────┤
│  - ModifyWithEditor │──┐            │
│  - Cancel           │  │            │
└──────┬──────────────┘  │            │
       │                 │            │
       │ Cancel          │            │
       ▼                 │            │
┌─────────────────┐      │            │
│ State: CANCELLED│      │            │
│ (with error msg)│      │            │
└─────────────────┘      │            │
                         │            │
                    ┌────▼─────┐      │
                    │ Modify   │      │
                    │ Tool Args│      │
                    │ in Editor│      │
                    └────┬─────┘      │
                         │            │
                         └────────────┤
                                      │
                                      ▼
                            ┌──────────────────┐
                            │ State: SCHEDULED │
                            └────────┬─────────┘
                                     │
                                     ▼
                            ┌──────────────────────────┐
                            │ State: EXECUTING         │
                            │                          │
                            │ invocation.execute()     │
                            │  - Run tool logic        │
                            │  - Stream live output    │
                            │  - Handle signals        │
                            └────────┬─────────────────┘
                                     │
                            ┌────────┴─────────┐
                            │                  │
                            ▼                  ▼
                    ┌────────────────┐  ┌─────────────┐
                    │ State: SUCCESS │  │State: ERROR │
                    │                │  │             │
                    │ ToolResult     │  │ Error Info  │
                    │ - llmContent   │  │ - message   │
                    │ - returnDisplay│  │ - type      │
                    └────────┬───────┘  └──────┬──────┘
                             │                 │
                             └────────┬────────┘
                                      │
                                      ▼
                         ┌───────────────────────────┐
                         │  Convert to Function      │
                         │  Response Parts           │
                         │  - Send back to model     │
                         └───────────────────────────┘

State Transitions Summary:
  VALIDATING → SCHEDULED (auto-approved)
  VALIDATING → AWAITING_APPROVAL (needs confirmation)
  VALIDATING → ERROR (validation failed)
  AWAITING_APPROVAL → SCHEDULED (approved)
  AWAITING_APPROVAL → CANCELLED (rejected)
  AWAITING_APPROVAL → AWAITING_APPROVAL (modified)
  SCHEDULED → EXECUTING (ready to run)
  EXECUTING → SUCCESS (completed successfully)
  EXECUTING → ERROR (execution failed)
  EXECUTING → CANCELLED (user interrupted)
```

### 2.3 Agent Execution Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│                        AGENT EXECUTION FLOW                            │
└────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────┐
                              │ User invokes │
                              │  Agent Tool  │
                              └──────┬───────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │  AgentExecutor.create()        │
                    │  - Load agent definition       │
                    │  - Create isolated ToolRegistry│
                    │  - Validate non-interactive    │
                    └────────┬───────────────────────┘
                             │
                             ▼
                    ┌────────────────────────────────┐
                    │  AgentExecutor.execute()       │
                    │  - Initialize GeminiChat       │
                    │  - Build system prompt         │
                    │  - Add complete_task tool      │
                    └────────┬───────────────────────┘
                             │
                             ▼
              ┌──────────────────────────────────────────┐
              │        AGENT TURN LOOP                   │
              │  (Max iterations: 50)                    │
              └──────────────┬───────────────────────────┘
                             │
                ┌────────────▼───────────────┐
                │  Send message to model     │
                │  with agent context        │
                └────────┬───────────────────┘
                         │
            ┌────────────▼──────────────┐
            │  Process model response   │
            └────────┬──────────────────┘
                     │
        ┌────────────┴────────────┐
        │                         │
        ▼                         ▼
┌───────────────┐      ┌──────────────────────┐
│  Text Only    │      │  Tool Call(s)        │
│  (Continue)   │      └──────┬───────────────┘
└───────────────┘             │
                              │
                    ┌─────────▼──────────┐
                    │ Is complete_task?  │
                    └─────────┬──────────┘
                              │
                    ┌─────────┴──────────┐
                    │                    │
                    ▼                    ▼
            ┌───────────────┐    ┌──────────────────┐
            │  YES: Extract │    │  NO: Execute     │
            │  final result │    │  tool normally   │
            │               │    │                  │
            │  STOP AGENT   │    │  Add result to   │
            └───────────────┘    │  history         │
                                 │                  │
                                 │  Continue loop   │
                                 └──────────────────┘

Agent Termination Modes:

1. ┌─────────────────────────────┐
   │  COMPLETE_TASK_CALLED       │
   │  - Agent called complete    │
   │  - Extract output object    │
   │  - Return to parent         │
   └─────────────────────────────┘

2. ┌─────────────────────────────┐
   │  MAX_ITERATIONS_EXCEEDED    │
   │  - Hit iteration limit (50) │
   │  - Collect partial results  │
   │  - Return incomplete marker │
   └─────────────────────────────┘

3. ┌─────────────────────────────┐
   │  ERROR                      │
   │  - Tool execution failed    │
   │  - API error occurred       │
   │  - Return error info        │
   └─────────────────────────────┘

4. ┌─────────────────────────────┐
   │  CANCELLED                  │
   │  - User cancelled (Ctrl+C)  │
   │  - Abort signal triggered   │
   │  - Clean shutdown           │
   └─────────────────────────────┘

Activity Events (Reported to Parent):
  - AgentThinking (model reasoning)
  - AgentToolUse (tool execution)
  - AgentOutput (final result)
  - AgentError (failure)
```

### 2.4 Confirmation/Policy Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│               CONFIRMATION & POLICY DECISION FLOW                      │
└────────────────────────────────────────────────────────────────────────┘

                        ┌──────────────────┐
                        │ Tool Call Request│
                        └────────┬─────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │  PolicyEngine.check()  │
                    │  - Match against rules │
                    │  - Check tool name     │
                    │  - Check args pattern  │
                    │  - Apply priority      │
                    └────────┬───────────────┘
                             │
                             │ Returns PolicyDecision
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
        ▼                    ▼                    ▼
┌───────────────┐   ┌────────────────┐   ┌──────────────┐
│  ALLOW_ONCE   │   │  ALLOW_ALWAYS  │   │   ASK_USER   │
└───────┬───────┘   └────────┬───────┘   └──────┬───────┘
        │                    │                   │
        │                    │                   ▼
        │                    │          ┌─────────────────────┐
        │                    │          │  MessageBus Publish │
        │                    │          │  Confirmation Req   │
        │                    │          └─────────┬───────────┘
        │                    │                    │
        │                    │                    ▼
        │                    │          ┌──────────────────────────┐
        │                    │          │ Interactive Mode:        │
        │                    │          │  Show confirmation UI    │
        │                    │          │                          │
        │                    │          │ Non-Interactive Mode:    │
        │                    │          │  Return error (blocked)  │
        │                    │          └─────────┬────────────────┘
        │                    │                    │
        │                    │                    │ User Response
        │                    │                    │
        │                    │          ┌─────────▼────────────┐
        │                    │          │  User Decision:      │
        │                    │          │  - Approve           │
        │                    │          │  - Reject            │
        │                    │          │  - Modify            │
        │                    │          │  - Always Allow      │
        │                    │          └─────────┬────────────┘
        │                    │                    │
        └────────────────────┴────────────────────┘
                                      │
                                      ▼
                            ┌──────────────────────┐
                            │ Tool State Transition│
                            │ AWAITING_APPROVAL    │
                            │      → SCHEDULED     │
                            │      or CANCELLED    │
                            └──────────────────────┘

Policy Rule Structure:
┌────────────────────────────────────────────────────────┐
│  {                                                     │
│    toolName: "shell__run_shell_command",              │
│    argsPattern: /git status/,                         │
│    decision: PolicyDecision.ALLOW_ALWAYS,             │
│    priority: 100                                      │
│  }                                                     │
└────────────────────────────────────────────────────────┘

Approval Modes:
┌─────────────┬──────────────────────────────────────────┐
│    Mode     │              Behavior                    │
├─────────────┼──────────────────────────────────────────┤
│    YOLO     │  Auto-approve everything                 │
│             │  (No confirmations)                      │
├─────────────┼──────────────────────────────────────────┤
│   ALWAYS    │  Confirm based on policies               │
│             │  (Default mode)                          │
├─────────────┼──────────────────────────────────────────┤
│ Allow List  │  Auto-approve specific tools/patterns    │
│             │  Others require confirmation             │
└─────────────┴──────────────────────────────────────────┘

MessageBus Event Flow:
┌──────────────────────┐
│ PolicyEngine decides │
│   ASK_USER           │
└─────────┬────────────┘
          │
          ▼
┌───────────────────────────────────────┐
│ Publish: TOOL_CONFIRMATION_REQUEST    │
│  {                                    │
│    correlationId: "uuid",             │
│    toolCall: {...},                   │
│    details: {...}                     │
│  }                                    │
└─────────┬─────────────────────────────┘
          │
          ▼
┌───────────────────────────────────────┐
│ UI/Handler Subscribes                 │
│  - Show confirmation dialog           │
│  - Wait for user input                │
└─────────┬─────────────────────────────┘
          │
          ▼
┌───────────────────────────────────────┐
│ Publish: TOOL_CONFIRMATION_RESPONSE   │
│  {                                    │
│    correlationId: "uuid",             │
│    confirmed: true/false,             │
│    outcome: ConfirmationOutcome       │
│  }                                    │
└───────────────────────────────────────┘
```

---

## 3. State Machine Diagrams

### 3.1 Tool Call State Machine

```
┌────────────────────────────────────────────────────────────────────────┐
│                    TOOL CALL STATE MACHINE                             │
└────────────────────────────────────────────────────────────────────────┘

                        ┌──────────────┐
                        │   [START]    │
                        └──────┬───────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │    VALIDATING      │
                    │                    │
                    │ • Lookup tool      │
                    │ • Build invocation │
                    │ • Validate params  │
                    └────────┬───────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
      ┌──────────┐   ┌──────────────┐   ┌─────────┐
      │  ERROR   │   │   AWAITING   │   │SCHEDULED│
      │          │   │   APPROVAL   │   │         │
      │ Invalid  │   │              │   │Auto     │
      │ params   │   │ User review  │   │approved │
      └────┬─────┘   └──────┬───────┘   └────┬────┘
           │                │                 │
           │         ┌──────┴──────┐          │
           │         │             │          │
           │         ▼             ▼          │
           │   ┌───────────┐  ┌─────────┐    │
           │   │ CANCELLED │  │SCHEDULED│    │
           │   │           │  │         │    │
           │   │User reject│  │Approved │    │
           │   └─────┬─────┘  └────┬────┘    │
           │         │             │          │
           │         │             └──────────┤
           │         │                        │
           │         │                        ▼
           │         │              ┌──────────────────┐
           │         │              │    EXECUTING     │
           │         │              │                  │
           │         │              │ • Run tool logic │
           │         │              │ • Stream output  │
           │         │              └────────┬─────────┘
           │         │                       │
           │         │           ┌───────────┼───────────┐
           │         │           │           │           │
           │         │           ▼           ▼           ▼
           │         │      ┌─────────┐ ┌────────┐ ┌─────────┐
           │         │      │ SUCCESS │ │ ERROR  │ │CANCELLED│
           │         │      │         │ │        │ │         │
           │         │      │Result OK│ │Failed  │ │Aborted  │
           │         │      └────┬────┘ └───┬────┘ └────┬────┘
           │         │           │          │           │
           └─────────┴───────────┴──────────┴───────────┘
                                 │
                                 ▼
                          ┌─────────────┐
                          │    [END]    │
                          │ Terminal    │
                          │ State       │
                          └─────────────┘

Terminal States (Final):
  • SUCCESS   - Tool executed successfully
  • ERROR     - Validation or execution error
  • CANCELLED - User cancelled operation

Transient States (Intermediate):
  • VALIDATING       - Checking tool and params
  • AWAITING_APPROVAL - Waiting for user confirmation
  • SCHEDULED        - Ready to execute
  • EXECUTING        - Currently running
```

### 3.2 Agent Lifecycle State Machine

```
┌────────────────────────────────────────────────────────────────────────┐
│                   AGENT LIFECYCLE STATE MACHINE                        │
└────────────────────────────────────────────────────────────────────────┘

                        ┌──────────────┐
                        │ [INVOKED]    │
                        │ Tool called  │
                        └──────┬───────┘
                               │
                               ▼
                    ┌────────────────────┐
                    │  INITIALIZING      │
                    │                    │
                    │ • Load definition  │
                    │ • Build registry   │
                    │ • Validate tools   │
                    │ • Create chat      │
                    └────────┬───────────┘
                             │
                             ▼
                    ┌────────────────────┐
                    │    RUNNING         │◄────────┐
                    │                    │         │
                    │ • Send message     │         │
                    │ • Process response │         │
                    │ • Check completion │         │
                    └────────┬───────────┘         │
                             │                     │
              ┌──────────────┼──────────────┐      │
              │              │              │      │
              ▼              ▼              ▼      │
     ┌─────────────┐  ┌────────────┐  ┌──────────┐│
     │ TOOL_CALL   │  │ THINKING   │  │TEXT_ONLY ││
     │             │  │            │  │          ││
     │Execute tool │  │Model       │  │Continue  ││
     └──────┬──────┘  │reasoning   │  │loop      ││
            │         └────────────┘  └────┬─────┘│
            │                              │      │
            │                              └──────┘
            │
     ┌──────▼──────────┐
     │ Is complete_task│
     │ tool called?    │
     └──────┬──────────┘
            │
      ┌─────┴─────┐
      │           │
      ▼           ▼
   ┌──────┐   ┌────────────────────┐
   │ YES  │   │ NO - Continue Loop │
   └──┬───┘   └──────────┬─────────┘
      │                  │
      │                  └─────────► RUNNING (next turn)
      │
      ▼
┌──────────────────┐
│   COMPLETING     │
│                  │
│ • Extract result │
│ • Validate schema│
│ • Prepare output │
└────────┬─────────┘
         │
         ▼
┌──────────────────────────────────────────┐
│          TERMINATED                      │
│                                          │
│ Reasons:                                 │
│  ┌────────────────────────────────┐      │
│  │ COMPLETE_TASK_CALLED           │      │
│  │ - Normal completion            │      │
│  │ - Result extracted             │      │
│  └────────────────────────────────┘      │
│                                          │
│  ┌────────────────────────────────┐      │
│  │ MAX_ITERATIONS_EXCEEDED        │      │
│  │ - Hit iteration limit          │      │
│  │ - Partial results returned     │      │
│  └────────────────────────────────┘      │
│                                          │
│  ┌────────────────────────────────┐      │
│  │ ERROR                          │      │
│  │ - Tool execution failed        │      │
│  │ - Schema validation failed     │      │
│  └────────────────────────────────┘      │
│                                          │
│  ┌────────────────────────────────┐      │
│  │ CANCELLED                      │      │
│  │ - User aborted (signal)        │      │
│  │ - External cancellation        │      │
│  └────────────────────────────────┘      │
└──────────────────────────────────────────┘

Iteration Counter:
  ┌────────────────────┐
  │ turn_count = 0     │
  └────────┬───────────┘
           │
  ┌────────▼───────────┐
  │ turn_count++       │◄─── Each RUNNING iteration
  └────────┬───────────┘
           │
  ┌────────▼───────────┐
  │ turn_count >= 50?  │
  └────────┬───────────┘
           │
      ┌────┴────┐
      ▼         ▼
    YES        NO
      │         │
      │         └──► Continue
      │
      ▼
  TERMINATED
  (MAX_ITERATIONS)
```

### 3.3 Chat Session State Machine

```
┌────────────────────────────────────────────────────────────────────────┐
│                  CHAT SESSION STATE MACHINE                            │
└────────────────────────────────────────────────────────────────────────┘

                        ┌──────────────┐
                        │ [NEW SESSION]│
                        └──────┬───────┘
                               │
                ┌──────────────┴──────────────┐
                │                             │
                ▼                             ▼
      ┌──────────────────┐         ┌──────────────────┐
      │ INITIALIZING     │         │ RESUMING         │
      │                  │         │                  │
      │ • Fresh start    │         │ • Load history   │
      │ • Empty history  │         │ • Restore state  │
      │ • System prompt  │         │ • Resume session │
      └────────┬─────────┘         └────────┬─────────┘
               │                            │
               └───────────┬────────────────┘
                           │
                           ▼
                  ┌─────────────────┐
                  │   READY         │
                  │                 │
                  │ Awaiting input  │
                  └────────┬────────┘
                           │
                           │ User sends message
                           ▼
                  ┌─────────────────┐
                  │  PROCESSING     │◄────────┐
                  │                 │         │
                  │ • Send to API   │         │
                  │ • Stream chunks │         │
                  │ • Parse response│         │
                  └────────┬────────┘         │
                           │                  │
          ┌────────────────┼────────────────┐ │
          │                │                │ │
          ▼                ▼                ▼ │
  ┌──────────────┐ ┌──────────────┐ ┌────────────┐
  │STREAMING_TEXT│ │TOOL_EXECUTION│ │   ERROR    │
  │              │ │              │ │            │
  │Show response │ │Execute tools │ │Handle error│
  └──────┬───────┘ └──────┬───────┘ └──────┬─────┘
         │                │                │
         │                │                │
         └────────┬───────┴────────────────┘
                  │
          ┌───────▼─────────┐
          │ Check Loop      │
          │ Detection       │
          └───────┬─────────┘
                  │
          ┌───────┴────────┐
          │                │
          ▼                ▼
    ┌─────────┐      ┌──────────┐
    │Loop     │      │No Loop   │
    │Detected │      │          │
    └────┬────┘      └────┬─────┘
         │                │
         │                ▼
         │         ┌────────────────┐
         │         │ Check Context  │
         │         │ Window         │
         │         └────────┬───────┘
         │                  │
         │          ┌───────┴────────┐
         │          │                │
         │          ▼                ▼
         │    ┌──────────┐    ┌────────────┐
         │    │Overflow  │    │Space OK    │
         │    │Detected  │    │            │
         │    └────┬─────┘    └──────┬─────┘
         │         │                 │
         │         ▼                 │
         │    ┌──────────────┐       │
         │    │ Compress?    │       │
         │    └────┬─────────┘       │
         │         │                 │
         │    ┌────┴────┐            │
         │    ▼         ▼            │
         │ ┌──────┐ ┌───────┐        │
         │ │ YES  │ │  NO   │        │
         │ └──┬───┘ └───┬───┘        │
         │    │         │            │
         │    ▼         │            │
         │ ┌────────┐   │            │
         │ │Compress│   │            │
         │ │History │   │            │
         │ └───┬────┘   │            │
         │     │        │            │
         │     └────┬───┘            │
         │          │                │
         │          ▼                │
         │   ┌────────────┐          │
         │   │  READY     │◄─────────┘
         │   │            │
         │   │Next turn   │
         │   └────────────┘
         │
         ▼
   ┌──────────────┐
   │  STOPPED     │
   │              │
   │ • Loop limit │
   │ • Max turns  │
   │ • User quit  │
   └──────────────┘

Compression States:
┌─────────────────────────────────────┐
│ CompressionStatus.NOT_NEEDED        │
│ - Token count under threshold       │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ CompressionStatus.COMPRESSED        │
│ - Successfully compressed history   │
│ - Reset chat with summary           │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ CompressionStatus.COMPRESSION_      │
│   FAILED_INFLATED_TOKEN_COUNT       │
│ - Compression made it worse         │
│ - Continue with original history    │
└─────────────────────────────────────┘
```

---

## 4. Sequence Diagrams

### 4.1 Interactive Mode User Prompt Sequence

```
┌────────────────────────────────────────────────────────────────────────┐
│              INTERACTIVE MODE - USER PROMPT SEQUENCE                   │
└────────────────────────────────────────────────────────────────────────┘

User         UI (Ink)      App         GeminiClient   GeminiChat    API
 │             │            │               │             │          │
 │ Type prompt │            │               │             │          │
 ├────────────►│            │               │             │          │
 │             │            │               │             │          │
 │             │ Process @  │               │             │          │
 │             │  commands  │               │             │          │
 │             ├───────────►│               │             │          │
 │             │            │               │             │          │
 │             │◄───────────┤               │             │          │
 │             │ Parts[]    │               │             │          │
 │             │            │               │             │          │
 │ Press Enter │            │               │             │          │
 ├────────────►│            │               │             │          │
 │             │            │               │             │          │
 │             │ sendMessage│               │             │          │
 │             ├───────────►│               │             │          │
 │             │            │               │             │          │
 │             │            │sendMessageStream            │          │
 │             │            ├──────────────►│             │          │
 │             │            │               │             │          │
 │             │            │               │sendMessageStream       │
 │             │            │               ├────────────►│          │
 │             │            │               │             │          │
 │             │            │               │             │generateContentStream
 │             │            │               │             ├─────────►│
 │             │            │               │             │          │
 │             │            │               │             │◄─────────┤
 │             │            │               │             │ Stream   │
 │◄────────────┼────────────┼───────────────┼─────────────┤          │
 │ Display     │ Render     │ Stream Events │             │          │
 │ chunks      │ chunks     │               │             │          │
 │             │            │               │             │          │
 │             │            │               │ Model wants │          │
 │             │            │               │ tool call   │          │
 │             │            │◄──────────────┤             │          │
 │             │            │ToolCallRequest│             │          │
 │             │            │               │             │          │
 │             │            │ schedule()    │             │          │
 │             │            ├──────────────────────────┐  │          │
 │             │            │               │          │  │          │
 │             │            │               │    ┌─────▼──────────┐  │
 │             │            │               │    │CoreToolScheduler│ │
 │             │            │               │    │                │  │
 │             │◄───────────┼───────────────┼────┤  Validate      │  │
 │ Show tool   │            │               │    │  Confirm       │  │
 │ confirmation│            │               │    │  Execute       │  │
 ├────────────►│            │               │    └────────┬───────┘  │
 │ Approve     │            │               │             │          │
 │             │            │               │             │execute() │
 │             │            │               │             ├─────────┐│
 │             │            │               │             │         ││
 │◄────────────┼────────────┼───────────────┼─────────────┤         ││
 │ Show live   │ Stream     │ Output events │             │◄────────┘│
 │ output      │ output     │               │             │ result   │
 │             │            │               │             │          │
 │             │            │◄──────────────┼─────────────┤          │
 │             │            │ToolResponse   │             │          │
 │             │            │               │             │          │
 │             │            │ Add to history│             │          │
 │             │            ├──────────────►│             │          │
 │             │            │               │             │          │
 │             │            │               │ Send result │          │
 │             │            │               ├────────────►│          │
 │             │            │               │             │          │
 │             │            │               │             │ API call │
 │             │            │               │             ├─────────►│
 │             │            │               │             │          │
 │             │            │               │             │◄─────────┤
 │             │            │               │             │ Response │
 │◄────────────┼────────────┼───────────────┼─────────────┤          │
 │ Final       │ Render     │ Final text    │             │          │
 │ response    │ complete   │               │             │          │
 │             │            │               │             │          │
```

### 4.2 Non-Interactive Mode Sequence

```
┌────────────────────────────────────────────────────────────────────────┐
│            NON-INTERACTIVE MODE - EXECUTION SEQUENCE                   │
└────────────────────────────────────────────────────────────────────────┘

CLI Args    nonInteractiveCli  GeminiClient  CoreToolScheduler    API
  │               │                 │                │             │
  │ gemini "query"│                 │                │             │
  ├──────────────►│                 │                │             │
  │               │                 │                │             │
  │               │ Parse args      │                │             │
  │               │ Process @files  │                │             │
  │               │                 │                │             │
  │               │ sendMessageStream                │             │
  │               ├────────────────►│                │             │
  │               │                 │                │             │
  │               │                 │ API call       │             │
  │               │                 ├────────────────┼────────────►│
  │               │                 │                │             │
  │               │                 │◄───────────────┼─────────────┤
  │               │                 │ Stream chunks  │             │
  │               │◄────────────────┤                │             │
  │               │ Content events  │                │             │
  │               │                 │                │             │
stdout◄───────────┤                 │                │             │
  │  Write chunks │                 │                │             │
  │               │                 │                │             │
  │               │◄────────────────┤                │             │
  │               │ ToolCallRequest │                │             │
  │               │                 │                │             │
  │               │ executeToolCall │                │             │
  │               ├─────────────────┼───────────────►│             │
  │               │                 │                │             │
  │               │                 │                │ Run tool    │
  │               │                 │                │ (no confirm)│
  │               │                 │                │             │
  │               │◄────────────────┼────────────────┤             │
  │               │ Tool response   │                │             │
  │               │                 │                │             │
  │               │ Send to model   │                │             │
  │               ├────────────────►│                │             │
  │               │                 │                │             │
  │               │                 │ API call       │             │
  │               │                 ├────────────────┼────────────►│
  │               │                 │                │             │
  │               │                 │◄───────────────┼─────────────┤
  │               │◄────────────────┤                │             │
stdout◄───────────┤ Final response  │                │             │
  │               │                 │                │             │
  │               │ exit(0)         │                │             │
  └───────────────┘                 │                │             │

Key Differences from Interactive:
1. No UI rendering (direct stdout)
2. No user confirmations (auto-approve based on policy)
3. Linear flow (no event loop)
4. Exit after completion
5. JSON output mode support
```

### 4.3 Tool Call with Confirmation Sequence

```
┌────────────────────────────────────────────────────────────────────────┐
│           TOOL CALL WITH CONFIRMATION - DETAILED SEQUENCE              │
└────────────────────────────────────────────────────────────────────────┘

Model    GeminiChat  CoreToolScheduler  PolicyEngine  MessageBus   UI
 │           │              │                 │            │         │
 │ Function  │              │                 │            │         │
 │ Call      │              │                 │            │         │
 ├──────────►│              │                 │            │         │
 │           │              │                 │            │         │
 │           │ schedule()   │                 │            │         │
 │           ├─────────────►│                 │            │         │
 │           │              │                 │            │         │
 │           │              │ VALIDATING      │            │         │
 │           │              │ state           │            │         │
 │           │              │                 │            │         │
 │           │              │ shouldConfirm   │            │         │
 │           │              │ Execute()       │            │         │
 │           │              ├────────────┐    │            │         │
 │           │              │            │    │            │         │
 │           │              │ Build      │    │            │         │
 │           │              │ invocation │    │            │         │
 │           │              │◄───────────┘    │            │         │
 │           │              │                 │            │         │
 │           │              │ check()         │            │         │
 │           │              ├────────────────►│            │         │
 │           │              │                 │            │         │
 │           │              │                 │ Match rules│         │
 │           │              │                 │ Check args │         │
 │           │              │                 │            │         │
 │           │              │◄────────────────┤            │         │
 │           │              │ ASK_USER        │            │         │
 │           │              │                 │            │         │
 │           │              │ AWAITING_APPROVAL           │         │
 │           │              │ state           │            │         │
 │           │              │                 │            │         │
 │           │              │ Publish request │            │         │
 │           │              ├────────────────────────────►│         │
 │           │              │                 │            │         │
 │           │              │                 │            │ notify  │
 │           │              │                 │            ├────────►│
 │           │              │                 │            │         │
 │           │              │                 │            │         │ User
 │           │              │                 │            │         │ Reviews
 │           │              │                 │            │◄────────┤
 │           │              │                 │            │ Approve │
 │           │              │                 │            │         │
 │           │              │◄────────────────┼────────────┤         │
 │           │              │ Publish response│            │         │
 │           │              │ confirmed:true  │            │         │
 │           │              │                 │            │         │
 │           │              │ handleConfirm   │            │         │
 │           │              │ Response()      │            │         │
 │           │              │                 │            │         │
 │           │              │ SCHEDULED state │            │         │
 │           │              │                 │            │         │
 │           │              │ EXECUTING state │            │         │
 │           │              │                 │            │         │
 │           │              │ execute()       │            │         │
 │           │              ├────────────┐    │            │         │
 │           │              │            │    │            │         │
 │           │              │ Run tool   │    │            │         │
 │           │              │ logic      │    │            │         │
 │           │              │◄───────────┘    │            │         │
 │           │              │                 │            │         │
 │           │              │ SUCCESS state   │            │         │
 │           │              │ (ToolResult)    │            │         │
 │           │              │                 │            │         │
 │           │◄─────────────┤                 │            │         │
 │           │ Function     │                 │            │         │
 │           │ Response     │                 │            │         │
 │           │              │                 │            │         │
 │ Continue  │              │                 │            │         │
 │◄──────────┤              │                 │            │         │
 │ generation│              │                 │            │         │

Rejection Flow (if user cancels):
                                      User
                                     Clicks
                                     Cancel
                                       │
                                       ▼
                           ┌───────────────────┐
                           │ CANCELLED state   │
                           │                   │
                           │ Error response    │
                           │ sent to model     │
                           └───────────────────┘
```

### 4.4 Agent Execution Sequence

```
┌────────────────────────────────────────────────────────────────────────┐
│                  AGENT EXECUTION - FULL SEQUENCE                       │
└────────────────────────────────────────────────────────────────────────┘

User  ToolScheduler  AgentExecutor  GeminiChat  ToolRegistry  API
 │         │              │              │            │         │
 │ Call    │              │              │            │         │
 │ Agent   │              │              │            │         │
 │ Tool    │              │              │            │         │
 ├────────►│              │              │            │         │
 │         │              │              │            │         │
 │         │ schedule()   │              │            │         │
 │         ├─────────────►│              │            │         │
 │         │              │              │            │         │
 │         │              │ create()     │            │         │
 │         │              ├─────────┐    │            │         │
 │         │              │         │    │            │         │
 │         │              │ Load    │    │            │         │
 │         │              │ definition   │            │         │
 │         │              │         │    │            │         │
 │         │              │ Build   │    │            │         │
 │         │              │ isolated│    │            │         │
 │         │              │ registry│    │            │         │
 │         │              │         │    │            │         │
 │         │              │◄────────┘    │            │         │
 │         │              │              │            │         │
 │         │              │ execute()    │            │         │
 │         │              ├─────────┐    │            │         │
 │         │              │         │    │            │         │
 │         │              │ Init    │    │            │         │
 │         │              │ GeminiChat   │            │         │
 │         │              │         ├───►│            │         │
 │         │              │◄────────┘    │            │         │
 │         │              │              │            │         │
 │         │              │ Build system │            │         │
 │         │              │ prompt       │            │         │
 │         │              │              │            │         │
 │         │              │ Add complete_│            │         │
 │         │              │ task tool    │            │         │
 │         │              │              │            │         │
 │         │              │╔════════════════════════════════════╗
 │         │              │║   AGENT TURN LOOP (Max 50)        ║
 │         │              │╚════════════════════════════════════╝
 │         │              │              │            │         │
 │         │              │ Send message │            │         │
 │         │              ├─────────────►│            │         │
 │         │              │              │            │         │
 │         │              │              │ API call   │         │
 │         │              │              ├────────────┼────────►│
 │         │              │              │            │         │
 │         │              │              │◄───────────┼─────────┤
 │         │              │              │ Response   │         │
 │         │              │◄─────────────┤            │         │
 │         │              │ Text/Tools   │            │         │
 │         │              │              │            │         │
 │         │              │╔═══════════════════════════════╗    │
 │         │              │║ If tool call:                 ║    │
 │         │              │╚═══════════════════════════════╝    │
 │         │              │              │            │         │
 │         │              │ Is complete_ │            │         │
 │         │              │ task?        │            │         │
 │         │              ├─────────┐    │            │         │
 │         │              │         │    │            │         │
 │         │              │ Check   │    │            │         │
 │         │              │ tool    │    │            │         │
 │         │              │ name    │    │            │         │
 │         │              │◄────────┘    │            │         │
 │         │              │              │            │         │
 │         │              │╔═══════════════════════════════╗    │
 │         │              │║ If YES - complete_task:       ║    │
 │         │              │╚═══════════════════════════════╝    │
 │         │              │              │            │         │
 │         │              │ Extract      │            │         │
 │         │              │ result       │            │         │
 │         │              ├────────┐     │            │         │
 │         │              │        │     │            │         │
 │         │              │ Validate     │            │         │
 │         │              │ schema  │    │            │         │
 │         │              │◄───────┘     │            │         │
 │         │              │              │            │         │
 │         │              │ TERMINATE    │            │         │
 │         │              │ (success)    │            │         │
 │         │              │              │            │         │
 │         │              │╔═══════════════════════════════╗    │
 │         │              │║ If NO - regular tool:         ║    │
 │         │              │╚═══════════════════════════════╝    │
 │         │              │              │            │         │
 │         │              │ executeToolCall            │         │
 │         │              ├────────────────────────────►│        │
 │         │              │              │            │         │
 │         │              │              │            │ Run tool│
 │         │              │              │            ├────────┐│
 │         │              │              │            │        ││
 │         │              │              │            │◄───────┘│
 │         │              │◄────────────────────────────┤        │
 │         │              │ Tool result  │            │         │
 │         │              │              │            │         │
 │         │              │ Add to       │            │         │
 │         │              │ history      │            │         │
 │         │              ├─────────────►│            │         │
 │         │              │              │            │         │
 │         │              │╔═══════════════════════════════╗    │
 │         │              │║ Continue loop (next turn)     ║    │
 │         │              │╚═══════════════════════════════╝    │
 │         │              │              │            │         │
 │         │              │ Check max    │            │         │
 │         │              │ iterations   │            │         │
 │         │              ├────────┐     │            │         │
 │         │              │        │     │            │         │
 │         │              │ Count  │     │            │         │
 │         │              │ >= 50? │     │            │         │
 │         │              │◄───────┘     │            │         │
 │         │              │              │            │         │
 │         │              │ If YES:      │            │         │
 │         │              │ TERMINATE    │            │         │
 │         │              │ (max iter)   │            │         │
 │         │              │              │            │         │
 │         │◄─────────────┤              │            │         │
 │         │ Agent result │              │            │         │
 │         │              │              │            │         │
 │◄────────┤              │              │            │         │
 │ Final   │              │              │            │         │
 │ output  │              │              │            │         │
```

---

## 5. Layer Architecture

### 5.1 Four-Layer Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   ████████████████████████████████████████████████████████████████████  │
│   █                      UI LAYER                                   █  │
│   █                                                                 █  │
│   █  ┌──────────────────────────────────────────────────────────┐  █  │
│   █  │           Interactive UI (Ink/React)                     │  █  │
│   █  │                                                           │  █  │
│   █  │  • App.tsx - Main application component                  │  █  │
│   █  │  • DefaultAppLayout / ScreenReaderAppLayout              │  █  │
│   █  │  • Components (Messages, ToolCalls, Confirmations)       │  █  │
│   █  │  • Hooks (useGeminiChat, useToolExecution, etc.)         │  █  │
│   █  │  • Contexts (UIState, Streaming, Settings)               │  █  │
│   █  │                                                           │  █  │
│   █  └──────────────────────────────────────────────────────────┘  █  │
│   █                                                                 █  │
│   █  ┌──────────────────────────────────────────────────────────┐  █  │
│   █  │      Non-Interactive (Direct I/O)                        │  █  │
│   █  │                                                           │  █  │
│   █  │  • nonInteractiveCli.ts - Command-line execution         │  █  │
│   █  │  • TextOutput - Direct stdout/stderr                     │  █  │
│   █  │  • JsonFormatter - Structured output                     │  █  │
│   █  │  • StreamJsonFormatter - Streaming JSON                  │  █  │
│   █  │                                                           │  █  │
│   █  └──────────────────────────────────────────────────────────┘  █  │
│   █                                                                 █  │
│   ████████████████████████████████████████████████████████████████████  │
│                                  │                                      │
│                                  │ User requests, command execution     │
│                                  ▼                                      │
│   ████████████████████████████████████████████████████████████████████  │
│   █                  APPLICATION LAYER                              █  │
│   █                                                                 █  │
│   █  ┌────────────────────────────────────────────────────────┐    █  │
│   █  │          Command & Prompt Processing                   │    █  │
│   █  │                                                         │    █  │
│   █  │  • CommandService - Slash command routing              │    █  │
│   █  │  • BuiltinCommandLoader - Built-in commands            │    █  │
│   █  │  • FileCommandLoader - Custom commands                 │    █  │
│   █  │  • McpPromptLoader - MCP prompts                       │    █  │
│   █  │  • Prompt Processors:                                  │    █  │
│   █  │    - atFileProcessor - @file inclusion                 │    █  │
│   █  │    - shellProcessor - $(command) expansion             │    █  │
│   █  │    - argumentProcessor - Argument handling             │    █  │
│   █  │                                                         │    █  │
│   █  └────────────────────────────────────────────────────────┘    █  │
│   █                                                                 █  │
│   █  ┌────────────────────────────────────────────────────────┐    █  │
│   █  │              Session Management                        │    █  │
│   █  │                                                         │    █  │
│   █  │  • Settings Management (config, user prefs)            │    █  │
│   █  │  • Extension Loader (MCP servers, custom tools)        │    █  │
│   █  │  • Session Recording/Resumption                        │    █  │
│   █  │                                                         │    █  │
│   █  └────────────────────────────────────────────────────────┘    █  │
│   █                                                                 █  │
│   ████████████████████████████████████████████████████████████████████  │
│                                  │                                      │
│                                  │ Processed requests, settings         │
│                                  ▼                                      │
│   ████████████████████████████████████████████████████████████████████  │
│   █                       CORE LAYER                                █  │
│   █                                                                 █  │
│   █  ┌────────────────────────────────────────────────────────┐    █  │
│   █  │              Conversation Orchestration                │    █  │
│   █  │                                                         │    █  │
│   █  │  • GeminiClient - Main orchestrator                    │    █  │
│   █  │    - Chat initialization & management                  │    █  │
│   █  │    - Model routing (flash/pro/auto)                    │    █  │
│   █  │    - Context compression management                    │    █  │
│   █  │    - Loop detection                                    │    █  │
│   █  │    - Turn management                                   │    █  │
│   █  │                                                         │    █  │
│   █  │  • GeminiChat - Chat session                           │    █  │
│   █  │    - History management (curated/comprehensive)        │    █  │
│   █  │    - API streaming                                     │    █  │
│   █  │    - Retry logic (invalid content)                     │    █  │
│   █  │    - Token counting                                    │    █  │
│   █  │    - Thought recording                                 │    █  │
│   █  │                                                         │    █  │
│   █  │  • Turn - Single request/response cycle                │    █  │
│   █  │    - Stream processing                                 │    █  │
│   █  │    - Event generation                                  │    █  │
│   █  │    - Finish reason handling                            │    █  │
│   █  │                                                         │    █  │
│   █  └────────────────────────────────────────────────────────┘    █  │
│   █                                                                 █  │
│   █  ┌────────────────────────────────────────────────────────┐    █  │
│   █  │                 Tool Management                        │    █  │
│   █  │                                                         │    █  │
│   █  │  • CoreToolScheduler                                   │    █  │
│   █  │    - Tool call validation                              │    █  │
│   █  │    - Sequential execution queue                        │    █  │
│   █  │    - Confirmation workflow                             │    █  │
│   █  │    - Live output streaming                             │    █  │
│   █  │    - State management (7 states)                       │    █  │
│   █  │                                                         │    █  │
│   █  │  • ToolRegistry                                        │    █  │
│   █  │    - Tool registration & lookup                        │    █  │
│   █  │    - Built-in tools (read, write, shell, etc.)         │    █  │
│   █  │    - MCP tool integration                              │    █  │
│   █  │    - Agent tool wrappers                               │    █  │
│   █  │                                                         │    █  │
│   █  └────────────────────────────────────────────────────────┘    █  │
│   █                                                                 █  │
│   █  ┌────────────────────────────────────────────────────────┐    █  │
│   █  │              Policy & Security                         │    █  │
│   █  │                                                         │    █  │
│   █  │  • PolicyEngine                                        │    █  │
│   █  │    - Rule matching (tool name, args pattern)           │    █  │
│   █  │    - Priority-based decision                           │    █  │
│   █  │    - ALLOW/DENY/ASK_USER outcomes                      │    █  │
│   █  │    - Non-interactive mode handling                     │    █  │
│   █  │                                                         │    █  │
│   █  │  • MessageBus (Confirmation Bus)                       │    █  │
│   █  │    - Event pub/sub system                              │    █  │
│   █  │    - Request/response correlation                      │    █  │
│   █  │    - UI decoupling                                     │    █  │
│   █  │                                                         │    █  │
│   █  └────────────────────────────────────────────────────────┘    █  │
│   █                                                                 █  │
│   █  ┌────────────────────────────────────────────────────────┐    █  │
│   █  │                Agent Execution                         │    █  │
│   █  │                                                         │    █  │
│   █  │  • AgentExecutor                                       │    █  │
│   █  │    - Agent loop management (max 50 turns)              │    █  │
│   █  │    - Isolated tool registry                            │    █  │
│   █  │    - complete_task detection                           │    █  │
│   █  │    - Output schema validation (Zod)                    │    █  │
│   █  │    - Activity event reporting                          │    █  │
│   █  │                                                         │    █  │
│   █  │  • AgentRegistry                                       │    █  │
│   █  │    - Built-in agents (codebase-investigator)           │    █  │
│   █  │    - Custom agent loading                              │    █  │
│   █  │                                                         │    █  │
│   █  └────────────────────────────────────────────────────────┘    █  │
│   █                                                                 █  │
│   ████████████████████████████████████████████████████████████████████  │
│                                  │                                      │
│                                  │ API calls, storage, external services│
│                                  ▼                                      │
│   ████████████████████████████████████████████████████████████████████  │
│   █                  INFRASTRUCTURE LAYER                           █  │
│   █                                                                 █  │
│   █  ┌────────────────────────────────────────────────────────┐    █  │
│   █  │                  API Integration                       │    █  │
│   █  │                                                         │    █  │
│   █  │  • ContentGenerator (API abstraction)                  │    █  │
│   █  │    - Gemini API client (@google/genai)                 │    █  │
│   █  │    - Code Assist (OAuth2)                              │    █  │
│   █  │    - Request/response handling                         │    █  │
│   █  │    - Retry logic with backoff                          │    █  │
│   █  │    - Fallback handling (quota errors)                  │    █  │
│   █  │                                                         │    █  │
│   █  └────────────────────────────────────────────────────────┘    █  │
│   █                                                                 █  │
│   █  ┌────────────────────────────────────────────────────────┐    █  │
│   █  │              External Integrations                     │    █  │
│   █  │                                                         │    █  │
│   █  │  • MCP Client                                          │    █  │
│   █  │    - Server connection (stdio/sse)                     │    █  │
│   █  │    - Tool proxying                                     │    █  │
│   █  │    - Prompt template loading                           │    █  │
│   █  │    - OAuth token management                            │    █  │
│   █  │                                                         │    █  │
│   █  │  • IDE Integration                                     │    █  │
│   █  │    - VSCode extension support                          │    █  │
│   █  │    - Zed integration                                   │    █  │
│   █  │    - IDE context (active file, cursor, selection)      │    █  │
│   █  │    - IDE edit confirmations                            │    █  │
│   █  │                                                         │    █  │
│   █  └────────────────────────────────────────────────────────┘    █  │
│   █                                                                 █  │
│   █  ┌────────────────────────────────────────────────────────┐    █  │
│   █  │              Storage & Persistence                     │    █  │
│   █  │                                                         │    █  │
│   █  │  • Storage System                                      │    █  │
│   █  │    - Configuration storage (~/.gemini/)                │    █  │
│   █  │    - Session recording                                 │    █  │
│   █  │    - Memory storage (user-defined facts)               │    █  │
│   █  │    - Tool output caching                               │    █  │
│   █  │    - Temporary file management                         │    █  │
│   █  │                                                         │    █  │
│   █  │  • ChatRecordingService                                │    █  │
│   █  │    - Message recording                                 │    █  │
│   █  │    - Tool call history                                 │    █  │
│   █  │    - Token usage tracking                              │    █  │
│   █  │    - Session resume support                            │    █  │
│   █  │                                                         │    █  │
│   █  └────────────────────────────────────────────────────────┘    █  │
│   █                                                                 █  │
│   █  ┌────────────────────────────────────────────────────────┐    █  │
│   █  │            Telemetry & Observability                   │    █  │
│   █  │                                                         │    █  │
│   █  │  • Telemetry Service (Clearcut Logger)                 │    █  │
│   █  │    - Event collection                                  │    █  │
│   █  │    - Privacy controls                                  │    █  │
│   █  │    - Performance metrics                               │    █  │
│   █  │                                                         │    █  │
│   █  │  • Debug Logger                                        │    █  │
│   █  │    - Development logging                               │    █  │
│   █  │    - Error tracking                                    │    █  │
│   █  │                                                         │    █  │
│   █  └────────────────────────────────────────────────────────┘    █  │
│   █                                                                 █  │
│   █  ┌────────────────────────────────────────────────────────┐    █  │
│   █  │             Supporting Services                        │    █  │
│   █  │                                                         │    █  │
│   █  │  • ChatCompressionService                              │    █  │
│   █  │    - History summarization                             │    █  │
│   █  │    - Token optimization                                │    █  │
│   █  │                                                         │    █  │
│   █  │  • LoopDetectionService                                │    █  │
│   █  │    - Repetition detection                              │    █  │
│   █  │    - Infinite loop prevention                          │    █  │
│   █  │                                                         │    █  │
│   █  │  • ModelRouterService                                  │    █  │
│   █  │    - Model selection strategy                          │    █  │
│   █  │    - Load balancing                                    │    █  │
│   █  │                                                         │    █  │
│   █  │  • FileSystemService                                   │    █  │
│   █  │    - File operations                                   │    █  │
│   █  │    - Directory traversal                               │    █  │
│   █  │    - gitignore parsing                                 │    █  │
│   █  │                                                         │    █  │
│   █  │  • ShellExecutionService                               │    █  │
│   █  │    - Command execution (PTY)                           │    █  │
│   █  │    - Process management                                │    █  │
│   █  │    - Output streaming                                  │    █  │
│   █  │                                                         │    █  │
│   █  └────────────────────────────────────────────────────────┘    █  │
│   █                                                                 █  │
│   ████████████████████████████████████████████████████████████████████  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

Layer Communication Rules:
  • UI Layer → Application Layer: User actions, commands
  • Application Layer → Core Layer: Processed requests
  • Core Layer → Infrastructure Layer: API calls, storage
  • Infrastructure Layer → Core Layer: Results, data
  • Core Layer → Application Layer: Events, responses
  • Application Layer → UI Layer: State updates, display

  • No direct UI → Core communication
  • No direct UI → Infrastructure communication
```

### 5.2 Data Flow Through Layers

```
┌────────────────────────────────────────────────────────────────────────┐
│                    DATA FLOW THROUGH LAYERS                            │
└────────────────────────────────────────────────────────────────────────┘

USER INPUT: "Read the file main.ts and explain it"

  ┌──────────────────────────────────────────────────────┐
  │                    UI LAYER                          │
  │  1. Capture input text                               │
  │  2. Parse for special syntax (@file, /command, etc.) │
  └────────────────────┬─────────────────────────────────┘
                       │
                       │ Prompt string
                       ▼
  ┌──────────────────────────────────────────────────────┐
  │              APPLICATION LAYER                       │
  │  1. atFileProcessor checks for @mentions            │
  │  2. shellProcessor checks for $(commands)            │
  │  3. Build Parts[] array                              │
  └────────────────────┬─────────────────────────────────┘
                       │
                       │ Parts[] = [{text: "Read..."}, ...]
                       ▼
  ┌──────────────────────────────────────────────────────┐
  │                 CORE LAYER                           │
  │  GeminiClient:                                       │
  │  1. Add to chat history                              │
  │  2. Check context window size                        │
  │  3. Apply compression if needed                      │
  │  4. Route to appropriate model                       │
  │                                                       │
  │  GeminiChat:                                         │
  │  5. Prepare API request with history                 │
  └────────────────────┬─────────────────────────────────┘
                       │
                       │ GenerateContentRequest
                       ▼
  ┌──────────────────────────────────────────────────────┐
  │           INFRASTRUCTURE LAYER                       │
  │  ContentGenerator:                                   │
  │  1. Send request to Gemini API                       │
  │  2. Receive streaming response                       │
  └────────────────────┬─────────────────────────────────┘
                       │
                       │ Stream chunks
                       ▼
  ┌──────────────────────────────────────────────────────┐
  │                 CORE LAYER                           │
  │  Turn:                                               │
  │  1. Process stream chunks                            │
  │  2. Detect tool calls vs text                        │
  │  3. Generate events                                  │
  │                                                       │
  │  If tool call detected:                              │
  │    CoreToolScheduler:                                │
  │    4. Validate tool call                             │
  │    5. Check policy                                   │
  │    6. Get confirmation if needed                     │
  └────────────────────┬─────────────────────────────────┘
                       │
                       │ Tool confirmation request
                       ▼
  ┌──────────────────────────────────────────────────────┐
  │              APPLICATION LAYER                       │
  │  MessageBus:                                         │
  │  1. Publish confirmation request                     │
  │  2. Wait for response                                │
  └────────────────────┬─────────────────────────────────┘
                       │
                       │ Confirmation request event
                       ▼
  ┌──────────────────────────────────────────────────────┐
  │                    UI LAYER                          │
  │  1. Show confirmation dialog                         │
  │  2. User approves/rejects                            │
  └────────────────────┬─────────────────────────────────┘
                       │
                       │ User decision
                       ▼
  ┌──────────────────────────────────────────────────────┐
  │              APPLICATION LAYER                       │
  │  MessageBus:                                         │
  │  1. Publish confirmation response                    │
  └────────────────────┬─────────────────────────────────┘
                       │
                       │ Confirmation response
                       ▼
  ┌──────────────────────────────────────────────────────┐
  │                 CORE LAYER                           │
  │  CoreToolScheduler:                                  │
  │  1. Execute approved tool                            │
  │                                                       │
  │  Tool (e.g., ReadFile):                              │
  │  2. Call implementation                              │
  └────────────────────┬─────────────────────────────────┘
                       │
                       │ File system access request
                       ▼
  ┌──────────────────────────────────────────────────────┐
  │           INFRASTRUCTURE LAYER                       │
  │  FileSystemService:                                  │
  │  1. Read file from disk                              │
  │  2. Apply gitignore rules                            │
  │  3. Return content                                   │
  │                                                       │
  │  ChatRecordingService:                               │
  │  4. Record tool execution                            │
  └────────────────────┬─────────────────────────────────┘
                       │
                       │ File content
                       ▼
  ┌──────────────────────────────────────────────────────┐
  │                 CORE LAYER                           │
  │  Tool:                                               │
  │  1. Format result for LLM                            │
  │  2. Create FunctionResponse                          │
  │                                                       │
  │  GeminiChat:                                         │
  │  3. Add tool response to history                     │
  │  4. Send back to API                                 │
  └────────────────────┬─────────────────────────────────┘
                       │
                       │ Next API request (with tool result)
                       ▼
  ┌──────────────────────────────────────────────────────┐
  │           INFRASTRUCTURE LAYER                       │
  │  ContentGenerator:                                   │
  │  1. Send follow-up request                           │
  │  2. Model processes file content                     │
  │  3. Return explanation                               │
  └────────────────────┬─────────────────────────────────┘
                       │
                       │ Final text response
                       ▼
  ┌──────────────────────────────────────────────────────┐
  │                 CORE LAYER                           │
  │  Turn:                                               │
  │  1. Process final response                           │
  │  2. Add to history                                   │
  │  3. Generate completion event                        │
  └────────────────────┬─────────────────────────────────┘
                       │
                       │ Content events
                       ▼
  ┌──────────────────────────────────────────────────────┐
  │              APPLICATION LAYER                       │
  │  Event routing                                       │
  └────────────────────┬─────────────────────────────────┘
                       │
                       │ Display events
                       ▼
  ┌──────────────────────────────────────────────────────┐
  │                    UI LAYER                          │
  │  1. Render explanation text                          │
  │  2. Show completion                                  │
  │  3. Ready for next input                             │
  └──────────────────────────────────────────────────────┘
```

---

## 6. Data Flow Diagrams

### 6.1 Request-Response Lifecycle

```
┌────────────────────────────────────────────────────────────────────────┐
│                  REQUEST-RESPONSE LIFECYCLE                            │
└────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐
│  1. User Input  │
│  "Hello Gemini" │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│  2. Input Processing            │
│  • Parse slash commands         │
│  • Expand @file references      │
│  • Execute $(shell) commands    │
│  • Build Parts[]                │
└────────┬────────────────────────┘
         │
         │ Parts[] = [{text: "Hello Gemini"}]
         ▼
┌─────────────────────────────────┐
│  3. Pre-Send Checks             │
│  • Add IDE context (if any)     │
│  • Check context window size    │
│  • Compress history (if needed) │
│  • Detect loops                 │
└────────┬────────────────────────┘
         │
         │ Continue? Yes
         ▼
┌─────────────────────────────────┐
│  4. Model Selection             │
│  • Check if model is sticky     │
│  •   (multi-turn sequence)      │
│  • If new sequence:             │
│  •   - Run routing strategy     │
│  •   - Lock model for sequence  │
└────────┬────────────────────────┘
         │
         │ Model: gemini-2.0-flash-001
         ▼
┌─────────────────────────────────┐
│  5. Build API Request           │
│  • System instruction           │
│  • Conversation history         │
│  • Tool declarations            │
│  • Generation config            │
└────────┬────────────────────────┘
         │
         │ GenerateContentRequest
         ▼
┌─────────────────────────────────┐
│  6. Send to Gemini API          │
│  • HTTP/gRPC request            │
│  • Retry logic with backoff     │
│  • Handle 429 (quota) errors    │
└────────┬────────────────────────┘
         │
         │ Response stream starts
         ▼
┌─────────────────────────────────┐
│  7. Process Stream              │
│  • Chunk by chunk               │
│  • Validate content             │
│  • Extract parts                │
│  • Count tokens                 │
└────────┬────────────────────────┘
         │
         │ Chunks...
         │
    ┌────▼─────┬─────────────────────────┐
    │          │                         │
    ▼          ▼                         ▼
┌────────┐ ┌──────────┐        ┌──────────────┐
│  Text  │ │ Thoughts │        │ Function Call│
│  Part  │ │   Part   │        │     Part     │
└───┬────┘ └────┬─────┘        └──────┬───────┘
    │           │                     │
    │           │                     │
    │           │                     ▼
    │           │            ┌──────────────────┐
    │           │            │ 8. Tool Execution│
    │           │            │ (See Tool Flow)  │
    │           │            └────────┬─────────┘
    │           │                     │
    │           │                     │ Tool Response
    │           │                     ▼
    │           │            ┌──────────────────┐
    │           │            │ 9. Send Response │
    │           │            │    Back to API   │
    │           │            └────────┬─────────┘
    │           │                     │
    │           │                     │ Next API call
    │           │                     │
    │           └──────────┬──────────┘
    │                      │
    └──────────┬───────────┘
               │
               ▼
┌──────────────────────────────────────┐
│ 10. Validate Stream Completion       │
│  • Has finish reason?                │
│  • Has response text or tool call?   │
│  • Retry if invalid                  │
└────────┬─────────────────────────────┘
         │
         │ Valid completion
         ▼
┌──────────────────────────────────────┐
│ 11. Update Chat History              │
│  • Add model response to history     │
│  • Record thoughts (if any)          │
│  • Update token count                │
│  • Check next speaker                │
└────────┬─────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────┐
│ 12. Next Speaker Check               │
│  • If finish reason = STOP           │
│  • Ask: who should speak next?       │
│  • If model: continue automatically  │
└────────┬─────────────────────────────┘
         │
    ┌────▼────┐
    │         │
    ▼         ▼
┌────────┐ ┌──────────┐
│  Done  │ │ Continue │
│        │ │ (Model)  │
└───┬────┘ └────┬─────┘
    │           │
    │           └──────► "Please continue" ─► Back to step 5
    │
    ▼
┌──────────────────────────────────────┐
│ 13. Return to User                   │
│  • Display final response            │
│  • Update UI state                   │
│  • Ready for next input              │
└──────────────────────────────────────┘

Error Paths:
  • Validation error → Error State → Display error
  • Tool execution error → Send error to model → Continue
  • API error (429) → Fallback mode → Retry with flash model
  • Context overflow → Compress history → Retry
  • Loop detected → Stop → Display warning
  • Max turns → Stop → Display limit message
```

### 6.2 Context Window Management Flow

```
┌────────────────────────────────────────────────────────────────────────┐
│               CONTEXT WINDOW MANAGEMENT FLOW                           │
└────────────────────────────────────────────────────────────────────────┘

                    ┌──────────────────────┐
                    │  New Message Request │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌────────────────────────────┐
                    │ Estimate Request Size      │
                    │ (JSON length / 4)          │
                    └──────────┬─────────────────┘
                               │
                               ▼
                    ┌────────────────────────────┐
                    │ Get Current Token Count    │
                    │ (from last API response)   │
                    └──────────┬─────────────────┘
                               │
                               ▼
                    ┌─────────────────────────────────┐
                    │ Calculate Remaining Space       │
                    │                                 │
                    │ remaining = tokenLimit(model)   │
                    │           - currentTokens       │
                    └──────────┬──────────────────────┘
                               │
                               ▼
                    ┌─────────────────────────────────┐
                    │ Will Request Fit?               │
                    │                                 │
                    │ estimated < remaining * 0.95    │
                    └──────────┬──────────────────────┘
                               │
                   ┌───────────┴────────────┐
                   │                        │
                   ▼ NO                     ▼ YES
         ┌──────────────────┐     ┌─────────────────┐
         │ Context Overflow │     │  Proceed        │
         │ Warning          │     │  Normally       │
         └──────────────────┘     └─────────────────┘
                   │
                   │ Stop here
                   ▼
            ┌─────────────┐
            │    STOP     │
            └─────────────┘


Compression Trigger Flow:
                    ┌──────────────────────┐
                    │  Before Send         │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌────────────────────────────┐
                    │ tryCompressChat(force=false)│
                    └──────────┬─────────────────┘
                               │
                               ▼
                    ┌─────────────────────────────────┐
                    │ ChatCompressionService.compress()│
                    │                                 │
                    │ 1. Calculate current tokens     │
                    │ 2. Check if > 60% of limit      │
                    └──────────┬──────────────────────┘
                               │
                   ┌───────────┴────────────┐
                   │                        │
                   ▼ < 60%                  ▼ >= 60%
         ┌──────────────────┐     ┌─────────────────────┐
         │ NOT_NEEDED       │     │ Attempt Compression │
         └──────────────────┘     └──────────┬──────────┘
                                              │
                                              ▼
                                   ┌──────────────────────────┐
                                   │ Build Summary Request    │
                                   │                          │
                                   │ System: "Summarize..."   │
                                   │ History: [old messages]  │
                                   └──────────┬───────────────┘
                                              │
                                              ▼
                                   ┌──────────────────────────┐
                                   │ Send to API              │
                                   │ (using current model)    │
                                   └──────────┬───────────────┘
                                              │
                                              ▼
                                   ┌──────────────────────────┐
                                   │ Get Summary Response     │
                                   └──────────┬───────────────┘
                                              │
                                              ▼
                                   ┌──────────────────────────┐
                                   │ Build New History        │
                                   │                          │
                                   │ [summary] + [recent N]   │
                                   └──────────┬───────────────┘
                                              │
                                              ▼
                                   ┌──────────────────────────┐
                                   │ Count New Tokens         │
                                   └──────────┬───────────────┘
                                              │
                              ┌───────────────┴────────────────┐
                              │                                │
                              ▼ More tokens than before!       ▼ Fewer tokens
                   ┌──────────────────────┐         ┌──────────────────────┐
                   │ COMPRESSION_FAILED_  │         │ COMPRESSED           │
                   │ INFLATED_TOKEN_COUNT │         │                      │
                   │                      │         │ Replace chat history │
                   │ Keep original history│         │ with compressed      │
                   └──────────────────────┘         └──────────────────────┘
                              │                                │
                              │                                │
                              └────────────┬───────────────────┘
                                           │
                                           ▼
                                  ┌─────────────────┐
                                  │  Continue Send  │
                                  └─────────────────┘

Token Limits by Model:
┌─────────────────────────┬──────────────┐
│        Model            │ Token Limit  │
├─────────────────────────┼──────────────┤
│ gemini-2.0-flash-001    │   1,000,000  │
│ gemini-2.0-flash-lite   │   1,000,000  │
│ gemini-1.5-pro          │   2,000,000  │
│ gemini-1.5-flash        │   1,000,000  │
│ gemini-exp-*            │   1,000,000  │
└─────────────────────────┴──────────────┘
```

---

## Component Relationships

### Key Relationships

```
GeminiClient
  ├── owns → GeminiChat (1:1)
  ├── uses → LoopDetectionService (1:1)
  ├── uses → ChatCompressionService (1:1)
  └── uses → ModelRouterService (1:1)

GeminiChat
  ├── owns → ChatRecordingService (1:1)
  ├── uses → ContentGenerator (interface)
  └── maintains → Content[] (history)

CoreToolScheduler
  ├── uses → ToolRegistry (1:1)
  ├── uses → PolicyEngine (1:1)
  ├── uses → MessageBus (1:1)
  └── manages → ToolCall[] (queue)

ToolRegistry
  └── contains → AnyDeclarativeTool[] (many)

AgentExecutor
  ├── owns → GeminiChat (1:1, isolated)
  ├── owns → ToolRegistry (1:1, isolated)
  └── uses → Config (shared)

PolicyEngine
  ├── evaluates → PolicyRule[]
  └── returns → PolicyDecision

MessageBus
  ├── publishers → Components (many)
  └── subscribers → Components (many)
```

---

## Technology Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    TECHNOLOGY STACK                         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  UI Framework:                                              │
│    • Ink (React for CLI)                                    │
│    • React 19                                               │
│                                                             │
│  Language & Runtime:                                        │
│    • TypeScript 5.3+                                        │
│    • Node.js 20+                                            │
│    • ES Modules                                             │
│                                                             │
│  Build & Package:                                           │
│    • esbuild (bundling)                                     │
│    • npm workspaces (monorepo)                              │
│                                                             │
│  API Client:                                                │
│    • @google/genai (Gemini API)                             │
│    • @modelcontextprotocol/sdk (MCP)                        │
│                                                             │
│  Schema & Validation:                                       │
│    • Zod (runtime validation)                               │
│    • zod-to-json-schema (conversion)                        │
│                                                             │
│  Storage & Config:                                          │
│    • Node.js fs module                                      │
│    • @iarna/toml (TOML parsing)                             │
│    • comment-json (JSON with comments)                      │
│                                                             │
│  Utilities:                                                 │
│    • simple-git (Git operations)                            │
│    • glob (File patterns)                                   │
│    • diff (Text diffing)                                    │
│    • prompts (User input)                                   │
│                                                             │
│  Testing:                                                   │
│    • Vitest (test runner)                                   │
│    • ink-testing-library (UI testing)                       │
│                                                             │
│  CLI:                                                       │
│    • yargs (argument parsing)                               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Design Patterns

1. **Event-Driven Architecture**: MessageBus for decoupled communication
2. **Strategy Pattern**: Model routing, content generation
3. **State Machine**: Tool execution, agent lifecycle
4. **Observer Pattern**: Event streaming, UI updates
5. **Builder Pattern**: Tool invocations, API requests
6. **Singleton Pattern**: Config, storage services
7. **Factory Pattern**: Tool creation, agent instantiation
8. **Chain of Responsibility**: Prompt processors
9. **Proxy Pattern**: MCP tool wrapping
10. **Command Pattern**: Slash commands, tool invocations

---

*This document provides a comprehensive visual overview of the Gemini CLI architecture. For implementation details, refer to the source code in `/home/user/gemini-cli/packages/`.*

**Last Updated**: 2025-11-11
**Codebase Location**: `/home/user/gemini-cli/`
