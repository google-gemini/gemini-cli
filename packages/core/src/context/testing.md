# Context Pipeline Testing Strategy & Audit

## Philosophy: Defense in Depth
Our testing strategy avoids the "endless tax" of brittle tests by strictly separating concerns:
1. **Unit Tests (Processors, System Fakes, Mappers):** Exhaustively test logical boundaries, token math, and state transformations. Driven by shared, DRY test factories (no repetitive boilerplate).
2. **Component Tests (ContextManager, Orchestrator):** Test the *wiring* and *triggers*. Verify that barriers block, background pipelines execute, and events fire correctly.
3. **Golden / E2E Tests:** Test emergent behavior. Pass in complex, raw chat histories and assert the exact final projected `Content[]` output against committed JSON snapshots.

---

## Audit Checklist & Coverage Tracker

### 1. The Tooling Library (`contextTestUtils.ts`)
- [ ] Implement `ContextTestBuilder` or shared factory functions (`createDummyEpisode`, `createDummyState`).
- [ ] Ensure all existing tests are migrated to use these helpers to establish the pattern.

### 2. Unit Tests (The Processors)
Goal: Ensure every processor gracefully handles boundary conditions (budget satisfied vs. deficit), skips protected IDs, and correctly transforms IR.
- [ ] `BlobDegradationProcessor` (Mostly complete, needs migration to shared helpers)
- [ ] `ToolMaskingProcessor` (Mostly complete, needs migration to shared helpers)
- [ ] `HistorySquashingProcessor` (Audit coverage)
- [ ] `SemanticCompressionProcessor` (Audit coverage)
- [ ] `ContextTracer` (Complete)
- [ ] `SidecarLoader` (Complete)
- [ ] `IrMapper` / `IrProjector` (Audit coverage)

### 3. Component Tests (The Orchestration)
Goal: Prove the sidecar configuration accurately drives runtime behavior without testing the processor logic itself.
- [ ] `PipelineOrchestrator`: Test sync vs. async routing, and trigger setup.
- [ ] `ContextManager`: Test `subscribeToHistory` (Opportunistic triggers).
- [ ] `ContextManager`: Test `project()` (Synchronous barrier triggers).

### 4. Golden / E2E Tests
- [ ] `contextManager.golden.test.ts`: Ensure we have a scenario representing a "Day in the Life" of the CLI (some images, some huge tool outputs, deep history) mapping to a snapshot.

---

## Next Actions
1. Migrate processor tests to shared factories to DRY up the suite.
2. Go down the Unit Test checklist, ensuring full line/branch coverage for the core transformations.
