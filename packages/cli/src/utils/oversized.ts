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
export function getRequestSize(content: GenerativeAI.ModelContent): number {
  if (Array.isArray(content)) {
    return content.reduce((acc, part) => acc + getRequestSize(part), 0);
  }

  if (typeof content === 'string') {
    return content.length;
  }

  if ('parts' in content) {
    return getRequestSize(content.parts);
  }

  if ('text' in content) {
    return (content['text'] as string).length;
  }

  if ('functionCall' in content) {
    return getRequestSizeOfFunctionCall(content.functionCall);
  }

  if ('functionResponse' in content) {
    return getRequestSizeOfFunctionResponse(content.functionResponse);
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
