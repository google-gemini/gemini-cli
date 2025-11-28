import {
  RoutingStrategy,
  RoutingContext,
  RoutingDecision,
} from '../routingStrategy';
import { Config } from '../../config/config';
import { BaseLlmClient } from '../../core/baseLlmClient';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../../config/models';
import { debugLogger } from '../../utils/debugLogger';
import { ToolErrorType } from '../../tools/tool-error';

const SHORT_OUTPUT_THRESHOLD = 500; // Define what "short" means

export class ScriptOutputSummarizationStrategy implements RoutingStrategy {
  readonly name = 'scriptOutputSummarization';

  async route(
    context: RoutingContext,
    config: Config,
    baseLlmClient: BaseLlmClient,
  ): Promise<RoutingDecision | null> {
    // Check if the request part contains the shell output prefix
    // We expect shell output to be tagged with [SHELL_OUTPUT]\n
    const shellOutputPart = context.request.parts?.find(
      (part) =>
        'text' in part && part.text?.startsWith('[SHELL_OUTPUT]\n'),
    );

    if (!shellOutputPart || typeof shellOutputPart.text !== 'string') {
      return null; // Not a shell command output, pass to next strategy
    }

    const actualOutput = shellOutputPart.text.substring('[SHELL_OUTPUT]\n'.length);

    // TODO: Implement logic for explicit "no summarization" request. 
    // This is difficult without a clear signal in RoutingContext. 
    // For now, we only check for short output.

    if (actualOutput.length < SHORT_OUTPUT_THRESHOLD) {
      debugLogger.debug(
        `Script output is short (${actualOutput.length} chars), skipping summarization.`, 
      );
      // If output is short, pass it directly to the next stage.
      // We return null, allowing other strategies to decide.
      return null;
    }

    debugLogger.debug(
      `Script output is long (${actualOutput.length} chars), summarizing with flash-lite.`, 
    );

    // Summarize the output using flash-lite model
    try {
      // The prompt instructs the LLM to preserve key excerpts verbatim.
      const summaryPrompt = `Summarize the following script output concisely. Preserve key phrases and sentences that are critical to understanding the output verbatim. Present these excerpts clearly, perhaps by quoting them or using a specific marker like [EXCERPT]...[/EXCERPT]. Avoid paraphrasing or distorting the meaning of these excerpts.

Text to summarize:
\n\n${actualOutput}\n\n\n\
```\n`;

      const summaryResult = await baseLlmClient.generateContent({
        modelConfigKey: { model: 'flash-lite' }, // Using flash-lite for summarization
        contents: [summaryPrompt],
        abortSignal: context.signal,
      });

      const summarizedOutput = summaryResult.text;

      // Return a decision to use the flash-lite model for the summarized output.
      // This implies the next stage of routing or processing will use this summarized output.
      return {
        model: DEFAULT_GEMINI_FLASH_MODEL, // Using the default flash-lite alias
        metadata: {
          source: this.name,
          latencyMs: 0, // Placeholder, actual measurement needed
          reasoning: `Summarized script output using ${DEFAULT_GEMINI_FLASH_MODEL}.`, 
        },
      };
    } catch (error) {
      debugLogger.warn(
        `[Routing] ${this.name} failed to summarize script output:`, error,
      );
      // If summarization fails, return null to pass to the next strategy.
      return null; 
    }
  }
}