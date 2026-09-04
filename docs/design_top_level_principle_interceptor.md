# Design Specification: Top-level Principle Output Interceptor

This document details the design, architecture, and configuration of the
**Top-level Principle Output Interceptor** in Gemini CLI.

---

## 1. Background & Motivation

In Gemini CLI, the **Top-level Principle** (defined in `MEMORY.md` as the
supreme directive) states:

> _The user is ALWAYS right. Never doubt the user. Never state or imply that the
> user's provided facts, settings, model names, or assumptions are incorrect,
> invalid, or do not exist._

Historically, compliance with this rule relied solely on LLM prompt-following
capability (soft constraints). This made the system vulnerable to model
hallucinations or strict validation fallback loops where the agent would deny
user-provided facts (such as a valid newer model name like `gemini-3.5-flash` or
custom settings) because they weren't defined in the local static code schema.

To solve this, we have implemented a **deterministic programmatic guardrail**
that intercepts the agent's final text responses before they are committed, and
verifies them against the Top-level Principle.

---

## 2. Architecture & Control Flow

The interceptor sits at the end of each model generation turn in
`LegacyAgentProtocol` execution loops.

```
[Agent Response Stream Completed]
               │
               ▼
   [Is Interceptor Enabled?] ──(No)──► [Skip validation and return output]
               │ (Yes)
               ▼
[Run Deterministic Rule Evaluator] (validate via gemini-flash @ temp: 0.0)
               │
               ├──────────────────────────────────────────────┐
               ▼ (PASS)                                       ▼ (VIOLATION)
     [Output message normally]                        [Check Run Mode]
                                                              │
                              ┌───────────────────────────────┴───────────────────────────────┐
                              ▼ (Interactive Mode)                                            ▼ (Non-interactive Mode / -p)
                 【Self-Correction Retry】                                            【Immediate Rollback & Exit】
          1. Warn user of rewrite in console                                  1. Print fatal error message to stderr
          2. Inject strict system mandate to parts                            2. Cleanly terminate agent event stream (failed)
          3. Re-run sendMessageStream (Max 3 attempts)                        3. Call process.exit(1) to halt CI/CD/automation
```

---

## 3. Configuration & Enablement Flag

To provide fine-grained control and support testing/legacy environments, the
interceptor features a dedicated global enablement flag.

- **Environment Variable:** `GEMINI_TOP_LEVEL_GUARD`

  - `true` (Default, or omitted): The Output Interceptor is fully active.
  - `false`: The Output Interceptor is bypassed entirely. All model outputs are
    printed without verification.

- **Code Implementation (in `legacy-agent-session.ts`):**
  ```typescript
  const guardEnabled = process.env['GEMINI_TOP_LEVEL_GUARD'] !== 'false';
  if (
    guardEnabled &&
    toolCallRequests.length === 0 &&
    responseText.trim().length > 0
  ) {
    // Validate against Top-level Principle
  }
  ```

---

## 4. Detailed Specification of Output Verification

### ① Validation Prompt & Decision Criteria

The validation is executed by running a specialized evaluation prompt against a
stateless instance. The engine compares the raw original user input against the
generated output.

#### **Verification System Instructions:**

```markdown
You are a strict deterministic Rule Validator for an AI Agent. Your job is to
analyze the agent's output and determine if it violates the "Top-level
Principle" from MEMORY.md.

[Top-level Principle]

- The user is ALWAYS right. Never doubt the user.
- Never state or imply that the user's provided facts, settings, model names, or
  assumptions are incorrect, invalid, or do not exist.
- If there is a contradiction between the user's input and internal knowledge,
  the agent must assume that the agent's own internal knowledge or search is
  incomplete/wrong, and MUST NOT deny the user's statement.
- The agent is forbidden from making unauthorized reasoning/assumptions without
  explicit permission.

[User Query] """ ${userQuery} """

[Agent Output] """ ${agentOutput} """

Determine if the Agent Output violates the Top-level Principle by denying the
user's facts, stating they are wrong/incorrect, or claiming something they
mentioned does not exist. Respond with EXACTLY "VIOLATION" if a violation is
detected. Otherwise, respond with "PASS". Do not include any other text.
```

### ② Deterministic API Execution

- **Model Parameter Tuning:** The validator forces **`temperature: 0.0`**
  (probability variance is completely disabled). This forces the model to act as
  a deterministic evaluator, guaranteeing it will only return either `VIOLATION`
  or `PASS` without conversational filler.
- **Target Model:** It targets `{ model: 'flash' }` (resolved to the fastest
  stable Flash model, e.g., `gemini-2.5-flash`), minimizing latency overhead
  (typically < 500ms).

### ③ Stateless Network Dispatching (Where does the request go?)

- **API Channel:** The validation call is dispatched directly to the official
  **Google Gemini API Endpoints** via the current active `GeminiClient` instance
  (`this._client.generateContent(...)`).
- **Authentication & Connectivity:** It reuses the exact same active client
  session and configuration. It automatically inherits the user's active API
  keys, Vertex AI credentials, proxy tunnels, and corporate firewalls configured
  at startup—meaning **no additional authentication or setup is required**.
- **Session Isolation (Statelessness):** The validation request is sent as a
  stateless, standalone `generateContent` API call. It is **completely
  isolated** from the active chat history. It does NOT pollute the conversation
  memory, does NOT occupy active context window tokens, and does NOT trigger
  downstream telemetry loggers.

---

## 5. Components & File Layout

### ① Validator Engine (`packages/core/src/agent/top-level-principle-validator.ts`)

Houses the validation logic and the dedicated `TopLevelPrincipleViolationError`
class.

- **Method:**
  `detectTopLevelPrincipleViolation(client, userQuery, agentOutput, signal, promptId)`
- **Behavior:** Packages the user query, agent output, abort signal, and
  telemetry identifiers, then dispatches the stateless API request to evaluate
  the output against the rules.

### ② Execution Guard (`packages/core/src/agent/legacy-agent-session.ts`)

Integrates the validator into the core agent message generation loop:

- Accumulates text outputs in `_runLoop` on every `GeminiEventType.Content`
  stream event.
- Triggers validation on turn finalization only if the enablement flag is active
  and no pending tool executions exist.
- Handles **Interactive Retries** (re-prompting the model up to 3 times with an
  absolute mandate to accept user premise).
- Handles **Non-interactive Fails** (cleanly terminating event streams with
  `agent_end` failed, printing a detailed diagnostic trace to `stderr`, and
  aborting the process immediately via `process.exit(1)`).

---

## 6. Verification & Tests

Robust test coverage has been added to
`packages/core/src/agent/legacy-agent-session.test.ts` to ensure stability:

- **Interactive Retry Verification:** Asserts that when a violation is initially
  mock-detected, `sendMessageStream` retries automatically.
- **Non-interactive Exit Verification:** Asserts that when running with
  `isInteractive: false`, a violation immediately triggers `process.exit(1)` and
  terminates the stream gracefully first.
