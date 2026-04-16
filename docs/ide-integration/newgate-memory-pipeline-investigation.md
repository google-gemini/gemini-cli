# Newgate memory pipeline investigation design

This document defines the next investigation pass for the Newgate-style memory
pipeline around the Gemini CLI IDE companion and related bridge tooling.

Tracked issue: [#25549](https://github.com/google-gemini/gemini-cli/issues/25549)

The immediate goal is not to ship a full memory system in one step. The goal is
to prove, in order, whether the execution path is actually live:

1. A GH Copilot CLI `gpt-5-mini` worker can be started.
2. Worker completion is automatically captured into structured fleet logs.
3. Successful work becomes a KI queue candidate.
4. KI promotion makes the artifact searchable without a manual indexing gap.
5. Recall output is injected back into the next worker prompt.

## Verified current state

The current investigation already established these facts:

- The bridge process can be running while the GH Copilot CLI `gpt-5-mini`
  worker is not actually active.
- `fleet_log` currently records data only when it is called explicitly.
- KI promotion currently stops at file creation under `knowledge/`.
- Recall exists as a tool and memory API, but it is not injected into the
  worker prompt path.
- Pipeline① currently uses a JavaScript packetizer, so it cannot directly audit
  the Python and shell hook path that powers the worker memory flow.

## Investigation constraints

- Prefer executable verification over static reasoning.
- Record each result as a durable artifact so the next pass does not restart
  from theory.
- Keep the investigation scoped to the worker → log → KI → recall path.
- Do not assume a lane is live until a process, file, and prompt artifact prove
  it.

## Investigation sequence

### Phase 1: Worker boot proof

Verify the runtime path before touching downstream memory logic.

Checks:

1. Confirm the exact GH Copilot CLI command line used for the worker lane.
2. Confirm `--model gpt-5-mini` is really present at runtime.
3. Confirm the worker can see the `fleet_bridge.py` MCP attachment.
4. Capture a process snapshot and one successful worker response.

Required artifacts:

- worker command line
- process list snapshot
- raw worker stdout or structured response

Exit condition:

- A real `gpt-5-mini` worker run is reproducible on demand.

### Phase 2: Automatic output capture

After the worker is proven alive, verify that the output path is automatic and
not dependent on manual `fleet_log` usage.

Checks:

1. Run one success path and one failure path.
2. Confirm both create a fleet log entry without a human calling `fleet_log`.
3. Confirm the log payload captures task, result, failure cause, and runtime
   metadata.

Required artifacts:

- appended `fleet_YYYYMMDD.jsonl` entries
- the code location that emits those entries
- error payload for a failed worker run

Exit condition:

- Worker completion produces `fleet_log` side effects automatically.

### Phase 3: KI queue generation

Checks:

1. Confirm a successful worker run appends a queue entry.
2. Confirm repeated runs update the same candidate when appropriate.
3. Confirm queue metadata preserves source log and suggested KI name.

Required artifacts:

- `ki-promotion-queue.jsonl` diff
- candidate entry payload

Exit condition:

- The queue is produced as a consequence of worker success, not as a separate
  operator step.

### Phase 4: Promotion closes the indexing gap

Checks:

1. Promote one queued candidate.
2. Confirm `knowledge/<item>/metadata.json`, `timestamps.json`, and artifact
   markdown are written.
3. Confirm `ConversationMemory.index_knowledge()` or an equivalent indexing step
   runs automatically.
4. Confirm the promoted item becomes searchable without a manual follow-up.

Required artifacts:

- promoted knowledge directory
- indexing result or memory stats delta
- one successful search result that references the promoted artifact

Exit condition:

- Promotion makes the artifact recallable in the same flow.

### Phase 5: Recall injection

Checks:

1. Trigger a second worker request related to the promoted KI.
2. Confirm `ConversationMemory.recall()` or equivalent is called during prompt
   construction.
3. Confirm `context_text` is included in the worker prompt.
4. Confirm the final prompt artifact shows both static Newgate context and
   recalled memory context.

Required artifacts:

- recall payload
- final worker prompt snapshot
- downstream worker output that references the recalled material

Exit condition:

- Recall is in the live execution path.

### Phase 6: Visible status surfaces

Checks:

1. Confirm the UI or status snapshot shows worker state, latest fleet log,
   queue state, and recall/index state.
2. Confirm failure surfaces expose missing worker boot, hook failures, and
   indexing failures as warnings rather than silent gaps.

Required artifacts:

- status snapshot
- warning/error examples

Exit condition:

- An operator can tell which stage is broken without opening the code first.

## Non-goals for this pass

- Building a brand-new memory format.
- Replacing the existing KI directory layout.
- Solving Colab automation in the same change if the local execution path is not
  proven first.
- Treating Pipeline① JavaScript packet output as sufficient evidence for the
  Python and shell worker path.

## Success criteria

The investigation is complete when all of the following are true:

- A reproducible `gpt-5-mini` worker run exists.
- Worker output is auto-captured into fleet logs.
- Success auto-generates a KI queue entry.
- Promotion auto-indexes the promoted knowledge.
- Recall is injected into the next worker prompt.
- The active stage and failures are visible from operator-facing status output.

## Expected follow-up changes

If the investigation confirms the current gaps, the likely implementation work
will be:

- automatic `fleet_log` emission at worker completion
- automatic post-promotion indexing
- prompt construction that merges recall `context_text`
- operator-facing status for worker, queue, indexing, and recall stages
