/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentResponse,
  Part,
  FunctionCall,
  PartListUnion,
  Content,
} from '@google/genai';
import { getResponseText } from './partUtils.js';
import { supportsMultimodalFunctionResponse } from '../config/models.js';
import { debugLogger } from './debugLogger.js';
import { createHash } from 'node:crypto';
import { stableStringify } from '../policy/stable-stringify.js';

export const SYNTHETIC_THOUGHT_SIGNATURE = 'skip_thought_signature_validator';

/**
 * Ensures all function calls in a response candidate have stable IDs.
 * If a call lacks an ID, one is generated deterministically based on its name and args.
 */
export function ensureStableFunctionCallIds(
  response: GenerateContentResponse,
): void {
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) return;

  for (const part of parts) {
    if (part.functionCall && !part.functionCall.id) {
      const hash = createHash('md5')
        .update(part.functionCall.name + stableStringify(part.functionCall.args))
        .digest('hex')
        .slice(0, 10);
      part.functionCall.id = `call_${part.functionCall.name}_${hash}`;
    }
  }
}

/**
 * To ensure our requests validate, the first function call in every model
 * turn within the active loop must have a `thoughtSignature` property.
 * If we do not do this, we will get back 400 errors from the API.
 */
export function ensureActiveLoopHasThoughtSignatures(
  requestContents: Content[],
): Content[] {
  // First, find the start of the active loop by finding the last user turn
  // with a text message, i.e. that is not a function response.
  let activeLoopStartIndex = -1;
  for (let i = requestContents.length - 1; i >= 0; i--) {
    const content = requestContents[i];
    if (content.role === 'user' && content.parts?.some((part) => part.text)) {
      activeLoopStartIndex = i;
      break;
    }
  }

  if (activeLoopStartIndex === -1) {
    return requestContents;
  }

  // Iterate through every message in the active loop, ensuring that the first
  // function call in each message's list of parts has a valid
  // thoughtSignature property. If it does not we replace the function call
  // with a copy that uses the synthetic thought signature.
  const newContents = requestContents.slice(); // Shallow copy the array
  for (let i = activeLoopStartIndex; i < newContents.length; i++) {
    const content = newContents[i];
    if (content.role === 'model' && content.parts) {
      const newParts = content.parts.slice();
      for (let j = 0; j < newParts.length; j++) {
        const part = newParts[j];
        if (part.functionCall) {
          if (!part.thoughtSignature) {
            newParts[j] = {
              ...part,
              thoughtSignature: SYNTHETIC_THOUGHT_SIGNATURE,
            };
            newContents[i] = {
              ...content,
              parts: newParts,
            };
          }
          break; // Only consider the first function call
        }
      }
    }
  }
  return newContents;
}

/**
 * Formats tool output for a Gemini FunctionResponse.
 */
function createFunctionResponsePart(
  callId: string,
  toolName: string,
  output: string,
): Part {
  return {
    functionResponse: {
      id: callId,
      name: toolName,
      response: { output },
    },
  };
}

function toParts(input: PartListUnion): Part[] {
  const parts: Part[] = [];
  for (const part of Array.isArray(input) ? input : [input]) {
    if (typeof part === 'string') {
      parts.push({ text: part });
    } else if (part) {
      parts.push(part);
    }
  }
  return parts;
}

export function convertToFunctionResponse(
  toolName: string,
  callId: string,
  llmContent: PartListUnion,
  model: string,
): Part[] {
  if (typeof llmContent === 'string') {
    return [createFunctionResponsePart(callId, toolName, llmContent)];
  }

  const parts = toParts(llmContent);

  // Separate text from binary types
  const textParts: string[] = [];
  const inlineDataParts: Part[] = [];
  const fileDataParts: Part[] = [];

  for (const part of parts) {
    if (part.text !== undefined) {
      textParts.push(part.text);
    } else if (part.inlineData) {
      inlineDataParts.push(part);
    } else if (part.fileData) {
      fileDataParts.push(part);
    } else if (part.functionResponse) {
      if (parts.length > 1) {
        debugLogger.warn(
          'convertToFunctionResponse received multiple parts with a functionResponse. Only the functionResponse will be used, other parts will be ignored',
        );
      }
      // Handle passthrough case
      return [
        {
          functionResponse: {
            id: callId,
            name: toolName,
            response: part.functionResponse.response,
          },
        },
      ];
    }
    // Ignore other part types
  }

  // Build the primary response part
  const part: Part = {
    functionResponse: {
      id: callId,
      name: toolName,
      response: textParts.length > 0 ? { output: textParts.join('\n') } : {},
    },
  };

  const isMultimodalFRSupported = supportsMultimodalFunctionResponse(model);
  const siblingParts: Part[] = [...fileDataParts];

  if (inlineDataParts.length > 0) {
    if (isMultimodalFRSupported) {
      // Nest inlineData if supported by the model
      (part.functionResponse as unknown as { parts: Part[] }).parts =
        inlineDataParts;
    } else {
      // Otherwise treat as siblings
      siblingParts.push(...inlineDataParts);
    }
  }

  // Add descriptive text if the response object is empty but we have binary content
  if (
    textParts.length === 0 &&
    (inlineDataParts.length > 0 || fileDataParts.length > 0)
  ) {
    const totalBinaryItems = inlineDataParts.length + fileDataParts.length;
    part.functionResponse!.response = {
      output: `Binary content provided (${totalBinaryItems} item(s)).`,
    };
  }

  if (siblingParts.length > 0) {
    return [part, ...siblingParts];
  }

  return [part];
}

export function getResponseTextFromParts(parts: Part[]): string | undefined {
  if (!parts) {
    return undefined;
  }
  const textSegments = parts
    .map((part) => part.text)
    .filter((text): text is string => typeof text === 'string');

  if (textSegments.length === 0) {
    return undefined;
  }
  return textSegments.join('');
}

export function getFunctionCalls(
  response: GenerateContentResponse,
): FunctionCall[] | undefined {
  const parts = response.candidates?.[0]?.content?.parts;
  if (!parts) {
    return undefined;
  }
  const functionCallParts = parts
    .filter((part) => !!part.functionCall)
    .map((part) => part.functionCall as FunctionCall);
  return functionCallParts.length > 0 ? functionCallParts : undefined;
}

export function getFunctionCallsFromParts(
  parts: Part[],
): FunctionCall[] | undefined {
  if (!parts) {
    return undefined;
  }
  const functionCallParts = parts
    .filter((part) => !!part.functionCall)
    .map((part) => part.functionCall as FunctionCall);
  return functionCallParts.length > 0 ? functionCallParts : undefined;
}

export function getFunctionCallsAsJson(
  response: GenerateContentResponse,
): string | undefined {
  const functionCalls = getFunctionCalls(response);
  if (!functionCalls) {
    return undefined;
  }
  return JSON.stringify(functionCalls, null, 2);
}

export function getFunctionCallsFromPartsAsJson(
  parts: Part[],
): string | undefined {
  const functionCalls = getFunctionCallsFromParts(parts);
  if (!functionCalls) {
    return undefined;
  }
  return JSON.stringify(functionCalls, null, 2);
}

export function getStructuredResponse(
  response: GenerateContentResponse,
): string | undefined {
  const textContent = getResponseText(response);
  const functionCallsJson = getFunctionCallsAsJson(response);

  if (textContent && functionCallsJson) {
    return `${textContent}\n${functionCallsJson}`;
  }
  if (textContent) {
    return textContent;
  }
  if (functionCallsJson) {
    return functionCallsJson;
  }
  return undefined;
}

export function getStructuredResponseFromParts(
  parts: Part[],
): string | undefined {
  const textContent = getResponseTextFromParts(parts);
  const functionCallsJson = getFunctionCallsFromPartsAsJson(parts);

  if (textContent && functionCallsJson) {
    return `${textContent}\n${functionCallsJson}`;
  }
  if (textContent) {
    return textContent;
  }
  if (functionCallsJson) {
    return functionCallsJson;
  }
  return undefined;
}

export function getCitations(resp: GenerateContentResponse): string[] {
  return (resp.candidates?.[0]?.citationMetadata?.citations ?? [])
    .filter((citation) => citation.uri !== undefined)
    .map((citation) => {
      if (citation.title) {
        return `(${citation.title}) ${citation.uri}`;
      }
      return citation.uri!;
    });
}
