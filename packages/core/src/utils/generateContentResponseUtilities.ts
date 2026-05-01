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
} from '@google/genai';
import { getResponseText } from './partUtils.js';
import { supportsMultimodalFunctionResponse } from '../config/models.js';
import { debugLogger } from './debugLogger.js';
import type { Config } from '../config/config.js';

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
  config?: Config,
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

  // build a list of unsupported MIME types for function responses
  const unsupportedMimeTypes: string[] = [];
  const filteredInlineDataParts: Part[] = [];

  for (const part of inlineDataParts) {
    const mimeType = part.inlineData?.mimeType;
    if (
      mimeType &&
      (mimeType.startsWith('audio/') || mimeType.startsWith('video/'))
    ) {
      unsupportedMimeTypes.push(mimeType);
    } else {
      filteredInlineDataParts.push(part);
    }
  }

  if (unsupportedMimeTypes.length > 0) {
    const uniqueMimes = Array.from(new Set(unsupportedMimeTypes)).join(', ');
    const steeringMessage =
      `[SYSTEM ERROR: PROTOCOL_LIMITATION]\n` +
      `The tool returned binary data with MIME types (${uniqueMimes}) that are not supported in tool responses by the Gemini API.\n\n` +
      `ACTION REQUIRED:\n` +
      `To analyze this content, you must immediately send a message to the user including the file reference using the '@' syntax (e.g., "I will now analyze @path/to/file.mp3").\n` +
      `This will trigger the system to attach the file as a standard multimodal part in your next turn, which you can then analyze.`;
    textParts.unshift(steeringMessage);
  }

  // Build the primary response part
  const part: Part = {
    functionResponse: {
      id: callId,
      name: toolName,
      response: textParts.length > 0 ? { output: textParts.join('\n') } : {},
    },
  };

  const isMultimodalFRSupported = supportsMultimodalFunctionResponse(
    model,
    config,
  );
  const siblingParts: Part[] = [...fileDataParts];

  if (filteredInlineDataParts.length > 0) {
    if (isMultimodalFRSupported) {
      // Nest inlineData if supported by the model
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      (part.functionResponse as unknown as { parts: Part[] }).parts =
        filteredInlineDataParts;
    } else {
      // Otherwise treat as siblings
      siblingParts.push(...filteredInlineDataParts);
    }
  }

  // Add descriptive text if the response object is empty but we have binary content
  if (
    textParts.length === 0 &&
    (filteredInlineDataParts.length > 0 || fileDataParts.length > 0)
  ) {
    const totalBinaryItems =
      filteredInlineDataParts.length + fileDataParts.length;
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
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
