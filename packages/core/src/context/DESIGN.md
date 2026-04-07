# Context Manager V0: High-Level Design

## 1. Introduction & Motivation

This document provides a high-level orientation to the Context Management system within `@google/gemini-cli-core`. 

Previously, context management in the CLI was decentralized, synchronous, and relied on fixed-function, destructive mutations of the raw Gemini `Content[]` history. Because all context management was local, this approach made it nearly impossible to reason about the global impact of any specific change. For example, should we distill tool outputs, or mask them? Or maybe it's contextual? What about other processors like the snapshotter, should they see masked results? Distilled results? What about new approaches to context management, how do they fit into the solution we've already built. The old approach to context management made it nearly challenging to even attempt to answer any one of these questions, let alone to try and answer all of them.

To address these issues, we went back to the drawing board to create an explicit Context Manager. As opposed to our old approach, the new Context Manager V0 is a robust, event-driven, pluggable system. It introduces a non-destructive Episodic Intermediate Representation (IR) and an asynchronous processing pipeline, allowing the CLI to run expensive LLM summarization tasks in the background and opportunistically project an optimized view of the history only when budget constraints require it.

---

## 2. Chief Innovations & Salient Features

The architecture is built upon seven core principles that distinguish it from the legacy system:

1.  **Centralized Budgeting:** The `ContextManager` is the sole source of truth for the token budget. It makes the final, just-in-time decision about what gets projected to the LLM.
2.  **Statelessness via IR:** Raw history is never mutated or deleted. Instead, it is translated into an Intermediate Representation (IR). Context reduction is achieved by attaching compressed `Variant`s to the IR graph. The original text is always recoverable.
3.  **Asynchronicity:** Designed around a `ContextEventBus`. Heavy context operations (like LLM-powered summarization) run as detached background tasks without blocking the main agent loop.
4.  **Configurability:** Driven by a typed JSON "Sidecar" configuration. Token ceilings, fallback strategies, and processing pipelines are entirely data-driven.
5.  **Pluggability:** `ContextProcessor`s are isolated plugins with typed schemas. They are registered via Dependency Injection and can be arranged into arbitrary pipelines.
6.  **Debuggability:** A built-in `ContextTracer` tracks every step of the pipeline, providing full audit trails of exactly when, why, and how a message was altered.
7.  **Testability:** Global state has been eliminated. The system uses strict Dependency Injection (`ProcessorRegistry`, `ContextEnvironment`, `ContextEventBus`), making every layer easily unit-testable.
8.  **Orthogonality via Targets:** Processors do not implicitly scan the entire history graph. The `ContextManager` computes exact Deltas (e.g., new nodes just added, or specific nodes that just aged out of the retained buffer). Processors are sandboxed by the `EpisodeEditor` to only iterate over and mutate these specific `targetNodes`, ensuring surgical and highly efficient reductions.

---

## 3. The Major Pieces: Roles & Responsibilities

### The Brain: `ContextManager`
The central coordinator. It owns the "Pristine History" (the ground-truth Episodic IR graph). Its primary responsibility is exposing `projectCompressedHistory()`, which flattens the IR graph into a standard `Content[]` array strictly adhering to the configured token budget.

### The Data Model: Episodic Intermediate Representation (IR)
Instead of a flat array of messages, interactions are grouped into `Episode`s. An Episode represents a single turn: a User Prompt, followed by the Agent's Thoughts and Tool Executions (Steps), concluding with a Yield.
*   **`IrNode`:** The base unit (e.g., `ToolExecution`, `AgentThought`).
*   **`Variant`:** Compressed alternatives to the raw node (e.g., `SummaryVariant`, `MaskedVariant`, `SnapshotVariant`).
*   **`IrMetadata`:** An audit trail attached to every node, tracking token counts and the chronological list of `transformations` applied by processors.

### The Engine: `PipelineOrchestrator` & Sidecar
The orchestrator reads the `SidecarConfig`. It manages the lifecycle of the pipelines, registering triggers and executing processors in order. It dictates whether a pipeline blocks the main thread or runs in the background.

### The Workers: `ContextProcessor`s
Small, highly-focused classes that implement context reduction strategies. They do not mutate the graph directly; instead, they are given an `EpisodeEditor` which provides a safe, scoped API to attach `Variant`s and append metadata.
*   *Examples:* `ToolMaskingProcessor`, `SemanticCompressionProcessor`, `BlobDegradationProcessor`.

### The Glue: `ContextEventBus`
A Pub/Sub bus that decouples the components. It enables the `HistoryObserver` to notify the system of new messages, and allows background processors to notify the `ContextManager` when a new compressed variant is ready to be used.

---

## 4. How They Interact: The Life of a Message

To understand how these pieces fit together, let's walk through the lifecycle of a single interaction as it moves through the context system.

### Phase 1: Ingestion & Translation
1.  **Action:** The user sends a prompt, and the agent responds with a tool call. These raw messages are appended to the standard `AgentChatHistory`.
2.  **Observation:** The `HistoryObserver` detects the new messages.
3.  **Translation:** The observer passes the raw `Content[]` to the `IrMapper`. The mapper groups the prompt and the tool execution into a single, structured `Episode`.
4.  **Registration:** The new `Episode` is added to the `ContextManager`'s pristine graph.

### Phase 2: Triggering the Pipelines
1.  **Delta Generation:** The `ContextManager` receives the updated pristine graph. It diffs it against the previous state and extracts a Delta—the exact Set of new `IrNode` IDs.
2.  **Event Emission:** The `ContextManager` fires a `ChunkReceivedEvent` (with the Delta targets) over the `ContextEventBus`.
3.  **Orchestration:** The `PipelineOrchestrator` hears the event and evaluates its configured `PipelineDef`s. It finds a pipeline with the trigger `on_turn`.
4.  **Execution:** The Orchestrator creates an `EpisodeEditor` heavily sandboxed to *only* allow access to the targeted Delta nodes, and begins running the processors in that pipeline sequentially.

### Phase 3: Processing & Safe Editing
1.  **Processing:** A processor (e.g., `ToolMaskingProcessor`) receives the `EpisodeEditor`. It iterates over `editor.targets` (ignoring the rest of the historical graph). It identifies a massive JSON payload in one of the new tool executions.
2.  **Editing:** Instead of deleting the JSON, it calls `editor.editEpisode()`. It creates a `MaskedVariant` containing a string summary of the JSON. If it had attempted to edit a node outside its target Delta, the editor would have thrown an error.
3.  **Auditing:** The editor automatically appends a record to the node's `IrMetadata.transformations` indicating that the `ToolMaskingProcessor` applied a `MASKED` action.

### Phase 4: Async Resolution
1.  **Completion:** The background pipeline finishes. The orchestrator fires a `VariantReadyEvent` over the bus.
2.  **Integration:** The `ContextManager` receives the event and securely attaches the `MaskedVariant` to the correct `Episode` in the pristine graph. (If the pipeline was synchronous/blocking, this happens immediately).

### Phase 5: Just-In-Time Projection
1.  **Request:** The agent is ready to send the next prompt to Gemini. The core routing logic calls `contextManager.projectCompressedHistory()`.
2.  **Budget Evaluation:** The `IrProjector` calculates the current total tokens of the pristine graph and compares it to the `SidecarConfig` budget.
3.  **Variant Selection:** If the graph exceeds the budget, the projector looks for available `Variant`s. It sees the newly attached `MaskedVariant` and calculates the token deficit recovered by using it.
4.  **Flattening:** The `graphUtils` safely swap the raw node for the `MaskedVariant` in a temporary view, and flatten the Episodic IR back into a raw Gemini `Content[]` array.
5.  **Delivery:** The optimized, budget-compliant array is sent to the LLM. The underlying pristine graph remains completely untouched and available for future reference or alternative projections.
