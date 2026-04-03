# Product Requirements Document (PRD): Gemini CLI Memory Optimization

## 1. Objective

Reduce the memory footprint of `gemini-cli` during long-running sessions
(multi-hour) from the current peak of ~2GB down to a sustainable baseline (e.g.,
< 500MB), without degrading existing functionality, user experience, or context
awareness.

## 2. Problem Statement

Users experience high memory consumption (up to 2GB) when running `gemini-cli`
for extended periods. High memory usage leads to sluggish terminal
responsiveness, system swapping, increased GC (Garbage Collection) pauses, and
eventually OOM (Out of Memory) crashes. Node.js applications that retain large
amounts of execution history, tool results (like large shell outputs or file
reads), and conversational context in memory often suffer from "soft memory
leaks" (unbounded data growth).

## 3. Scope

**In Scope:**

- Analyzing and profiling the memory usage of the `@google/gemini-cli-core` and
  `@google/gemini-cli` packages.
- Identifying and resolving memory leaks (e.g., un-deregistered event
  listeners).
- Implementing bounded memory for unbounded data structures (e.g., chat history,
  activity logs, tool execution results).
- Optimizing data serialization/deserialization and large string handling.
- Creating automated memory profiling scripts and validation workflows.

**Out of Scope:**

- Rewriting the CLI in another language (e.g., Rust/Go).
- Removing core features or aggressively truncating the LLM context window
  (unless specifically configured by the user).

## 4. Key Results & Metrics

- **Peak Memory Usage:** Reduce peak memory usage (`RSS`) during a 4-hour
  simulated session from ~2.0GB to < 500MB.
- **Baseline Memory:** Ensure baseline memory after forced garbage collection
  remains flat (does not grow linearly with the number of turns).
- **Quality Gates:** 100% of existing unit, integration (E2E), and preflight
  tests (`npm run preflight`) must pass.

## 5. Technical Approach & Hypotheses

1. **Unbounded History Retention:** The agent's session history stores full
   payloads of every tool execution (e.g., `read_file` of a 5MB file, or verbose
   `run_shell_command` outputs).
   - _Mitigation:_ Implement aggressive in-memory truncation for older turns
     that are no longer sent to the model, or offload historical payloads to
     temporary disk files.
2. **React/Ink Memory Leaks in CLI UI:** Unmounted Ink components might not be
   garbage collected if references are held in global state, context providers,
   or event listeners.
   - _Mitigation:_ Audit `useEffect` cleanup functions and global event listener
     deregistration in UI components.
3. **DevTools / Logger Retention:** The `activityLogger.ts` or telemetry systems
   might buffer unbounded amounts of events in memory before flushing.
   - _Mitigation:_ Ensure logs are streamed directly to disk or the WebSocket
     without retaining a massive ring buffer in memory.

## 6. Testing & Validation Strategy

To validate memory usage, we must simulate a heavy session, measure memory, and
ensure correctness.

### 6.1 Creating the Memory Profiling Script

Create a script `scripts/simulate-long-session.ts` to programmatically drive the
CLI and measure memory growth.

```typescript
// scripts/simulate-long-session.ts
import { exec } from 'child_process';
import * as v8 from 'v8';
import * as fs from 'fs';

// Helper to force GC if run with --expose-gc
const runGC = () => {
  if (global.gc) {
    global.gc();
  }
};

const printMemory = (turn: number) => {
  runGC();
  const usage = process.memoryUsage();
  console.log(`Turn ${turn} - RSS: ${(usage.rss / 1024 / 1024).toFixed(2)} MB, HeapUsed: ${(usage.heapUsed / 1024 / 1024).toFixed(2)} MB`);
};

async function runSimulation() {
  console.log("Starting memory simulation...");
  // Simulate 100 heavy turns
  for (let i = 1; i <= 100; i++) {
    // Inject mock messages or trigger SDK agent actions here
    // e.g. agent.processInput("Read a large file and summarize it")

    // Simulate heavy string allocation
    const dummyData = "A".repeat(1024 * 1024 * 10); // 10MB dummy data

    printMemory(i);

    // Periodically take heap snapshots
    if (i % 25 === 0) {
      const snapshotName = \`heap-snapshot-turn-\${i}.heapsnapshot\`;
      v8.writeHeapSnapshot(snapshotName);
      console.log(\`Saved \${snapshotName}\`);
    }
  }
}

runSimulation();
```

### 6.2 Steps to Validate Memory Usage

1. **Establish the Baseline:**
   - Run the simulation script on the `main` branch to capture the baseline
     metrics.
   - `NODE_OPTIONS="--expose-gc" npx tsx scripts/simulate-long-session.ts`
2. **Heap Snapshot Analysis:**
   - Run the CLI manually with the inspector enabled: `npm run debug` (or
     `NODE_OPTIONS="--inspect" npm start`).
   - Open Chrome DevTools (`chrome://inspect`).
   - Take a baseline heap snapshot at startup.
   - Run heavy tasks (e.g., `read_file` on large files, `run_shell_command` with
     huge outputs).
   - Take a second heap snapshot.
   - Compare the two snapshots in DevTools. Look for retained objects, detached
     DOM nodes (Ink elements), or massive string allocations.
3. **Verify the Fixes:**
   - Apply the memory optimizations.
   - Re-run the simulation script. The printed `HeapUsed` and `RSS` should
     flatline after a certain number of turns rather than growing linearly.
   - Compare the final heap snapshot size to the baseline.

### 6.3 Ensuring Build and Tests Pass

Memory optimization can inadvertently break functionality if data is truncated
too aggressively.

1. **Run Targeted Tests:** During development, verify core logic using targeted
   tests:
   - `npm test -w @google/gemini-cli-core`
   - `npm run test:e2e`
2. **Run the Preflight Checks:** Before creating a PR, run the exhaustive
   validation suite to ensure no regressions:
   - `npm run preflight`
3. **E2E Validation:** The existing E2E tests
   (`packages/cli/integration-tests/`) will verify that the CLI still behaves
   correctly from a user's perspective, ensuring that history truncation or
   memory offloading doesn't break multi-turn context.

## 7. Execution Plan

- [x] **Phase 1: Instrumentation & Baselines**
  - [x] Implement `scripts/simulate-long-session.ts` or add an eval script.
  - [x] Capture baseline memory metrics and initial heap snapshots.

2. **Phase 2: Analysis & Implementation**
   - Identify the top 3 memory retainers using Chrome DevTools.
   - Implement bounded retention (e.g., capping array sizes in memory,
     offloading heavy execution logs to the `.gemini/history` temp files).
   - Audit React/Ink components for event listener leaks.
3. **Phase 3: Validation & CI**
   - Run E2E tests to ensure behavioral parity.
   - Run `npm run preflight`.
   - Consider adding a lightweight memory-growth check to the CI pipeline to
     prevent future regressions.
