/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ToolResult } from '../tools/tools.js';
import type { Content, GenerateContentResponse } from '@google/genai';
import type { GeminiClient } from '../core/client.js';
import { getResponseText, partToString } from './partUtils.js';
import { debugLogger } from './debugLogger.js';
import type { ResolvedModelConfig } from '../services/modelGenerationConfigService.js';

/**
 * A function that summarizes the result of a tool execution.
 *
 * @param result The result of the tool execution.
 * @returns The summary of the result.
 */
export type Summarizer = (
  result: ToolResult,
  geminiClient: GeminiClient,
  abortSignal: AbortSignal,
) => Promise<string>;

/**
 * The default summarizer for tool results.
 *
 * @param result The result of the tool execution.
 * @param geminiClient The Gemini client to use for summarization.
 * @param abortSignal The abort signal to use for summarization.
 * @returns The summary of the result.
 */
export const defaultSummarizer: Summarizer = (
  result: ToolResult,
  _geminiClient: GeminiClient,
  _abortSignal: AbortSignal,
) => Promise.resolve(JSON.stringify(result.llmContent));

const SUMMARIZE_TOOL_OUTPUT_PROMPT = `Summarize the following tool output to be a maximum of {maxOutputTokens} tokens. The summary should be concise and capture the main points of the tool output.

The summarization should be done based on the content that is provided. Here are the basic rules to follow:
1. If the text is a directory listing or any output that is structural, use the history of the conversation to understand the context. Using this context try to understand what information we need from the tool output and return that as a response.
2. If the text is text content and there is nothing structural that we need, summarize the text.
3. If the text is the output of a shell command, use the history of the conversation to understand the context. Using this context try to understand what information we need from the tool output and return a summarization along with the stack trace of any error within the <error></error> tags. The stack trace should be complete and not truncated. If there are warnings, you should include them in the summary within <warning></warning> tags.


Text to summarize:
"{textToSummarize}"

Return the summary string which should first contain an overall summarization of text followed by the full stack trace of errors and warnings in the tool output.
`;

export const llmSummarizer: Summarizer = async (
  result,
  geminiClient,
  abortSignal,
) => {
  const resolvedConfig =
    geminiClient.config.generationConfigService.getResolvedConfig({
      model: 'summarizer-default',
    });
  return summarizeToolOutput(
    partToString(result.llmContent),
    geminiClient,
    abortSignal,
    resolvedConfig,
  );
};

export async function summarizeToolOutput(
  textToSummarize: string,
  geminiClient: GeminiClient,
  abortSignal: AbortSignal,
  resolvedConfig: ResolvedModelConfig,
): Promise<string> {
  const maxOutputTokens = resolvedConfig.sdkConfig.maxOutputTokens ?? 2000;
  // There is going to be a slight difference here since we are comparing length of string with maxOutputTokens.
  // This is meant to be a ballpark estimation of if we need to summarize the tool output.
  if (!textToSummarize || textToSummarize.length < maxOutputTokens) {
    return textToSummarize;
  }
  const prompt = SUMMARIZE_TOOL_OUTPUT_PROMPT.replace(
    '{maxOutputTokens}',
    String(maxOutputTokens),
  ).replace('{textToSummarize}', textToSummarize);

  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];
  try {
    const parsedResponse = (await geminiClient.generateContent(
      contents,
      abortSignal,
      resolvedConfig,
    )) as unknown as GenerateContentResponse;
    return getResponseText(parsedResponse) || textToSummarize;
  } catch (error) {
    debugLogger.warn('Failed to summarize tool output.', error);
    return textToSummarize;
  }
}
