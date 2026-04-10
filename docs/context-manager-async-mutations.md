# Async Context Mutations (V1 Architecture)

## The Problem

In V0, the \`ContextManager\` processes LLM inputs sequentially and
synchronously. Processors like \`NodeTruncation\` can safely mutate the graph
because they hold an exclusive lock on the context state.

However, operations like \`StateSnapshotAsyncProcessor\` take a long time to run
(distilling thousands of tokens). If they run synchronously, they block the user
from interacting with the agent. If they run asynchronously in the background,
by the time they finish, the active context graph has likely moved on (new
messages, tool calls, or other truncations have occurred).

## The V1 Solution: Ancestral Replacement (Optimistic Concurrency)

To allow async background pipelines to mutate the live context graph safely, we
use an Optimistic Concurrency Control mechanism called **Ancestral
Replacement**.

### 1. Proof of Claim

When an \`AsyncContextProcessor\` triggers, it is handed a \`ProcessArgs\`
containing a snapshot of the graph (the targets it was asked to process). The
processor records the specific IDs of the \`ConcreteNode\`s it is reading. This
is its "Proof of Claim".

### 2. Background Execution

The processor runs in the background, completely detached from the live graph.
It synthesizes a new state (e.g., a summarized snapshot node).

### 3. The Commit Phase

When the processor finishes, it returns its proposed mutations (an array of new
\`ConcreteNode\`s that specify which old nodes they replace via the
\`replacesId\` property).

The Orchestrator then attempts to "rebase" this mutation into the live graph:

1. It looks at the live graph.
2. It checks: _Do all the original nodes (the Proof of Claim) still exist
   unmodified in the live graph?_
3. **If Yes (Clean Fast-Forward):** The orchestrator deletes the old nodes and
   inserts the new synthesized nodes.
4. **If No (Conflict):** If _any_ of the original nodes were deleted or modified
   by another processor while the async task was running, the orchestrator
   rejects the async mutation entirely (or handles it via a conflict resolution
   strategy).

This guarantees that async pipelines can never corrupt the context state by
overwriting newer information with stale data.
