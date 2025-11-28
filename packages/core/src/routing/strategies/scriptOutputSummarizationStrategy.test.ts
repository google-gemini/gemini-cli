import { describe, it, expect, vi } from 'vitest';
import { ScriptOutputSummarizationStrategy } from './scriptOutputSummarizationStrategy';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../../config/models';
import type { RoutingContext } from '../routingStrategy';
import type { Config } from '../../config/config';
import type { BaseLlmClient } from '../../core/baseLlmClient';
import type { ToolResult } from '../../tools/tools';

describe('ScriptOutputSummarizationStrategy', () => {
  const mockConfig = {} as Config;
  const mockBaseLlmClient = {
    generateContent: vi.fn(),
  } as unknown as BaseLlmClient;

  it('should return null if the request is not from a shell command', async () => {
    const strategy = new ScriptOutputSummarizationStrategy();
    const context = {
      request: { parts: [{ text: 'A regular user prompt' }] },
    } as RoutingContext;

    const decision = await strategy.route(context, mockConfig, mockBaseLlmClient);
    expect(decision).toBeNull();
  });

  it('should return null if the script output is short', async () => {
    const strategy = new ScriptOutputSummarizationStrategy();
    // Create a short output string
    const shortOutput = 'This is a short output\n'.repeat(10); // approx 200 chars
    const context = {
      request: {
        parts: [{ text: `[SHELL_OUTPUT]\n${shortOutput}` }],
      },
    } as RoutingContext;

    // Mock baseLlmClient.generateContent to ensure it's not called
    const generateContentSpy = vi.spyOn(mockBaseLlmClient, 'generateContent');

    const decision = await strategy.route(context, mockConfig, mockBaseLlmClient);

    expect(decision).toBeNull(); // Should not summarize short output
    expect(generateContentSpy).not.toHaveBeenCalled();
  });

  it('should summarize long script output using flash-lite model and include excerpts', async () => {
    const strategy = new ScriptOutputSummarizationStrategy();
    // Create a long output string with potential excerpts
    const longOutput = 'This is a long output with a critical phrase: \'Important detail 1\'.\nThis is another line.\nAnd a second critical phrase: \'Crucial data point 2\'.\n'.repeat(100); // approx 2000 chars
    const context = {
      request: {
        parts: [{ text: `[SHELL_OUTPUT]\n${longOutput}` }],
      },
    } as RoutingContext;

    const mockSummaryResult = { text: 'Summary: This is a long output with a critical phrase: \'Important detail 1\'. And a second critical phrase: \'Crucial data point 2\'.' };
    const generateContentSpy = vi.spyOn(mockBaseLlmClient, 'generateContent').mockResolvedValue(mockSummaryResult);

    const decision = await strategy.route(context, mockConfig, mockBaseLlmClient);

    expect(decision).toEqual({
      model: DEFAULT_GEMINI_FLASH_MODEL,
      metadata: {
        source: 'scriptOutputSummarization',
        latencyMs: expect.any(Number), // Expect latency to be measured
        reasoning: `Summarized script output using ${DEFAULT_GEMINI_FLASH_MODEL}.`,
      },
    });
    expect(generateContentSpy).toHaveBeenCalledTimes(1);
    expect(generateContentSpy).toHaveBeenCalledWith({
      modelConfigKey: { model: 'flash-lite' }, // Using flash-lite for summarization
      contents: expect.any(Array), // Check prompt content format
      abortSignal: undefined, // For now, no abort signal passed
    });
    // Check the prompt content is correctly formatted, including excerpt instructions
    const promptContent = generateContentSpy.mock.calls[0][0].contents[0].text;
    expect(promptContent).toContain('Summarize the following script output concisely:');
    expect(promptContent).toContain('Preserve key phrases and sentences that are critical to understanding the output verbatim.');
    expect(promptContent).toContain('Present these excerpts clearly, perhaps by quoting them or using a specific marker like [EXCERPT]...[/EXCERPT].');
    expect(promptContent).toContain(longOutput);
  });

  it('should handle empty script output gracefully', async () => {
    const strategy = new ScriptOutputSummarizationStrategy();
    const context = {
      request: {
        parts: [{ text: '[SHELL_OUTPUT]\n' }],
      },
    } as RoutingContext;

    const decision = await strategy.route(context, mockConfig, mockBaseLlmClient);
    expect(decision).toBeNull(); // Empty output is short, so no summarization
  });
});