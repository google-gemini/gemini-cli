/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as GenerativeAI from '@google/genai';

import type { Config } from '@google/gemini-cli-core';

// This is a rough estimate of the token size.
// A better approach would be to use a tokenizer.
const AVG_CHARS_PER_TOKEN = 4;

export function getMimeType(file: GenerativeAI.FileData | GenerativeAI.Part) {
  if ('fileData' in file) {
    return file.fileData?.mimeType;
  }
  if ('inlineData' in file) {
    return file.inlineData?.mimeType;
  }
  return '';
}

/**
 * Returns true if the content is oversized.
 *
 * @param content The content to check.
 * @param config The Config object.
 * @returns True if the content is oversized.
 */
export function isOversized(
  content: GenerativeAI.Part[],
  config: Config,
): boolean {
  if (config.getTruncateToolOutputThreshold() === 0) {
    return false;
  }

  const requestSize = getRequestSize(content);

  if (requestSize > config.getTruncateToolOutputThreshold()) {
    console.warn(
      `Warning: Request size of ${requestSize} is larger than the limit of ${config.getTruncateToolOutputThreshold()}. Please consider increasing the limit.`,
    );
    return true;
  }
  return false;
}

/**
 * Returns the request size of the content.
 *
 * @param content The content to get the request size of.
 * @returns The request size of the content.
 */
export function getRequestSize(
  content: string | GenerativeAI.Part | GenerativeAI.Part[],
): number {
  if (Array.isArray(content)) {
    return content.reduce((acc, part) => acc + getRequestSize(part), 0);
  }

  if (typeof content === 'string') {
    return content.length;
  }

  if (typeof content === 'object' && content !== null) {
    if ('text' in content && typeof content.text === 'string') {
      return (content.text as string).length;
    }

    if ('functionCall' in content && content.functionCall) {
      return getRequestSizeOfFunctionCall(content.functionCall);
    }

    if ('functionResponse' in content && content.functionResponse) {
      return getRequestSizeOfFunctionResponse(content.functionResponse);
    }
  }
  return 0;
}

function getRequestSizeOfFunctionCall(functionCall: GenerativeAI.FunctionCall) {
  return JSON.stringify(functionCall.args).length;
}

function getRequestSizeOfFunctionResponse(
  functionResponse: GenerativeAI.FunctionResponse,
) {
  return JSON.stringify(functionResponse.response).length;
}

export function getTokens(content: GenerativeAI.Part[]) {
  return Math.floor(getRequestSize(content) / AVG_CHARS_PER_TOKEN);
}

export function printRequestSize(
  content: GenerativeAI.Part[],
  _config: Config,
) {
  const requestSize = getRequestSize(content);
  const tokens = getTokens(content);

  console.log(`Request size: ${requestSize} characters, ~${tokens} tokens`);
}

/**
 * Truncates the content to fit within the request size limit.
 *
 * This function truncates the content of a `run_shell_command` to fit
 * within the request size limit.
 *
 * It will experimenting with different truncation strategies to find the
 * optimal one.
 *
 * The current strategy is to truncate the stdout and stderr of the
 * `run_shell_command` to fit within the request size limit.
 *
 * @param content The content to truncate.
 * @param config The Config object.
 * @returns The truncated content.
 */
export function truncateOversizedContent(
  content: GenerativeAI.Part[],
  config: Config,
): GenerativeAI.Part[] {
  const parts = content;

  const functionResponse = parts.find(
    (part: GenerativeAI.Part) => 'functionResponse' in part,
  ) as FunctionResponsePart;

  if (!functionResponse) {
    return content;
  }

  const functionResponseSize = getRequestSize(functionResponse);
  const otherPartsSize = getRequestSize(
    parts.filter((part) => !('functionResponse' in part)),
  );

  const availableSize =
    config.getTruncateToolOutputThreshold() - otherPartsSize - 500; // Some buffer

  if (functionResponseSize < availableSize) {
    return content;
  }

  console.warn(
    `Warning: Function response size of ${functionResponseSize} is larger than the available size of ${availableSize}. Truncating...`,
  );

  const response = functionResponse.functionResponse.response;
  if (response === undefined || response === null) {
    return content;
  }
  const typedResponse = response as Record<string, unknown>;
  const stdout = typedResponse['stdout'] as string;
  const stderr = typedResponse['stderr'] as string;

  if (stdout.length + stderr.length > availableSize) {
    const half = Math.floor(availableSize / 2);
    if (stdout.length > half && stderr.length > half) {
      typedResponse['stdout'] = `... (truncated) ${stdout.slice(-half)}`;
      typedResponse['stderr'] = `... (truncated) ${stderr.slice(-half)}`;
    } else if (stdout.length > half) {
      const remaining = availableSize - stderr.length;
      typedResponse['stdout'] = `... (truncated) ${stdout.slice(-remaining)}`;
    } else {
      const remaining = availableSize - stdout.length;
      typedResponse['stderr'] = `... (truncated) ${stderr.slice(-remaining)}`;
    }
  }

  return parts;
}

interface FunctionResponsePart {
  functionResponse: GenerativeAI.FunctionResponse;
}
