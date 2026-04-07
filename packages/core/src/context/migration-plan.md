# The Ship of Theseus Migration Checklist

- [ ] **Phase 1: Core Types (`ir/types.ts`)**
  - [ ] Add `ConcreteNode` and `LogicalNode` types.
  - [ ] Add `episodeId` (or generic `parentId`) to all `ConcreteNode`
        interfaces.
  - [ ] Add `replacesId` and `abstractsIds` pointers.
  - [ ] Remove `variants` dictionary from `IrNode`.

- [ ] **Phase 2: Processor Pipeline (`pipeline.ts`)**
  - [ ] Delete `EpisodeEditor`.
  - [ ] Define `ContextPatch`.
  - [ ] Update `ContextProcessor` signature to accept `ProcessArgs` and return
        `Promise<ContextPatch[]>`.

- [ ] **Phase 3: The Reducer (`sidecar/orchestrator.ts`)**
  - [ ] Update `executePipeline` and `executeTriggerSync` to act as a reducer.
  - [ ] Map `ContextPatch` results onto the flat Ship array.

- [ ] **Phase 4: Pristine Graph & Mapping (`contextManager.ts` & `ir/toIr.ts`)**
  - [ ] Update `toIr` to produce a flat list of `ConcreteNode`s and a tree of
        `LogicalNode`s.
  - [ ] Make `ContextManager` track the Pristine Graph and instantiate the flat
        Ship.
  - [ ] Commit patches to the Pristine Graph history.

- [ ] **Phase 5: The Walker (`ir/projector.ts`)**
  - [ ] Update projection to simply walk the flat `ReadonlyArray<ConcreteNode>`.
  - [ ] Skip nodes whose IDs are in a "skipped" set (based on `abstractsIds`).

- [ ] **Phase 6: Refactoring Processors**
  - [ ] `ToolMaskingProcessor`
  - [ ] `SemanticCompressionProcessor`
  - [ ] `BlobDegradationProcessor`
  - [ ] `EmergencyTruncationProcessor`
  - [ ] `HistorySquashingProcessor`
  - [ ] `StateSnapshotProcessor`
