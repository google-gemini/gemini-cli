# Asynchronous Context Management (Dataflow Architecture)

## The Problem
Context management today is an emergency response. When a chat session hits the maximum token limit (`maxTokens`), the system halts the user's request, synchronously runs expensive compression pipelines (masking tools, summarizing text with LLMs), and only proceeds when the token count falls below the limit. This introduces unacceptable latency and forces trade-offs between speed and data fidelity.

## The Vision: Eager Subconscious Compute
Instead of a reactive, synchronous pipeline, Context Management should be an **asynchronous dataflow graph**. 

Because we know old memory will *eventually* need to be degraded or garbage collected, we should utilize the agent's idle time (while the user is reading or typing) to proactively compute "degraded variants" of episodes before there is any context pressure.

### The Three Phases of Memory Lifecycle

#### 1. The Eager Compute Phase (Background / Continuous Streaming)
Context pressure doesn't wait for an episode to finish. If a user pastes a 100k-token file, the budget explodes instantly. Therefore, the dataflow graph is fed continuously.
*   Whenever `AgentChatHistory` emits a `PUSH` event, the new `Content` is mapped into the active, "open" `Episode` (e.g., as a `USER_PROMPT` trigger or a `TOOL_EXECUTION` step) and broadcast immediately.
*   **Processors (e.g., SemanticCompressor, StateSnapshot) listen as background workers.**
*   They eagerly compute degraded variants on partial episodes. For instance, `SemanticCompressionProcessor` can summarize a massive 100k `USER_PROMPT` the millisecond it arrives, without waiting for the model to reply.
*   It attaches the result to the IR graph as `Episode#1.trigger.variants.summary`.
*   **Result:** This costs the user zero latency. The agent is "dreaming/consolidating" granular memory chunks in the background, even during long-running "mono-episodes."

#### 2. Opportunistic Replacement (`retainedTokens` Threshold)
When the active context window crosses the "ideal" size (e.g., 65k tokens):
*   The system identifies the oldest episodes that have fallen outside the `retained` window.
*   It checks if they have pre-computed variants (e.g., a `summary` or `masked` variant).
*   If yes, it instantly and silently swaps the raw episode for the degraded variant.
*   **Result:** The context gently decays over time, completely avoiding hard limits for as long as possible, with zero latency cost.

#### 3. The Pressure Barrier (`maxTokens` Hard Limit)
When the active context window crosses the absolute hard limit (e.g., 150k tokens)—perhaps because the user pasted a massive file and the background workers couldn't keep up—the system hits a **Synchronous Barrier**.

At this barrier, the `ContextManager` checks the user's configured `ContextPressureStrategy` to decide how to unblock the request:

*   **Strategy A: `truncate` (The Baseline)**
    *   *Behavior:* Instantly drop the oldest episodes until under `maxTokens`.
    *   *Tradeoff:* Maximum speed, maximum data loss.
*   **Strategy B: `incrementalGc` (Progressive)**
    *   *Behavior:* Look for any pre-computed summaries/masks. If none exist, synchronously block to compute *just enough* summaries to survive the current turn.
    *   *Tradeoff:* Medium speed, medium data retention.
*   **Strategy C: `compress` (State Snapshot)**
    *   *Behavior:* Identify the oldest N episodes causing the overflow. If their N-to-1 World State Snapshot isn't ready yet, **block the user's request** and force the `StateSnapshotProcessor` to generate it synchronously. Once generated, replace the N episodes with the 1 snapshot and proceed.
    *   *Tradeoff:* Maximum latency, maximum data retention/fidelity.

## Architectural Changes Required
1.  **Episode Variants:** Update the `Episode` IR type to support a `variants` dictionary.
2.  **Event Bus:** Create an internal `EventEmitter` in `ContextManager` to dispatch granular `IR_CHUNK_RECEIVED` events (tied to the `PUSH` events of `AgentChatHistory`).
3.  **Processor Interface:** Change `ContextProcessor` from a synchronous `process(episodes[])` function to an asynchronous worker that listens to the event bus, updates the `variants` dictionary, and emits `VARIANT_READY` events.
4.  **Projection Logic:** Update `projectCompressedHistory()` to act as the Pressure Barrier, reading the user's strategy and either applying ready variants, waiting for variants, or truncating.
