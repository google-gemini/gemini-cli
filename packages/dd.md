# User Simulation Feature - Design Document

*Branch: `user-simulation`*

## 1. Overview
The User Simulation feature enables an autonomous LLM-driven agent to act as a realistic user in interactive terminal sessions. It aims to support integration testing, evaluation, and background evaluation of system capabilities by effectively observing the terminal interface and supplying contextual standard input (stdin). 

This is accomplished by adding a `--simulate-user` option to the CLI, intercepting terminal updates via a simulated stdout reader, computing appropriate responses via an LLM, and piping these directly into a `PassThrough` stream masquerading as `process.stdin`.

## 2. Core Architecture

### 2.1 Configurations and Triggers
**Affected Files:**
- `packages/cli/src/config/config.ts`
- `packages/core/src/config/config.ts`
- `packages/cli/src/interactiveCli.tsx`

**Implementation:**
The feature is controlled via the explicit CLI argument `--simulate-user`. When supplied, the argument flows through the `Config` interface (`config.getSimulateUser()`), modifying how the interactive CLI bootstraps.
- Instead of attaching the raw `process.stdin` directly to the `ink` render environment, the UI engine binds to a Node.js `PassThrough` stream if simulation is enabled.
- The Interactive CLI session begins by initiating the `UserSimulator`, providing it access to the `Config`, the `simulatedStdin` buffer, and an observable snapshot of the `lastFrame` (the current state of the UI render).

### 2.2 The `UserSimulator` Service
**Affected Files:**
- `packages/cli/src/services/UserSimulator.ts`

**Implementation:**
The `UserSimulator` class governs the core observation and input loops. It handles interactions asynchronously outside of the primary command execution flow.

#### Loop Execution
The simulator runs via a repeating timer (3-second intervals `setInterval`), checking `tick()`. It ensures only one evaluation happens sequentially using a mutex lock (`this.isProcessing`).

#### Screen Processing and Environment Context
The engine receives the rendered terminal snapshot (`lastFrame`) and applies sanitizations:
- Removes ANSI terminal colors and cursor properties using regex filtering.
- Strips variable UI animation symbols (Spinners like ⠋, ⠙) and time indicators (e.g., `[ 7s ]`).
These visual stability checks allow the simulator to detect meaningful frame changes instead of being repeatedly triggered by minor clock updates.

#### Simulation Brain & LLM Integration
The simulator utilizes `PREVIEW_GEMINI_FLASH_MODEL`, leveraging the newly configured `thinking: true` capacity (`packages/core/src/config/defaultModelConfigs.ts`) for better reasoning, operating under the distinct telemetry role `LlmRole.UTILITY_SIMULATOR`.

The LLM is provided an extensive context schema encapsulating:
- **Terminal output:** Current stripped terminal representation.
- **Original task objective:** The intention of the CLI session.
- **Action Memory:** A tracked sequence (`actionHistory`) of previously executed actions to avoid getting stuck in inquiry loops.

#### State Machine Interpretation
The model translates the screen context into specific behavioral states:
- **STATE 1 (WAIT):** Triggered if any indication of internal "thinking" or processing exists (active spinners/timers). Returns `<WAIT>`.
- **STATE 2 (ACTION/AUTHORIZATION):** Prompt requests an approval (e.g., "Allow execution"). Supplies strict raw choice input.
- **STATE 3 (DONE):** Fully idle string detection paired with task completion fulfillment. Gracefully types `Thank you\r` and eventually exits indicating `<DONE>`.
- **STATE 4 (INPUT):** Idle state where continuation text instruction is needed, supplying direct commands injected to stdin.

#### Safeguards and Debugging
- **Anti-Stall Mechanism:** The simulator tracks repetitive actions. If the LLM repeats the exact same non-empty interaction `MAX_REPEATS` (3) times, it terminates the process abruptly to prevent infinite loops.
- **Interaction Transcripts:** Binds an audit log, dumping each parsed `[SIMULATOR] Screen Content Seen` block, the constructed `Prompt Used`, and `Raw model response` to discrete contextual `interactions_<timestamp>.txt` files, making it traceable.

### 2.3 Required Ecosystem Changes
- `packages/core/src/telemetry/llmRole.ts`: A new internal trace role `UTILITY_SIMULATOR` has been appended to separate evaluation events from main-thread generations.
- `packages/core/src/config/defaultModelConfigs.ts`: Added dynamic thought logic parameter (`thinking: true`) for `gemini-3-flash-preview` to enhance the simulation depth reasoning.
- Unit Testing Mocks: Updated dummy interface `mockConfig.ts` to ensure compatibility by safely mocking `getSimulateUser`.

## 3. Workflow Summary
1. The user launches `gemini --simulate-user`.
2. Interactive UI bindings swap `process.stdin` for a readable `PassThrough` stream.
3. Every 3 seconds, `UserSimulator.tick()` accesses the newest render frame. 
4. The frame is stripped of unstable metrics/spinners. If the clean frame is unchanged since the last tick, it waits.
5. If changed, the simulator invokes Gemini Flash Preview (Thinking).
6. Gemini observes the state—emitting `<WAIT>` if busy, action keys for selections, `<DONE>` if completed, or commands to be resolved.
7. Return text is piped cleanly back to `simulatedStdin`—advancing the ink render state.

*This design effectively encapsulates the user interface flow without imposing side-effects on standard operations.*
