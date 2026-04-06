# Data-Driven Context Pipeline (Sidecar Config)

## 1. Motivation

The Context Management subsystem has grown sophisticated, but its configuration
is currently entangled with the global CLI `Config` god-object and the static
`settingsSchema.ts`. This entanglement causes several problems:

1. **Rigidity:** The order of processors (`ToolMasking` -> `Degradation` ->
   `Semantic` -> `Squashing`) is hardcoded in TypeScript.
2. **Hyperparameter Bloat:** Every new tuning knob requires modifying the global
   schema, UI dialogs, and types.
3. **Pipeline Isolation:** Background tasks like the `StateSnapshotWorker` were 
   isolated silos. They managed their own triggers and could not participate in a 
   sequential data pipeline (e.g. receiving degraded messages as input).

## 2. Vision: The Orthogonal "Forking" Pipeline

We will transition the Context Manager to be entirely configured by an independent,
strictly internal "Sidecar JSON" that represents a Directed Acyclic Graph (DAG) of 
**Triggers** and **Processors**.

By completely separating the "Execution Strategy" (when something runs) from the 
"Data Transformation Logic" (what it does), we can arbitrarily compose tools. 
Crucially, the architecture supports a **"Forking Pipeline" mechanic**:

- **Synchronous Execution:** If all processors in a pipeline return `Episode[]`, 
  the orchestrator runs them inline and immediately returns the result (e.g. for 
  instant LLM prompting).
- **Asynchronous Forking (Eventual Consistency):** If a processor returns a 
  `Promise<Episode[]>` (like a heavy LLM summarizer), the orchestrator immediately 
  halts the synchronous chain, returns the previously processed state to the caller 
  so the CLI doesn't freeze, and lets the rest of the pipeline continue resolving 
  in the background. When it finishes, it caches the result for the *next* turn.

## 3. High-Level Architecture

### A. The Sidecar Schema

The sidecar JSON defines the **Budget** and an array of **Pipelines**. 

```json
{
  "budget": {
    "retainedTokens": 65000,
    "maxTokens": 150000
  },
  "pipelines": [
    {
      "name": "Immediate Sanitization",
      "triggers": ["on_turn"],
      "processors": [
        { "processorId": "ToolMaskingProcessor", "options": { "stringLengthThresholdTokens": 8000 } },
        { "processorId": "BlobDegradationProcessor", "options": {} },
        { "processorId": "SemanticCompressionProcessor", "options": { "nodeThresholdTokens": 5000 } }
      ]
    },
    {
      "name": "Deep Background Compression",
      "triggers": [{ "type": "timer", "intervalMs": 5000 }, "budget_exceeded"],
      "processors": [
        { "processorId": "HistorySquashingProcessor", "options": { "maxTokensPerNode": 3000 } },
        { "processorId": "StateSnapshotProcessor", "options": {} }
      ]
    }
  ]
}
```

### B. Processor Registry & Reification

To convert the JSON into a running graph, we use a dynamic registry. Every
processor implements the `ContextProcessor` interface and defines its own explicit Options.

```typescript
export interface ContextProcessor {
  process(episodes: Episode[]): Episode[] | Promise<Episode[]>;
}
```

## 4. Implementation Phases

- **Phase 1: Interfaces & Registry:** Define `PipelineDef`, `Trigger`, and a `ProcessorRegistry`.
- **Phase 2: Normalize Workers:** Demote `StateSnapshotWorker` into a standard `StateSnapshotProcessor` so it can be composed in any pipeline array.
- **Phase 3: The Pipeline Orchestrator:** Build the central orchestration engine that listens to triggers, pumps `pristineEpisodes` through the arrays, and handles the Sync/Async forking logic to ensure zero-blocking eventual consistency.
- **Phase 4: ContextManager Integration:** Wire the `ContextManager` to delegate execution and caching to the Orchestrator.
