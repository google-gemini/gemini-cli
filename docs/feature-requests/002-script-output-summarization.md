# Feature: Implement script output summarization with excerpt preservation

## Summary

This feature introduces a mechanism to summarize lengthy script outputs before they are processed by the main thinking model. Summarization will primarily use the 'flash-lite' model for efficiency, with options to skip summarization for short outputs or when explicitly disallowed.

## Motivation

- **Efficiency:** Long script outputs can overwhelm the context window of the main thinking model and increase processing time and cost. Summarizing them first with a faster, cheaper model like 'flash-lite' can improve overall performance and cost-effectiveness.
- **Clarity:** Summaries can distill key information from complex script outputs, making them easier for the main LLM to process and act upon.
- **Preservation:** The summarization process should preserve critical excerpts from the original output to avoid loss of crucial information.

## Proposed Changes

1.  **Shell Tool Output Tagging:**
    *   Modify `ShellToolInvocation.execute` to prepend a distinctive prefix (e.g., `[SHELL_OUTPUT]
`) to the `llmContent` of shell command results. This will help identify shell outputs for the routing strategy.
    *   Add a `toolSpecificInfo: { isShellOutput: true }` flag to the `ToolResult` to explicitly mark shell command outputs.
2.  **Summarization Routing Strategy:**
    *   Create a new `ScriptOutputSummarizationStrategy` in `routing/strategies/scriptOutputSummarizationStrategy.ts`.
    *   This strategy will inspect the `RoutingContext` for shell output indicators (`toolSpecificInfo.isShellOutput`).
    *   **Summarization Conditions:**
        *   Summarize if the script output is longer than a defined threshold (e.g., 500 characters).
        *   Skip summarization if the output is shorter than the threshold.
        *   **(Optional/Future):** Implement a mechanism to respect explicit "no summarization" requests from the model or user (this might require further discussion on how such a signal would be passed).
    *   Use the 'flash-lite' model (via `DEFAULT_GEMINI_FLASH_MODEL` alias) for summarization.
3.  **Model Router Integration:**
    *   Add `ScriptOutputSummarizationStrategy` to the `CompositeStrategy` in `ModelRouterService.ts`, ensuring it is evaluated before other strategies that might process general text. 
4.  **Testing:**
    *   Add unit tests for `ScriptOutputSummarizationStrategy` to cover:
        *   Correct identification of shell output.
        *   Correct skipping of summarization for short outputs.
        *   Correct summarization of long outputs using 'flash-lite'.
        *   Proper handling of empty script outputs.
    *   Ensure the summarization prompt includes instructions to preserve key excerpts.

## Acceptance Criteria

- Long script outputs are summarized using the 'flash-lite' model.
- Short script outputs are passed through without summarization.
- Summaries of script outputs retain critical information and key phrases from the original output.
- The system correctly identifies shell command outputs to apply this logic.
