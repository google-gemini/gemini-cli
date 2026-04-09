# Context Manager: The Pure Functional "Nodes of Theseus" IR

This document outlines the architectural transition from the V0 Mutating Editor pattern to the V1 Pure Functional, Immutable Episodic IR, designed to scale into a multi-agent, async state transformation system.

## 1. Core Philosophy: The Nodes of Theseus

The primary constraint of deep immutable trees is the cascading cost of cloning parent nodes when a leaf node changes. To solve this, we decouple the structural hierarchy of the context from the actual data sent to the LLM.

The IR is divided into two distinct domains:
1.  **Logical Nodes:** Structural boundaries that define the hierarchy (e.g., `Task`, `Episode`). These nodes **do not render** to the LLM. They exist to group related interactions and provide semantic meaning.
2.  **Concrete Nodes:** The atomic, renderable pieces of data (e.g., `UserPrompt`, `ToolExecution`, `Snapshot`, `RollingSummary`). These are the actual "planks" of the nodes.

Because Concrete Nodes carry a reference to their Logical Parent (e.g., `episodeId`), they can be stored and processed as a **Flat List**.

## 2. The Autonomous `ContextWorkingBuffer`

The "Nodes" is no longer a dumb array; it is encapsulated in a rich `ContextWorkingBuffer` entity.

### Encapsulation of History
The Buffer manages its own audit trail and lineage. If a processor needs the pristine, unaltered data of a deeply compressed node (e.g., a Snapshotter summarizing masked tools), it queries the Buffer directly:
`buffer.getPristineNode(id)`

### Linear Temporal Progression (The Conveyor Belt)
Processors do not vote or compete. Context degradation is a linear temporal progression defined by triggers:
1.  **Frontbuffer Trim:** E.g., Tool Masking replaces raw tools immediately.
2.  **Backbuffer Normalize:** E.g., Summarization replaces aging nodes in the background.
3.  **GC Backstop:** E.g., Truncation brutally destroys nodes only when the absolute budget is breached.

When a pipeline triggers, the Orchestrator runs its processors, gathers their `ContextPatch`es, and applies them to the Buffer immediately. The state simply advances.

## 3. Type-Safe Async Coordination (The `ContextInbox`)

To solve the async/sync barrier (where a slow background worker generates a summary that a fast synchronous emergency backstop needs instantly), we introduce the `ContextInbox`.

This is a strictly-typed messaging system. A worker dispatches a `SNAPSHOT_READY` message to the Inbox. The backstop peeks at the Inbox, instantly retrieving the pre-computed summary and applying it.

## 4. The Processor Contract

Processors are purely functional map/filter operations. They evaluate a list of unprotected targets and return the exact list of nodes they intend to substitute. They do **not** generate manual `ContextPatch` objects or manage `IrMetadata`.

```typescript
export type InboxMessage = 
  | { type: 'SNAPSHOT_READY'; snapshot: Snapshot; abstractsIds: string[] }
  | { type: 'BACKGROUND_SUMMARY'; summary: RollingSummary; targetId: string };

export interface ContextInbox {
  dispatch(message: InboxMessage): void;
  peek<T extends InboxMessage['type']>(type: T): Extract<InboxMessage, { type: T }> | undefined;
}

export interface ContextWorkingBuffer {
  /** The current active (projected) flat list of ConcreteNodes. */
  readonly nodes: ReadonlyArray<ConcreteNode>;
  
  /** Retrieves the historical, pristine version of a node (before any masks/summaries). */
  getPristineNode(id: string): ConcreteNode | undefined;
  
  /** Retrieves the full audit lineage of a specific node ID. */
  getLineage(id: string): ReadonlyArray<ConcreteNode>;
}

export interface ProcessArgs {
  /** The rich buffer containing current nodes and their history. */
  readonly buffer: ContextWorkingBuffer;
  
  /** 
   * The specific unprotected, mutable nodes the pipeline is allowed to operate on.
   * The Orchestrator strictly filters out ANY protected nodes (like active tasks) before calling.
   * Processors can assume all targets passed here are legally theirs to mutate or drop.
   */
  readonly targets: ReadonlyArray<ConcreteNode>;
  
  /** The token budget and accounting state. */
  readonly state: ContextAccountingState;
  
  /** Type-safe messaging system for async/sync coordination. */
  readonly inbox: ContextInbox;
}

export interface ContextProcessor {
  readonly id: string;
  readonly name: string;
  
  /** 
   * A pure function. Returns the new state of the `targets`. 
   * If an ID from `targets` is missing in the return array, the Orchestrator deletes it.
   * If a new synthetic node is in the return array, the Orchestrator inserts it.
   * The Orchestrator automatically appends audit `IrMetadata` to any changes.
   */
  process(args: ProcessArgs): Promise<ReadonlyArray<ConcreteNode>>;
}
```

## 5. The Node Taxonomy (`IrNodeType`)

The `IrNodeType` union explicitly defines all valid nodes. Synthetic nodes (like `Snapshot`) are first-class citizens.

```typescript
export type IrNodeType =
  // Logical Nodes
  | 'TASK'
  | 'EPISODE'

  // Organic Concrete Nodes
  | 'USER_PROMPT'
  | 'SYSTEM_EVENT'
  | 'AGENT_THOUGHT'
  | 'TOOL_EXECUTION'
  | 'AGENT_YIELD'
  
  // Synthetic Concrete Nodes
  | 'SNAPSHOT'
  | 'ROLLING_SUMMARY'
  | 'MASKED_TOOL';
```