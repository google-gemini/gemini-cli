/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type * as GenerativeAI from '@google/genai';

/**
 * Returns the request size of the content.
 *
 * @param content The content to get the request size of.
 * @returns The request size of the content.
 */
export function getRequestSize(
  content:
    | string
    | GenerativeAI.Content
    | GenerativeAI.Part
    | (GenerativeAI.Content | GenerativeAI.Part)[],
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

    if ('inlineData' in content && content.inlineData) {
      return content.inlineData.data.length;
    }

    if ('fileData' in content && content.fileData) {
      return content.fileData.fileUri.length;
    }

    if ('parts' in content && Array.isArray(content.parts)) {
      return getRequestSize(content.parts);
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
