# Data-Driven Context Pipeline (Sidecar Config)

## 1. Motivation

The Context Management subsystem has grown sophisticated, but its configuration
is currently entangled with the global CLI `Config` god-object and the static
`settingsSchema.ts`. This entanglement causes several problems:

1. **Rigidity:** The order of processors (`ToolMasking` -> `Degradation` ->
   `Semantic` -> `Squashing`) is hardcoded in TypeScript.
2. **Hyperparameter Bloat:** Every new tuning knob requires modifying the global
   schema, UI dialogs, and types.
3. **Agentic Roadblock:** To prepare for a future where an agent dynamically
   configures its own memory subsystem based on the task, we need a
   serializable, data-driven definition of the context pipeline.

## 2. Vision

We will transition the Context Manager to be entirely configured by an
independent, strictly internal "Sidecar JSON".

Most users will never see this; they will simply select a "Generalist" profile,
which internally resolves to a pre-defined JSON payload. However, power users
(or evals) can pass `--context-sidecar=my-pipeline.json` to completely rewire
the agent's memory behavior.

## 3. High-Level Architecture

### A. Severing the God-Object (`ContextEnvironment`)

Processors currently take `Config` because they need to read settings and grab
the `BaseLlmClient`. We will replace this with a minimal, scoped interface:

```typescript
export interface ContextEnvironment {
  getLlmClient(): BaseLlmClient;
  getSessionId(): string;
  getTraceDir(): string;
  // NO settings or budgets allowed here.
}
```

### B. The Sidecar Schema

The sidecar JSON will define the **Budget** and the **Pipelines** (graphs of
processors). We separate the pipelines into the `retained` range (where we only
touch massive outliers to protect the graph) and the `pressure` range (where we
aggressively compress to stay under the token ceiling).

```json
{
  "budget": {
    "retainedTokens": 65000,
    "maxTokens": 150000,
    "maxPressureStrategy": "truncate"
  },
  "pipelines": {
    "eagerBackground": [
      {
        "processor": "StateSnapshotWorker",
        "options": {
          "triggerDeficitTokens": 5000,
          "model": "gemini-2.5-flash",
          "prompt": "You are a background memory consolidation worker..."
        }
      }
    ],
    "synchronousProjection": [
      {
        "processor": "ToolMaskingProcessor",
        "options": { "stringLengthThresholdTokens": 8000 }
      },
      {
        "processor": "BlobDegradationProcessor",
        "options": {}
      },
      {
        "processor": "SemanticCompressionProcessor",
        "options": { "nodeThresholdTokens": 3000, "model": "gemini-2.5-flash" }
      },
      {
        "processor": "HistorySquashingProcessor",
        "options": { "maxTokensPerNode": 4000 }
      }
    ]
  }
}
```

### C. Processor Registry & Reification

To convert the JSON into a running graph, we need a dynamic registry. Every
processor will define its own explicit Options interface.

```typescript
export interface ContextProcessorDef<TOptions = any> {
  name: string;
  create(env: ContextEnvironment, options: TOptions): ContextProcessor;
}

// In ContextManager:
const processorClass = Registry.get(stage.processor);
const instance = processorClass.create(env, stage.options);
```

## 4. Implementation Phases

- **Phase 1: Interfaces & Registry:** Define `ContextEnvironment`,
  `SidecarConfig` interfaces, and a `ProcessorRegistry`.
- **Phase 2: Processor Refactoring:** Update all existing processors to accept
  `(env: ContextEnvironment, options: SpecificOptions)` instead of
  `(config: Config)`.
- **Phase 3: ContextManager Dynamic Graph:** Refactor `ContextManager` to accept
  a `SidecarConfig` and dynamically instantiate its arrays of processors and
  workers using the Registry.
- **Phase 4: Loading & Profiles:** Update `GeminiClient` to either load the JSON
  from a file path (if provided via a debug flag) or fall back to an internal
  hardcoded Sidecar object that represents the user's chosen UI profile
  (Generalist/PowerUser).
