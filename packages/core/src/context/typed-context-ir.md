# Context Manager: The Pure Functional "Ship of Theseus" IR

This document outlines the architectural transition from the V0 Mutating Editor
pattern to the V1 Pure Functional, Immutable Episodic IR.

## 1. Core Philosophy: The Ship of Theseus

The primary constraint of deep immutable trees is the cascading cost of cloning
parent nodes when a leaf node changes. To solve this, we decouple the structural
hierarchy of the context from the actual data sent to the LLM.

The IR is divided into two distinct domains:

1.  **Logical Nodes:** Structural boundaries that define the hierarchy (e.g.,
    `Task`, `Episode`). These nodes **do not render** to the LLM. They exist to
    group related interactions and provide semantic meaning.
2.  **Concrete Nodes:** The atomic, renderable pieces of data (e.g.,
    `UserPrompt`, `ToolExecution`, `Snapshot`, `RollingSummary`). These are the
    actual "planks" of the ship.

Because Concrete Nodes carry a reference to their Logical Parent (e.g.,
`episodeId`), they can be stored and processed as a **Flat List**.

## 2. The Pristine Graph vs. The Ship

### The Pristine Graph (The Blueprint)

Owned exclusively by the `ContextManager`. It is an append-only, immutable graph
containing both Logical Nodes and the original, unaltered Concrete Nodes. It
serves as the absolute ground-truth and historical audit log.

### The Ship (The Working Buffer)

When a pipeline triggers, the `PipelineOrchestrator` constructs "The Ship": a
flat, sequential `ReadonlyArray<ConcreteNode>` representing the current
best-effort view of the context.

Processors do **not** receive an `EpisodeEditor`. They receive the Ship. They
iterate over this flat array (an O(N) operation with no recursive tree
traversal) to find nodes that violate the budget.

## 3. Pure Functional Processors and Context Patches

Processors are pure functions. They do not mutate the Ship. Instead, they return
a `ContextPatch` representing how the Ship should be modified.

```typescript
export interface ContextPatch {
  /** The IDs of the Concrete Nodes to remove from the Ship. */
  removedIds: string[];

  /** The new synthetic Concrete Nodes (e.g., MaskedTool, Snapshot) to insert. */
  insertedNodes?: ConcreteNode[];

  /** The index at which to insert the new nodes. If omitted, they replace the first removedId. */
  insertionIndex?: number;

  /** Audit metadata explaining who made this patch, when, and why. */
  metadata: IrMetadata;
}
```

The Orchestrator acts as a reducer. It takes the `ContextPatch` returned by
Processor A, applies it to the Ship to create a new immutable flat array, and
passes the updated Ship to Processor B.

## 4. The Processor Signature

```typescript
export interface ProcessArgs {
  /** The flat, sequential array of current renderable nodes (The Ship). */
  ship: ReadonlyArray<ConcreteNode>;

  /**
   * The specific subset of Concrete Node IDs that triggered this execution.
   * For 'new_message', these are the new nodes. For 'retained_exceeded', the aged-out nodes.
   */
  triggerTargets: ReadonlySet<string>;

  /** The token budget and accounting state. */
  state: ContextAccountingState;

  /**
   * An escape hatch allowing the processor to query the original, uncompressed
   * state of a node from the Pristine Graph.
   */
  getPristineNode: (id: string) => ConcreteNode | undefined;
}

export interface ContextProcessor {
  readonly id: string;
  readonly name: string;

  /** Returns an array of declarative patches to apply to the Ship. */
  process(args: ProcessArgs): Promise<ContextPatch[]>;
}
```

## 5. The Node Taxonomy (`IrNodeType`)

The `IrNodeType` union explicitly defines all valid nodes. Synthetic nodes (like
`Snapshot`) are first-class citizens.

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
