# Context Manager: The Pure Functional "Ship of Theseus" IR

This document outlines the architectural transition from the V0 Mutating Editor pattern to the V1 Pure Functional, Immutable Episodic IR, designed to scale into a multi-agent, async state transformation system.

## 1. Core Philosophy: The Ship of Theseus

The primary constraint of deep immutable trees is the cascading cost of cloning parent nodes when a leaf node changes. To solve this, we decouple the structural hierarchy of the context from the actual data sent to the LLM.

The IR is divided into two distinct domains:
1.  **Logical Nodes:** Structural boundaries that define the hierarchy (e.g., `Task`, `Episode`). These nodes **do not render** to the LLM. They exist to group related interactions and provide semantic meaning.
2.  **Concrete Nodes:** The atomic, renderable pieces of data (e.g., `UserPrompt`, `ToolExecution`, `Snapshot`, `RollingSummary`). These are the actual "planks" of the ship.

Because Concrete Nodes carry a reference to their Logical Parent (e.g., `episodeId`), they can be stored and processed as a **Flat List**.

## 2. The Autonomous `ContextWorkingBuffer`

The "Ship" is no longer a dumb array; it is encapsulated in a rich `ContextWorkingBuffer` entity.

### Encapsulation of History
The Buffer manages its own audit trail and lineage. If a processor needs the pristine, unaltered data of a deeply compressed node (e.g., a Snapshotter summarizing masked tools), it queries the Buffer directly:
`buffer.getPristineNode(id)`

### The Variant Voting System (The "Patch Market")
Processors no longer blindly mutate the context. They act as "Advisors" generating **Proposals** (`ProcessorProposal`). 

*   **Background Processors** continually propose highly semantic summaries or masks (low destruction priority).
*   **Emergency Processors** propose brutal truncation (high destruction priority).

When a budget threshold is breached (e.g., `gc_backstop`), the Buffer evaluates all accumulated proposals. It accepts the proposals with the lowest destruction priority that resolve the token deficit, leaving the rest of the pristine graph untouched.

## 3. Type-Safe Async Coordination (The `ContextInbox`)

To solve the async/sync barrier (where a slow background worker generates a summary that a fast synchronous emergency backstop needs instantly), we introduce the `ContextInbox`.

This is a strictly-typed messaging system. A worker dispatches a `SNAPSHOT_READY` message to the Inbox. The backstop peeks at the Inbox, instantly retrieving the pre-computed summary and proposing it to the Buffer.

## 4. The Processor Contract

Processors are pure functions that evaluate unprotected targets and return an array of `ProcessorProposal`s.

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
   * The Orchestrator filters out protected nodes (like active tasks) before calling.
   */
  readonly targets: ReadonlyArray<ConcreteNode>;
  
  /** The token budget and accounting state. */
  readonly state: ContextAccountingState;
  
  /** Type-safe messaging system for async/sync coordination. */
  readonly inbox: ContextInbox;
}

export interface ProcessorProposal {
  /** The specific Concrete Nodes this proposal intends to replace or remove. */
  readonly targetIds: ReadonlyArray<string>;
  
  /** The new synthetic Concrete Nodes to insert in their place. */
  readonly proposedNodes: ReadonlyArray<ConcreteNode>;
  
  /** 
   * Priority/Destruction score. 
   * 1 = Ideal (Semantic Masking), 10 = Brutal (Emergency Truncation).
   * The Buffer votes based on this and the token deficit.
   */
  readonly priority: number; 
  
  readonly metadata: IrMetadata;
}

export interface ContextProcessor {
  readonly id: string;
  readonly name: string;
  
  /** Returns an array of declarative proposals for the Buffer to evaluate. */
  process(args: ProcessArgs): Promise<ProcessorProposal[]>;
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