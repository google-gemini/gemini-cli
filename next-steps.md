# Next Steps: Resolving Context Graph Inconsistencies

## Summary of Changes

We have successfully implemented a "Pristine Ledger" approach in
`geminiChat.ts`. Instead of pushing every partial stream chunk into the
`AgentChatHistory`, we now:

1. Accumulate stream chunks in memory.
2. Deduplicate tool call placeholders based on tool name sequences.
3. Backfill the placeholders with fully assembled `FunctionCall` objects from
   the SDK (`finalFunctionCalls`).
4. Push only the final, consolidated `Content` object to `AgentChatHistory`.

This has improved SWEE-bench-verified performance from ~50% back to ~73%.

## Remaining Issues

Despite the fix, some instances still show `matchingCallId='undefined'` in the
graph mapping phase (though `args` are now mostly populated). This indicates
that:

1. The model may sometimes emit tool calls without IDs in the stream, even if
   they are later resolved.
2. The SDK's `finalFunctionCalls` might occasionally contain multiple entries
   for what should be a single call if the model's output is fragmented in a
   specific way.
3. `toGraph.ts` still relies on positional matching
   (`pendingCallPartsWithoutId.shift()`) when IDs are missing, which is fragile.

## Proposed Future Work

1. **Move to Event-Sourced Semantic History:** Instead of reverse-engineering
   `Content[]` arrays, we should have the LLM client emit strongly typed
   semantic events (`ToolCallStarted`, `ToolCallCompleted`, etc.) that the
   `ContextManager` can use to build the graph directly.
2. **Make the Graph the Source of Truth:** Deeply integrate the `ContextManager`
   into the agent loop so that it is the primary store of conversational state,
   eliminating the need to sync with a secondary `AgentChatHistory` array.
3. **Robust ID Generation:** If the model doesn't provide an ID, we should
   generate a stable synthetic ID at the moment of discovery in `geminiChat.ts`
   and ensure it persists through the history and into the tool response, so the
   graph never has to guess based on position.
4. **SDK Deep Dive:** Investigate the exact behavior of `chunk.functionCalls` in
   the Google GenAI SDK for multi-turn, multi-tool scenarios to ensure we aren't
   misinterpreting its "finality" guarantee.
