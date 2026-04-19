# Design Document: Modular Agent Architecture for Gemini CLI

## 1. Introduction

This document defines the architectural specification for modularizing
gemini-cli. It serves as the authoritative guide for implementing a system where
the core agent logic is decoupled from specific runtime implementations,
enabling a plug-and-play model for agent backends.

The goal is to transition from a monolithic, tightly-coupled execution loop to
an interface-driven architecture. This allows gemini-cli to switch between its
internal legacy runner and external agent frameworks (e.g., Google ADK,
LangChain, or custom runtimes) seamlessly via configuration.

## 2. Requirements

### 2.1. Functional Requirements

- **Interface Stability:** Core system components (UI, Scheduler, Telemetry)
  MUST interact with agents only through defined interfaces, never concrete
  implementations.
- **Backend Swappability:** The system MUST support switching the agent
  execution engine at runtime or initialization time via configuration.
- **Legacy Compatibility:** The default behavior MUST remain identical to the
  existing internal logic until explicitly configured otherwise.
- **Observable Execution:** All agent backends MUST emit a standard stream of
  events (thoughts, partial content, tool calls) to maintain the CLI's rich user
  experience.

### 2.2. Principles

- **Inversion of Control:** The CLI defines the contracts (`Agent`, `Model`,
  `ToolRuntime`); external frameworks must adapt to them.
- **Factory Pattern:** Instantiation logic is centralized in a factory that
  decides which implementation to return based on config.
- **Adapter Pattern:** External libraries are never imported directly into core
  business logic; they are wrapped in adapters that implement the core
  interfaces.

## 3. Core Interfaces

The architecture revolves around three primary interfaces located in
`packages/core/src/interfaces/`.

### 3.1. The Agent Interface

The `Agent` abstraction represents a self-contained execution loop. It
encapsulates the Loop logic (Think → Act → Observe).

**Contract:**

- **Input:** Strongly typed parameters (e.g., user query, context).
- **Output:** An `AsyncGenerator` yielding real-time `AgentEvent`s.
- **Result:** A final output payload (e.g., text response, termination reason).

```typescript
export interface Agent<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;

  /**
   * Executes the agent's logic statelessly for a single turn.
   */
  runEphemeral(
    input: TInput,
    options?: AgentRunOptions,
  ): AsyncGenerator<AgentEvent, TOutput>;

  /**
   * Executes the agent's logic sequentially with persisted state.
   */
  runAsync(
    input: TInput,
    options?: AgentRunOptions,
  ): AsyncGenerator<AgentEvent, TOutput>;
}

export type AgentEvent =
  | { type: 'thought'; content: string }
  | { type: 'content'; content: string }
  | { type: 'tool_call'; call: ToolCallRequestInfo }
  | { type: 'tool_result'; result: ToolCallResponseInfo }
  | { type: 'call_code'; code: ExecutableCodeInfo }
  | { type: 'code_result'; result: CodeResultInfo }
  | { type: 'tool_confirmation'; confirmations: Record<string, unknown> }
  | { type: 'error'; error: Error }
  | { type: 'activity'; kind: string; detail: Record<string, unknown> }
  | { type: 'finished'; output?: unknown };
```

The CLI's UI components will parse this normalized `AgentEvent` stream for
rendering. It is the responsibility of the framework adapter to map its internal
events to this `AgentEvent` schema.

### 3.2. The Model Interface

The `Model` abstraction represents the capability to generate content. This
interface allows external agent runtimes to plug in to gemini-cli's
pre-configured LLM client.

**Contract:**

- **Input:** A standard request object containing messages and tools.
- **Output:** An `AsyncGenerator` or `Promise` returning a standardized response
  object.

This inversion allows the external agent to use the CLI's authenticated session,
model routing, and quota management without knowing the implementation details
of `GeminiChat`.

## 4. Architecture: The Factory & Adapter Pattern

### 4.1. The Execution Factory

The `LocalAgentExecutor` (or `AgentFactory`) class serves as the entry point.
Instead of containing the execution loop logic directly, it delegates to a
specific implementation strategy.

**Proposed Flow:**

1. **Configuration Check:** Inspect `config.experimental.useExternalRuntime` (or
   similar flag).
1. **Legacy Path:** If false, instantiate and return the existing internal loop
   implementation (wrapped to implement `Agent`).
1. **External Path:** If true, dynamically import and instantiate an Adapter
   class that wraps the configured external framework.

### 4.2. Adapters

To support an external framework (let's call it **FrameworkX**), we require
three adapters:

1. **FrameworkXAgentAdapter**:
   - Implements `Agent`.
   - Wraps `FrameworkX.Runner`.
   - **Responsibilities:**
     - Convert `AgentInputs` to FrameworkX's input format.
     - Manage session state (create/retrieve sessions based on
       `options.sessionId`).
     - Execute `FrameworkX.Runner` (via its streaming API).
     - Listen to FrameworkX events/callbacks and yield corresponding
       `AgentEvent`s (mapping start_tool -> tool_call, thought -> thought,
       etc.).
     - Pass suspension configurations if Human-in-the-Loop is required.
     - Return the final result as `TOutput`.

1. **FrameworkXModelAdapter**:
   - Implements `FrameworkX.ModelInterface`.
   - Wraps gemini-cli's `GeminiChat`.
   - **Responsibilities:**
     - Receive prompt/messages from FrameworkX.
     - Call `GeminiChat.sendMessageStream`.
     - Convert Gemini response chunks into FrameworkX's expected response
       format.
     - Handle error translation (ensure errors are thrown in a format FrameworkX
       understands).

1. **FrameworkXToolAdapter**:
   - Implements `FrameworkX.ToolInterface`.
   - Wraps gemini-cli's `DeclarativeTool`.
   - **Responsibilities:**
     - Expose `tool.schema` to FrameworkX.
     - When `execute()` is called by FrameworkX, invoke `tool.execute()` within
       the CLI's context (ensuring proper logging and permission checks).

## 5. Use Case Scenarios

### 5.1. Autonomous Sub-agents

**Scenario:** A user runs the `/codebase_investigator` command. **Flow:**

1. `SubagentTool` calls `LocalAgentExecutor.create()`.
1. Factory checks config. If enabled, creates `FrameworkXAgentAdapter`.
1. `SubagentTool` calls `agent.runEphemeral()`.
1. `FrameworkXAgentAdapter` starts the external runner.
1. External runner decides to call a tool (e.g., `ls`).
1. It calls `FrameworkXToolAdapter.execute('ls')`.
1. Adapter runs internal `ls` tool.
1. External runner receives output, generates thought.
1. `FrameworkXAgentAdapter` captures thought, yields `{ type: 'thought' }`.
1. CLI UI renders the thought stream.

### 5.2. Interactive Loop Integration

**Scenario:** The primary chat loop (`GeminiClient`). **Flow:**

1. `GeminiClient` initializes and requests an agent from `AgentFactory`.
1. Factory returns `FrameworkXAgentAdapter` configured with
   `FrameworkXModelAdapter`.
1. User enters text. `GeminiClient` calls `agent.runAsync(text, { sessionId })`.
1. `FrameworkXAgentAdapter` resumes the session and streams events.
   - **Thoughts:** Yielded as `{ type: 'thought' }`.
   - **Content:** Yielded as `{ type: 'content' }` (token by token).
   - **Tool Calls:**
     - _Option A (Headless):_ FrameworkX executes tools internally using
       `FrameworkXToolAdapter`. The CLI receives only the final result or
       intermediate thought logs.
     - _Option B (UI-Driven/HITL):_ FrameworkX yields `{ type: 'tool_call' }`
       and suspends the loop. The CLI UI renders the confirmation prompt. Upon
       user approval, `GeminiClient` invokes the tool and resumes the agent with
       the result.
1. `GeminiClient` handles the event stream, updating the UI in real-time.

## 6. Implementation Checklist

1. **Define Interfaces:** Create `Agent` and `Model` interfaces in
   `packages/core`.
1. **Refactor Legacy:** Refactor `LocalAgentExecutor` to implement `Agent` and
   move its logic into a `LegacyLoop` class.
1. **Implement Factory:** Update `LocalAgentExecutor.create` to switch
   implementations based on config.
1. **Create Adapters:** Implement the three adapter classes for the target
   external framework.
1. **Update Configuration:** Add the feature flag to the settings schema.
1. **Verify:** Ensure `AgentEvent` stream fidelity is maintained so the UI
   requires no changes.
