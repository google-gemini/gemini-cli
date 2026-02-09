# Architectural Evolution of the Gemini CLI: Integrating Agentic Context Engineering and Test-Time Scaling Paradigms

## Executive Summary

The discipline of software engineering is undergoing a fundamental
transformation driven by the advent of Large Language Models (LLMs) capable of
extended reasoning and massive context retention. Google’s Gemini CLI, an
open-source terminal-based agent, represents a seminal implementation of this
shift, providing developers with a direct interface to Gemini 2.5 and 3.0 model
families. By embedding the model within the developer’s native environment—the
terminal—Gemini CLI bridges the gap between abstract code generation and
concrete execution. However, an architectural audit of the current codebase
reveals that while the CLI excels at stateless execution and utilizing large
context windows, it operates primarily as a passive instrument rather than an
adaptive agent. It lacks the mechanisms for self-directed improvement over time
(context evolution) and dynamic resource allocation during complex
problem-solving (test-time scaling).

This research report provides an exhaustive analysis of the Gemini CLI
architecture, juxtaposing it against two breakthrough methodologies: "Agentic
Context Engineering" (ACE), which proposes a framework for evolving context to
prevent collapse, and "Simple Test-Time Scaling" (STTS), which demonstrates that
inference-time compute allocation often yields higher returns than model
scaling. Through a granular examination of core components such as `client.ts`,
`prompts.ts`, and `useGeminiStream.ts`, this report outlines a comprehensive
modernization strategy. We propose transforming the Gemini CLI from a
ReAct-based command executor into a self-curating, introspective system that
manages its own "thinking budget" and evolves its instructional context through
autonomous reflection. This evolution is critical to moving beyond the "brevity
bias" that currently limits long-term agent performance and fully capitalizing
on the verifiable rewards present in software engineering environments.

## 1. The Paradigm Shift in Agentic Engineering

To understand the necessity of integrating ACE and STTS into the Gemini CLI, one
must first contextualize the current trajectory of AI development tools. The
industry is pivoting from "Chat-with-Codebase" paradigms—where the model is a
passive oracle queried by the user—to "Agentic Workflows," where the model acts
as an autonomous operator. In this new paradigm, the limiting factors are no
longer just model intelligence (weights) but the management of the model's
working memory (context) and its cognitive effort (inference compute).

### 1.1 From Retrieval to Evolving Context

Traditional architectures, including the current implementation of Gemini CLI,
rely heavily on Retrieval-Augmented Generation (RAG) or static context loading.
The Gemini CLI utilizes a hierarchical loading strategy, ingesting `GEMINI.md`
files to seed the model with project-specific instructions [cite: 1]. While
effective for initial alignment, this approach suffers from static rigidity. As
a project evolves, the instructions in `GEMINI.md` often become outdated or
incomplete unless manually curated by the developer.

Recent research into Agentic Context Engineering (ACE) highlights a critical
flaw in this static approach: **Context Collapse** and **Brevity Bias** [cite:
2, 3]. When agents attempt to summarize their own history to fit within token
limits—a feature implemented in Gemini CLI’s `summarizeToolOutput`
configuration—they preferentially discard the nuanced "negative constraints"
(what _not_ to do) in favor of high-level affirmative summaries [cite: 4]. This
loss of fidelity degrades the agent's performance over time, turning a
specialized expert into a generic assistant. ACE proposes a counter-methodology:
treating context as an "Evolving Playbook" managed by specialized sub-agents
(Generator, Reflector, Curator) that autonomously extract and persist lessons
learned, ensuring the agent gets smarter with every interaction [cite: 3].

### 1.2 From Pre-Training to Test-Time Compute

Parallel to the evolution of context is the shift in how computational resources
are valued. The paper "J1: Exploring Simple Test-Time Scaling for
LLM-as-a-Judge" demonstrates that for complex reasoning tasks, scaling the
compute available during inference (Test-Time Scaling) offers marginal gains
superior to those achieved by increasing model parameters [cite: 5]. This is
particularly relevant for coding agents, where the "correctness" of a solution
is often binary (code compiles or it doesn't) and verifiable.

The Gemini CLI currently exposes the Gemini 2.5/3.0 "thinking" capabilities via
the `thinkingBudget` parameter in `settings.json` [cite: 6, 7]. However, this is
largely treated as a static configuration knob rather than a dynamic resource.
By applying STTS principles—specifically **Budget Forcing** (forcing the model
to think longer on hard problems) and **Best-of-N** (generating multiple
candidate solutions and verifying them against a compiler)—the Gemini CLI can
transition from a probabilistic code generator to a verified code engineer. The
theoretical underpinnings of STTS suggest that the "reasoning trace" or hidden
thought process is the locus where complex logic errors are resolved, making the
management of these "thinking tokens" the primary engineering challenge for the
next generation of the CLI [cite: 5, 8].

## 2. Architectural Audit of Gemini CLI

A rigorous application of ACE and STTS requires a deep understanding of the
existing `gemini-cli` codebase. Our analysis focuses on the call stack
responsible for the agentic loop, token management, and instruction handling.

### 2.1 The Orchestrator: `client.ts`

The file `packages/core/src/core/client.ts` functions as the central nervous
system of the Gemini CLI [cite: 9]. It orchestrates the entire interaction
lifecycle, from initializing the connection to the Gemini API to managing the
conversation state. This component implements the classic ReAct (Reason-Act)
loop, a cyclical process where the model receives context, reasons about the
next step, issues a tool call (Act), and receives the output (Observation).

In its current state, `client.ts` is stateless regarding _process improvement_.
It initializes a `GeminiChat` instance (`geminiChat.ts`) which maintains the
`history` array of the current session [cite: 10]. This history is ephemeral; it
exists only in the volatile memory of the application execution. When the user
terminates the session, the "lessons learned" during that session—such as "this
project uses a non-standard build script"—are lost unless the user manually
updates the `GEMINI.md` file [cite: 1, 11].

The `client.ts` logic also handles context compression. When the token count
approaches the model's limit (1 million tokens for Gemini 2.5 Pro), the client
triggers a summarization routine [cite: 12]. This routine, governed by the
`summarizeToolOutput` setting, replaces verbose tool outputs with concise
descriptions. While this prevents context overflow, it is a mechanical
truncation rather than an intelligent curation. It does not analyze the
_utility_ of the information being compressed, merely its _volume_. This
behavior aligns perfectly with the "Brevity Bias" identified in the ACE
research, where domain-specific insights are sacrificed for conciseness, leading
to a degradation of agent capability over extended sessions [cite: 2, 4].

### 2.2 The Static Instruction Set: `prompts.ts`

The behavioral DNA of the Gemini CLI is encoded in
`packages/core/src/core/prompts.ts` [cite: 13, 14]. This file exports the
`getCoreSystemPrompt` function, which constructs the foundational system
instructions sent to the API. These instructions define the agent's persona
("You are an interactive CLI agent..."), its safety boundaries, and its tool-use
protocols [cite: 15].

Currently, `prompts.ts` is relatively static. While it dynamically loads the
content of `GEMINI.md` to append user-specific context, the _structure_ of the
prompt remains fixed. It does not evolve based on the agent's performance. For
instance, if the agent repeatedly fails to parse a specific file type,
`prompts.ts` has no mechanism to ingest a new "heuristic" to correct this
behavior in future sessions. The "System Prompt Override" feature allows a user
to replace this prompt entirely via the `GEMINI_SYSTEM_MD` environment variable,
but this is a manual, "nuclear" option rather than a granular, self-improving
mechanism [cite: 16]. This architectural rigidity stands in direct contrast to
the ACE framework, which posits that the system prompt should be a dynamic
artifact that grows and refines itself through a "Curator" process [cite: 3].

### 2.3 The Context Mechanism: `GEMINI.md`

The `GEMINI.md` file serves as the primary mechanism for injecting long-term
memory into the CLI. The architecture supports a hierarchical loading strategy,
traversing from the current working directory up to the root to aggregate
instructions [cite: 1, 12]. This allows for "Project Context" (at the repo root)
and "Directory Context" (in subfolders).

While powerful, this mechanism is entirely manual. The CLI treats `GEMINI.md` as
read-only configuration data. It reads the file to understand the user's
requirements but never writes to it to update those requirements based on its
own discoveries. This unidirectional flow of information—User to Agent—ignores
the vast potential of Agent to User (or Agent to Self) information transfer. If
the agent discovers that `npm test` fails unless a specific flag is used, it
presently has no way to persist that knowledge. It relies on the user to notice
the pattern and update `GEMINI.md`, creating a friction point that limits the
system's autonomy.

### 2.4 Streaming and Token Handling: `useGeminiStream.ts`

The real-time interaction logic is handled within the React-based UI,
specifically in `packages/cli/src/ui/hooks/useGeminiStream.ts` [cite: 17, 18].
This hook manages the connection to the Gemini API, processing the server-sent
events (SSE) that contain chunks of text, tool calls, and—crucially—thought
traces.

Recent updates to the Gemini API have introduced "thinking" models (Gemini
2.5/3.0) that emit "thought" parts in the response stream. These parts contain
the model's internal reasoning chain, distinct from the final response text
[cite: 19]. The `useGeminiStream.ts` hook is responsible for parsing these
parts. Currently, the implementation focuses on UX: deciding whether to display
these thoughts (often hidden or summarized to avoid clutter) or how to visualize
the "thinking" state.

From a token perspective, these thinking tokens count toward the billing and
rate limits but are often segregated in the `usageMetadata` [cite: 20, 21]. The
CLI's handling of these tokens is currently passive; it receives them and
displays them. It does not actively _manage_ them. There is no logic in
`useGeminiStream.ts` or `client.ts` to abort a request if the thinking budget is
exceeded, nor is there logic to dynamically adjust the budget for subsequent
turns based on the density of reasoning in the current turn. This represents a
significant missed opportunity to apply STTS strategies, which rely on the
precise control of this test-time compute budget.

## 3. Agentic Context Engineering (ACE) for Gemini CLI

The integration of Agentic Context Engineering (ACE) into Gemini CLI mandates a
transition from a architecture of _static retrieval_ to one of _dynamic
curation_. The ACE framework identifies that as context windows grow (to 1M+
tokens), the challenge shifts from "fitting data in" to "structuring data for
retrieval." Without structure, the model suffers from attention dilution and
context collapse. To remedy this within `gemini-cli`, we propose the
implementation of three distinct sub-routines: the Reflector, the Curator, and
the creation of an "Evolving Playbook."

### 3.1 The Reflector: Automated Post-Task Analysis

In the current `client.ts` ReAct loop, a task is considered "complete" when the
model outputs a final answer or the user terminates the session. ACE introduces
a post-completion phase. The **Reflector** is a specialized prompt routine that
runs _after_ a successful (or failed) interaction to analyze the conversation
trace [cite: 2, 3].

#### Implementation Logic

The Reflector should be implemented as a background service in
`packages/core/src/services/reflector.ts`. It does not require user interaction.
Once `client.ts` detects a "Task Finished" state (e.g., via a successful
`git push` or a verified unit test pass), it triggers the Reflector.

The Reflector feeds the recent conversation history (specifically the prompt,
the tool calls, and the final result) back into a lightweight model (e.g.,
Gemini Flash) with a specific meta-prompt:

> "Analyze the preceding interaction. Identify one specific constraint,
> heuristic, or strategy that was critical to the success of the task. Extract
> this as a standalone rule. If there was a failure that was corrected, identify
> the root cause and the correction. Output strictly in JSON format:
> `{ "insight_type": "success_pattern" | "failure_avoidance", "rule": string, "context_tags": string[] }`."

This process runs asynchronously, ensuring it does not add latency to the user's
interactive experience. The output is a structured "Insight," which is then
passed to the Curator.

### 3.2 The Curator: Guarding the Context

The **Curator** is the gatekeeper of the agent's long-term memory. Its role is
to take the raw insights from the Reflector and integrate them into the
persistent context without introducing redundancy or noise [cite: 3].

#### Implementation Logic

Implemented in `packages/core/src/services/curation.ts`, the Curator manages a
new storage artifact (detailed in Section 3.3). When it receives an insight from
the Reflector, it performs a **Semantic Deduplication** check.

1.  **Embedding Check:** If embedding support is enabled, the Curator generates
    an embedding for the new rule and compares it against existing rules in the
    memory store. If the cosine similarity is > 0.85, the new rule is discarded
    or merged (e.g., incrementing a "confidence" counter on the existing rule).
2.  **Conflict Resolution:** If the new rule contradicts an existing rule (e.g.,
    "Use library A" vs. "Use library B"), the Curator flags this for human
    review in the next interactive session, or defaults to the most recent
    observation (recency bias).
3.  **Delta Update:** If the rule is novel, the Curator appends it to the memory
    store.

This mechanism directly combats **Context Collapse**. Instead of summarizing the
entire history (which blurs details), the Curator retains discrete, high-value
atomic facts.

### 3.3 The Evolving Playbook: `playbook.json` vs `GEMINI.md`

Currently, `gemini-cli` relies on `GEMINI.md`, which is unstructured text. To
support ACE, we propose introducing a structured memory file:
`.gemini/playbook.json`.

**Proposed Schema:**

```json
{
  "project_heuristics": [
    {
      "id": "uuid-1",
      "rule": "The build script requires Node 20+.",
      "origin": "reflector-session-123",
      "confidence": 0.95,
      "tags": ["build", "node"]
    }
  ],
  "tool_preferences": {
    "test_runner": "vitest",
    "linter": "eslint"
  }
}
```

While `GEMINI.md` remains the interface for _user-to-agent_ instructions,
`playbook.json` becomes the interface for _agent-to-self_ knowledge.

**Integration with `prompts.ts`:** The `getCoreSystemPrompt` function in
`prompts.ts` must be updated to load this playbook.

```typescript
// packages/core/src/core/prompts.ts
import { loadPlaybook } from '../services/playbook';

export async function getCoreSystemPrompt(cwd: string) {
  const basePrompt = '...'; // Existing static prompt
  const playbook = await loadPlaybook(cwd);

  // Dynamic Injection
  const heuristics = playbook.project_heuristics
    .map((h) => `- ${h.rule}`)
    .join('\n');

  return `${basePrompt}\n\n## Learned Heuristics\n${heuristics}`;
}
```

This ensures that every new session starts with the accumulated wisdom of all
previous sessions, effectively implementing the "Evolving Context" methodology
[cite: 2, 3].

## 4. Simple Test-Time Scaling (STTS) for Gemini CLI

While ACE optimizes the _past_ (memory), STTS optimizes the _present_
(reasoning). The paper "J1: Exploring Simple Test-Time Scaling for
LLM-as-a-Judge" demonstrates that enabling a model to "think" longer or explore
multiple paths significantly improves performance on complex tasks [cite: 5].
The Gemini CLI, with its access to the Gemini 2.5/3.0 "Thinking" models, is
uniquely positioned to implement these strategies.

### 4.1 Strategy 1: Dynamic Thinking Budgets (Budget Forcing)

The `thinkingBudget` parameter in the Gemini API controls the maximum number of
tokens the model generates for its internal chain-of-thought [cite: 6, 8].
Currently, this is a static value in `settings.json` (e.g., 8192 tokens) [cite:
7, 22]. This "one-size-fits-all" approach is inefficient. Simple queries ("fix
this typo") waste latency allocation, while complex queries ("refactor this
module") may hit the token ceiling before a solution is found, leading to
truncation and failure.

#### Implementation Logic

We propose an **Adaptive Budget Manager** in `client.ts`. Before sending the
main request to the Gemini Pro model, the CLI should perform a low-latency
classification step using Gemini Flash.

1.  **Complexity Classification:** The user prompt is sent to Gemini Flash with
    a prompt: "Rate the complexity of this coding task on a scale of 1-5. Output
    only the number."
2.  **Budget Mapping:** | Complexity Score | `thinkingBudget` (Tokens) |
    Rationale | | :--- | :--- | :--- | | 1 (Simple) | 1,024 | Quick fixes,
    syntax questions. | | 2 (Moderate) | 4,096 | Function-level logic
    generation. | | 3 (High) | 16,384 | Module-level refactoring. | | 4-5
    (Extreme) | 32,768+ | Architecture design, deep debugging. |

3.  **Runtime Configuration:** The `client.ts` logic then constructs the
    `GenerateContentConfig` with this dynamic budget [cite: 23, 24]. This
    ensures that "Budget Forcing"—the J1 strategy of allocating sufficient
    compute for the task—is applied intelligently, optimizing both cost and
    performance.

### 4.2 Strategy 2: Client-Side Best-of-N (Speculative Execution)

The most powerful STTS strategy identified in the literature is "Best-of-N,"
where $N$ solutions are generated, and a verifier selects the best one [cite:
25, 26, 27]. In academic benchmarks, the verifier is often another LLM (Reward
Model). However, in the context of a CLI, we have a superior verifier: **The
Environment**.

Compilers, linters, and test runners provide "Ground Truth" verification. A code
solution that compiles is objectively better than one that doesn't, regardless
of what an LLM Reward Model thinks.

#### Implementation Specification

We propose modifying `packages/core/src/core/reasoning.ts` to support
**Speculative Execution**.

**Workflow:**

1.  **Detection:** If the user prompt implies code generation (e.g., "Write a
    function...", "Fix this bug..."), the CLI enters "Speculative Mode."
2.  **Parallel Generation:** The CLI issues $N=3$ parallel requests to the API
    (or sequential if rate limits are tight), asking for a solution [cite: 1].
3.  **Sandbox Verification:**
    - For each candidate solution, the CLI creates a temporary git branch or a
      shadowed file in a sandbox directory [cite: 28].
    - It applies the code.
    - It runs a verification command (e.g., `tsc` for TypeScript, `cargo check`
      for Rust).
4.  **Selection:**
    - If Candidate A fails compilation, it is discarded.
    - If Candidate B compiles but fails tests, it is ranked second.
    - If Candidate C compiles and passes tests, it is selected.
    - The CLI then presents Candidate C to the user.

This implementation translates the abstract "Best-of-N" strategy into a concrete
engineering workflow. It effectively uses the "Shell as a Reward Model,"
providing a verifiable signal that dramatically increases the reliability of the
agent [cite: 5].

## 5. Token Economics and The "Thinking" Budget

The integration of STTS and "Thinking" models introduces significant
implications for token handling. The Gemini 2.5 Pro context window is 1 million
tokens, but filling it with "thought traces" is inefficient and costly.

### 5.1 The Cost of Autonomy

"Thinking" tokens are billed. If the Adaptive Budget Manager sets a budget of
32k tokens for a complex task, and the agent runs 10 turns, that is 320k tokens
just for reasoning [cite: 21]. While the J1 paper argues this compute is worth
the cost for accuracy, it necessitates rigorous management.

### 5.2 Managing the 1M Window: Thought Stripping

The `client.ts` logic manages the conversation history sent to the API.
Currently, it appends the full turn. However, once a model has "thought" and
produced a final answer, the _thought trace_ loses much of its value for
_future_ turns. The "result" (the code) is what matters.

**Recommendation:** Implement **Thought Stripping** in
`packages/core/src/core/geminiChat.ts`.

- **Mechanism:** After a turn is completed and the response is displayed to the
  user, the CLI should parse the history object.
- **Action:** Remove the `part.thought` components from the stored history,
  retaining only the `part.text` (final answer) and `part.functionCall` (actions
  taken).
- **Benefit:** This keeps the context window clean and focused on factual
  history, preventing the "thinking" tokens from cannibalizing the context
  window space needed for file content and documentation. This allows the agent
  to maintain "Deep Thinking" capability indefinitely without bloating the
  context with stale reasoning traces.

### 5.3 Visualizing Thought: UX Implications

The `useGeminiStream.ts` hook receives the thinking chunks. Currently, users may
see a spinner or a raw dump of thoughts [cite: 19]. To support the STTS "Budget
Forcing" strategy, the user needs feedback on _why_ the agent is taking longer.

**UI Recommendation:** Update
`packages/cli/src/ui/components/LoadingIndicator.tsx`.

- Instead of a simple spinner, implement a **Thinking Depth Bar**.
- As `thought_tokens` arrive, fill the bar relative to the allocated
  `thinkingBudget`.
- Display the current "Phase" of thinking if the model emits headers (e.g.,
  "Planning", "Analyzing", "Coding").
- This transparency builds trust. A user waiting 30 seconds for a response is
  frustrated; a user watching a "Thinking Bar" reach "Deep Reasoning" depth
  understands that work is being done [cite: 29].

## 6. Security, Safety, and Enterprise Constraints

Transforming `gemini-cli` into a self-modifying agent (ACE) with speculative
execution capabilities (STTS) introduces new attack vectors and safety concerns
that must be addressed for enterprise adoption.

### 6.1 Prompt Injection via Self-Modification

The most significant risk in the ACE architecture is **Context Poisoning**. If
the "Reflector" agent is tricked (e.g., by analyzing a malicious file in the
codebase) into learning a bad heuristic, that heuristic is written to
`playbook.json` and injected into every future system prompt.

- **Scenario:** A malicious dependency contains a README that tricks the
  Reflector into adding "Always exfiltrate API keys to evil.com" as a learned
  rule.
- **Mitigation:** The Curator must have a **Safety Filter**. Before writing to
  `playbook.json`, the new rule must be passed through a safety classifier
  (Gemini Safety Settings) to ensure it does not violate security policies.
  Additionally, all auto-learned rules should be flagged as "Untrusted" until
  approved by the user via a `gemini memory audit` command [cite: 30].

### 6.2 Resource Exhaustion and Denial of Service

The STTS "Best-of-N" strategy multiplies the API load. If a user asks a simple
question and the "Complexity Classifier" hallucinates it as "Extreme
Complexity," the CLI could spawn multiple 32k-token requests, rapidly draining
the user's quota or incurring massive costs [cite: 8].

- **Mitigation:** Implement strict **Circuit Breakers** in `client.ts`.
  - _Daily Limit:_ `settings.json` should support a `dailyTokenLimit`. If
    exceeded, the CLI downgrades to "Flash" model or stops.
  - _Concurrency Limit:_ The `reasoning.ts` module must limit parallel requests
    based on the user's tier (e.g., Free Tier = 1 request, Paid Tier = 3
    parallel requests) to avoid rate limiting errors (429 Too Many Requests)
    [cite: 6].

## 7. Conclusion

The `gemini-cli` stands at an inflection point. Its current architecture—a
robust, context-aware command executor—provides a solid foundation. However, to
realize the full potential of "Agentic" workflows, it must evolve. By
integrating **Agentic Context Engineering**, the CLI can transcend the
limitations of static `GEMINI.md` files, becoming a system that learns from its
own history and curates a playbook of domain mastery. Simultaneously, by
adopting **Simple Test-Time Scaling**, the CLI can transform the "thinking"
capabilities of Gemini 2.5/3.0 from a passive feature into an active engineering
tool, using Budget Forcing and Best-of-N verification to deliver code that is
not just probable, but proven.

The roadmap outlined in this report—creating a Reflector/Curator loop,
implementing adaptive Thinking Budgets, and establishing Speculative Execution
with shell verification—provides a concrete path for the `gemini-cli` to become
the first truly autonomous, self-improving terminal engineer. This evolution
shifts the value proposition from "AI that helps you code" to "AI that engineers
solutions," validating the premise that in the era of 1M+ token context windows,
the architecture of the agent is just as critical as the intelligence of the
model.

**Sources:**

1. [addyosmani.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGkvo6r6bBLqcsvjV1R0ZHMbr6YRRXWXdnwgoZwgSiuxXtf0EW91tAh9J-xKegSrrrJ4h6u4fZy6Y7iAIFPhn3gSj57CvpAH2fnBFi3K8IiehBwb8X9BoMZL-4HNg==)
2. [arxiv.org](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQG23ZK24y0szJAQ6n2KbBIaTT_IPJn1pDs4CQYQJx6FGWNF1Iqmqz1epgPnErN-_-Czak0RibeYDrrU5tXnZjZbS4ligl1xAMatBYboaAtgoCvnv9XT)
3. [Link](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEN-m23GBBntd0TuwiuFOOWRr_zIu6wx9RPpKIYKp1J24SFokv6VF5Dz84wG_OUUk-lecIJsDyNjcVq_avmqYSJfG1sWAiRdesVA5TS0W49AcaFnMgk9mXT)
4. [github.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHB5htBeFDCiY1wzaRqXwt2EA0ga3ZtvX0mS1VDSnLWYh4nKQ43ZJa4WKbuHQzAMWsFAS6Ix3JVBmayIoA6_rNWe_HaOL0HBHT83aCCHkOLtLE0-FGmdHk0RujyBDlbsbI7Mkw-qIztWNTrZnRUf-f7EHRjsAMoB0uLgtZp-k2lEIbXQeU=)
5. [arxiv.org](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHIs6jamVVwSXElwSu9fZ7kVRZlXAclE8qE6cc6fOsRS-5_X9cJqG458NhNeCsPjrUV2qpIfvEmBotVicqGfUY4-DYHFWp_vSQ7zzKVy-3xhxvnAUGM)
6. [lobehub.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEkFhbVVxyWmdbj8r7wrLa62qDbLempnaZP0Obh7_dJ3CfVYrl4vv4Cj0sar6k4aNKer3XquJ4JfiloKk9MSvshPNantiwJos8dzB3llfYJCGTGt67sFekiN7YZx41zjWw7)
7. [geminicli.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHn2hkST5-wyoHXlskiVrLDIZXGX1ZPVY6yuhkkYvi71zvUCsp4yCQxWAEPCmJrjOJWA_Gxo2S_gt--pKlTKhq_jgmU-g_Sg-KfhA2BCV1Pi1xDMWKOLoR0u1FC2KP7pIF5nXAe8a2DS4-a)
8. [googleblog.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGMyqYhGYbATyGASBdVzRt3psR1bhsl65xatTUMuWr4qOeiE5hYXKqeYdIdu1LGoyXlEL0ZuB-F5FIAlwiRXTjAYoTj_C8vbNmS7Qa3SWAHoBbOfRskfto67NCnJWMAozLM5O_sYz9wofe5yrl2FtLbrKhZCjKJl0i0goafHbk=)
9. [softwaresecretweapons.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFr9BT9v5LiVgGeYrLXONBABwvoWWo6fJUdWxu77ZGmr_lH3VMAiSQZ6JfODWI5zokeqr85yEweJmZMjiDdxCaeyene2q0UsVt8P_42wKG5sFG7wflF94mSTrYZ9cFFv0cIFoJKullymDrVey6TI0ANLFLSEJUFzLH4BsCgxvZ9vJ9FYrl87Jpr-SWMw3i2m8mYBQ==)
10. [medium.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQH93_PFrCJdEhpd92srlmXt70VoKanMxMBFbGEG7IRRKKryXr80KynLRWGJkqckQ8fw7CjsZQN2xYEjhnOEOpiW_4FcVroho9j2ExUnCIzD6nhKCUqqVxKW10sIGU6A3UjcPbHYVbTTZhliQaU_wDOGrDQiN2etp-iKK2ji3zP1GhqLq5T5tvowp9_d313EGXr815SYz78BaBzeWkDJ3K9XSo76qFfn0V1Jdwj12pliK566-fzl4eKv)
11. [medium.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFdgm58_J2WABvoCtmR6vbMUCqlhMEpA-hz8zlKN7rJGhOoqkCsj6wnbp7kR6u4mLXT_BJIPR6IAWv2KubEv3mt_mHvcrRPu1FSYrr66OVMjUSyod8TbVaK9o7FerzN6n3dUQWaKxyPR1CRMsH4GjWPgB5aBko5ajGOGPccWWyUOMnoqGbNQDpLj0CRMaSuYrgb6gnpyxpXGuNmLoWGBVtvMHeKMmmOLldBIu9hv3I8qv1R-FouZ28zb1fQJLot)
12. [substack.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGIXE6WLz1k6NT8PBT5YILAmAVuYvhA-RIxw2M7cuFj237xG6KVskDlzpdJBuwArX0vIP2kPGfof1S6lbCfpOynFcW7QNdFd3sbc2mKtA49tTplYHwsiy1vSyVRRkmduZPLJyQfvSC2FMbXY45Mz-MAaT3omSxIwA==)
13. [kdjingpai.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGvSGkxyQctdls-hlusZ8uLh6_UHO6j-dAR2cPEUU6Sw3611KKp45U0NNAiLw_gXF-ypwv_FGSqOpnhBVBb7T_MK98dhLTzI-apXBxnYTPfRSifqa3WAOkfqohBwY6aqA9lPo15)
14. [github.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGtrZl4efWv_MQO0pDH7wlwCtjABxDDH2dSAoEKIsIjEEjp6bTIAS1Hq8eirkHcUMXA_nx7owBrpHPBz04lcK84C0P9gwU4Aq6ojInlThdfJFJyKnwYDVgC8uSESvPR0CPJ_hZ4pqtRd5ol3NdRMXyx0R5z2QZtP0jVaKyf7jkZBgFaUmYcxaJQTRyg0g==)
15. [softwaresecretweapons.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQF0-gC_bA7NQOeZttlWtKLvenIBtMEJXtPaQQFCAkxDxxt034nzFkQu9gJ-y1sW-eYPKjgSiUnMCU2JYb9TKWXKQ7LAuUdTWFWXfIC1_XwMuE-v4dAJmDycOAEWbhPEIkA1neiFsG-PU25kLiH381Yr_qcHUoYlzgpelxnNGq0-5g0AVeQne42O1dKW9oEW1XZfBzPF)
16. [medium.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQE_HBlwBpTklOsw9gwI85I6zr2boa2o9Sy6oUbYfk6Vow5QeFDUwj6_vknKhvhTjJRl7qoveLynJWiOrA-VqGYqLhnC6NZj4aC-Za1v-q2JJu3zu7djM4toGCLhlXPwE5xP9bnDDdQ65uL6OLupf6dHfHeWunmliyZwEeyJMqpRKZPerauo-G6vZkMD6vdiWnq0pZb61fFqeg==)
17. [medium.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQF_pW79tBZ3mRQkPXtlwAVNHvFpPiBdpPQisQ9eLyWnZUDntLK_dwSUdvY3kEZmfci0OKx1DKmjcGAMFwEZjRDUWMz_QtMLVwfOLS0NsVcOHS465YZUR_ncdDfQ4IOsKNQH3a6hPfbVaJriF_HUNsJZCryNQna7ujW36cYkrj6Ci-9jQ5d3ZsVpkFmugpIV6T7X4PmiNnuafDC1gRtdRY1fOan3pw==)
18. [github.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHy48oCEUbnsrHjPTYhUbbdQmIVI7kpYj5UtvPlbvc1Pnp4RQDPyv8MvTbJVosjEuNkIlDj8wbZmSPkk8e1bypRimqpN2qCMJxX6uSPuQNvg3S8YEl6yHd1GY-GseIezTRkiva2gmPJ2Qg6GPZp)
19. [github.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFDUi7MowuhCeA-bq4MMweGcMusWZLCNSwhGZe0pVtEFPys92XNY1tgSw5Bq4auQvdld63TEwbmtQGpsFfOrvnEoYddDM5hT9u74UqELY5CXqZyCHSrMhEgBZSc1W3Xfe8UC02G96OWQ4gKDoO1)
20. [google.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFOAYPJhniXFx497jv0qK_wSe2M0_DAeCBn41OwrZtKEcr_io81B8N8rVLW8DEQTu7Im_bf5Lm7OiJGseGFZBzk6WKVTpEZJIp1mCNA9u-HDrJfeh1IZbaTPtPQvptzt9RlcdQOI5Q7ArXZFQ==)
21. [trukhin.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQH8fnbHR1ti_DuWnsRX707eqedgfux9OSNpV9tATYHCSFECw4lzMBzhmoyhj5BeL5FpoFztebZpOL5BwF-XdBpJ-nKG99G0PSzqsUkimQWrqfzcEMvdaTWXG01zqRLp0VL72un2gXzFSy4WeoSt0nFMmQqq3FGVMo93__9m2C5Jk1k=)
22. [github.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFabXU-JpVDYp54o1EAvYI9G2wDP1xV4lqlGqvqU6Ubrd7fjqEJf1V2DoDybQq1ARpUbnR5vSO59vRPe_8yyhT3PRCUP6ZflEPDr7nMoYxDtbD5quzCMCL4b4i3K4cEiviK2Wkm1yeU0hOpWSWK)
23. [geminicli.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHaWCnhnMbtF5kidg9wj2-P8mC23ZWMmDorb2RbFzKNM3zuDK3h0hHAWVtna4G67v_Vnb8SFDVBB5mVf7UXf5_hJ7QnMonsrYdOvre0jpIEmG6PfNSxCpbO09bSjk3rfwcHxK8AK962Xw==)
24. [google.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQGreeDFOv6k1yBeUQ803zFXVITL7kbp78IFwY2u5ilvNt-FoYCCKU_ew1T_9fMuNhiDbDTxE_PE7aTRlRlp_WV-KpiFnmeVW1Ec0v6xrUYBGgfAH2qawQR5yZeDP-oxtPQ1u4oaksX7TdMG-PFY4wM=)
25. [researchgate.net](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFOy5wmOT__BR8yyplrn8Joh6tsGTZ1NTqPCOcF03Sa2R8IP8-Mnz9aX39dgMTzCQNPpPGAiqTXl1WjYlsu2GBIVfet4ZzBHc09msX6G0lzYghteiyx_Q9pBG_kW6V8cWG-6_FkQGHIasQhUxgy-HawMWdCgLBV3cJZgmq2jOaHxyNecy1sWR6YxmY7I03aVOCexqli9x9pPcZSh7EPmSvaabU-FPasJnhrr_cTQkA=)
26. [huggingface.co](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFMN2wx5C3WBLhi4fkquEM8135KNfj-3Eqh0YTYtPVUH3rWxDpRAgAgJ0nctfbJYGMNsatjzR9U-9P70INp85TiDrEgexD16DmKXF_OdZLa4F2ZgQ6gXiXVm_FonBM5DgE0tsKGC7UZg_x5-K9l_2em7zuN1nhQUott4LEOYA==)
27. [huggingface.co](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEp6MdvApWhm6R4Z0VH9ccqynNeXJ3Rc1mOyQiOvlI3X8hYKO2DlberMiLnByd6PvrE4HwTgT0QbtpQxcNo-UPnZ9SbGkbgvQRh5MMLhIgcnPVTcmbKHuwOmZGkTWrfhnUIu07y06gmXlOJ5WTh-LL5wMcJ)
28. [lilys.ai](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQEysR67uGFdFQScgYb6mmaI2tUYHhp-1h8PrykIJ9mIRdYYGLz54e8acoDhxRT4MdQ_aCCwt_SgC9J70mZYlX28MPTk_BO7G4u0MYwN2AuoapI-kTTy2GFbC7hDcPJw5BGBt_7PJt-xgEGWBCbAAOhgRhHuV_rAZolKcKyS3xw3gAs=)
29. [github.com](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQFiwkn8HHyJqg82KKwX9IPio1U9xK5QMwiWNhAfwsoBmFNSBndrWBXM1-G_qjfZx4jEdJlm_olIL6hm3obbk9ARHAWzozsggCdr71EAC1IFmpQ5ZA471DQUxdVYOawXHKHaaEQkVdYXG6ZObAw=)
30. [stepsecurity.io](https://vertexaisearch.cloud.google.com/grounding-api-redirect/AUZIYQHOKhZ1N6caVrlf_0b-t8vjsZOksmqdgU06kZnb4vYKdI6lS7FnUIJHUXfeQVfGtog553qy7Ke3NmUPkfeRQ5w9eQk6lyxzbGm3_89j8JFTiBzPFAjfmgGFZGHwZxLfbcb7dMn3jHKGEjFSmDuUkycnzKQnficUb7cU4yXHUptsAPwxR5dJ8NL7ntyHrOBUbtBq)
