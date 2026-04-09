# The Nodes of Theseus Migration Checklist

- [x] **Phase 1: Core Types (`ir/types.ts`)**
  - [x] Add `ConcreteNode` and `LogicalNode` types.
  - [x] Add `episodeId` (or generic `parentId`) to all `ConcreteNode`
        interfaces.
  - [x] Add `replacesId` and `abstractsIds` pointers.
  - [x] Remove `variants` dictionary from `IrNode`.

- [x] **Phase 2: Processor Pipeline (`pipeline.ts`)**
  - [x] Delete `EpisodeEditor`.
  - [x] Define `ContextPatch`.
  - [x] Update `ContextProcessor` signature to accept `ProcessArgs` and return
        `Promise<ContextPatch[]>`.

- [x] **Phase 3: The Reducer (`sidecar/orchestrator.ts`)**
  - [x] Update `executePipeline` and `executeTriggerSync` to act as a reducer.
  - [x] Map `ContextPatch` results onto the flat Nodes array.

- [x] **Phase 4: Pristine Graph & Mapping (`contextManager.ts` & `ir/toIr.ts`)**
  - [x] Update `toIr` to produce a flat list of `ConcreteNode`s and a tree of
        `LogicalNode`s.
  - [x] Make `ContextManager` track the Pristine Graph and instantiate the flat
        Nodes.
  - [x] Commit patches to the Pristine Graph history.

- [x] **Phase 5: The Walker (`ir/projector.ts`)**
  - [x] Update projection to simply walk the flat `ReadonlyArray<ConcreteNode>`.
  - [x] Skip nodes whose IDs are in a "skipped" set (based on `abstractsIds`).

- [ ] **Phase 6: Refactoring Processors**
  - [ ] `ToolMaskingProcessor`
  - [ ] `NodeDistillationProcessor`
  - [ ] `BlobDegradationProcessor`
  - [ ] `HistoryTruncationProcessor`
  - [ ] `NodeTruncationProcessor`
  - [ ] `StateSnapshotProcessor`
