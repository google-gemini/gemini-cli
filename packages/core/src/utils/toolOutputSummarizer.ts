/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Content,
  GenerateContentConfig,
  SchemaUnion,
  Type,
} from '@google/genai';
import { GeminiClient } from '../core/client.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';

const toolOutputSummarizerModel = DEFAULT_GEMINI_FLASH_MODEL;
const toolOutputSummarizerConfig: GenerateContentConfig = {
  thinkingConfig: {
    thinkingBudget: 0,
  },
};

const SUMMARIZE_TOOL_OUTPUT_TEMPLATE = `Summarize the following tool output to be a maximum of {maxLength} characters. The summary should be concise and capture the main points of the tool output.

The summarization should be done based on the content that is provided. Here are the basic rules to follow:
1. If the text is a directory listing or any output that is structural, use the history of the conversation to understand the context. Using this context try to understand what information we need from the tool output and return that as a response.
2. If the text is text content and there is nothing structural that we need, summarize the text.
3. If the text is the output of a shell command, use the history of the conversation to understand the context. Using this context try to understand what information we need from the tool output and return a summarization along with the stack trace of any error within the <error></error> tags. The stack trace should be complete and not truncated. If there are warnings, you should include them in the summary within <warning></warning> tags.

Here is the history of the conversation:
{history}

Text to summarize:
"{textToSummarize}"

The summary string should first contain an overall summarization of text followed by the full stack trace of errors and warnings in the tool output.

Respond *only* in JSON format according to the following schema. Do not include any text outside the JSON structure.
\`\`\`json
{
  "type": "object",
  "properties": {
    "summary": {
        "type": "string",
        "description": "The concise summary of the text, not exceeding the specified character limit."
    }
  },
  "required": ["summary"]
}
\`\`\`
`;

const RESPONSE_SCHEMA: SchemaUnion = {
  type: Type.OBJECT,
  properties: {
    summary: {
      type: Type.STRING,
      description: 'The concise summary of the text.',
    },
  },
  required: ['summary'],
};

export async function summarizeToolOutput(
  textToSummarize: string,
  geminiClient: GeminiClient,
  abortSignal: AbortSignal,
  maxLength: number = 2000,
): Promise<string> {
  if (!textToSummarize || textToSummarize.length < maxLength) {
    return textToSummarize;
  }
  const history = geminiClient.getChat().getHistory(true);
  const historyJsonString = JSON.stringify(history, null, 2);
  const prompt = SUMMARIZE_TOOL_OUTPUT_TEMPLATE.replace(
    '{maxLength}',
    String(maxLength),
  )
    .replace('{textToSummarize}', textToSummarize)
    .replace('{history}', historyJsonString);

  const contents: Content[] = [{ role: 'user', parts: [{ text: prompt }] }];

  try {
    const parsedResponse = (await geminiClient.generateJson(
      contents,
      RESPONSE_SCHEMA,
      abortSignal,
      toolOutputSummarizerModel,
      toolOutputSummarizerConfig,
    )) as unknown as { summary: string };
    if (parsedResponse && parsedResponse.summary) {
      return parsedResponse.summary;
    }
    return textToSummarize;
  } catch (error) {
    console.error('Failed to summarize tool output.', error);
    return textToSummarize;
  }
}
