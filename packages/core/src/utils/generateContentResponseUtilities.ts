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

export const BINARY_INJECTION_KEY = '__binary_injection__';

/**
 * Anti-hallucination directive appended to every model-facing message that
 * announces binary content. The binary payload itself may or may not actually
 * reach the model (model selection, multimodal support, request-size limits,
 * silent provider stripping). Without this directive, models read the
 * announcement as confirmation they have the data and fabricate plausible
 * contents to fill the gap. See issue #27408.
 */
export const BINARY_NO_FABRICATION_DIRECTIVE =
  'If you cannot directly observe the attached content in your next response, you MUST state that explicitly — do not infer, guess, or fabricate details from the filename, path, or surrounding context.';

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
  const filteredInlineDataParts: Part[] = [];
  const unsupportedInlineDataParts: Part[] = [];

  for (const part of inlineDataParts) {
    const mimeType = part.inlineData?.mimeType;
    if (
      mimeType &&
      (mimeType.startsWith('audio/') || mimeType.startsWith('video/'))
    ) {
      unsupportedInlineDataParts.push(part);
    } else {
      filteredInlineDataParts.push(part);
    }
  }

  if (unsupportedInlineDataParts.length > 0) {
    const uniqueMimes = Array.from(
      new Set(
        unsupportedInlineDataParts.map((p) => p.inlineData?.mimeType ?? ''),
      ),
    ).join(', ');

    const isReadFileTool =
      toolName === 'read_file' || toolName === 'read_many_files';

    if (isReadFileTool) {
      textParts.unshift(
        `Binary content (${uniqueMimes}) read successfully. Content will be injected for analysis in the next sequence. ${BINARY_NO_FABRICATION_DIRECTIVE}`,
      );
    } else {
      textParts.unshift(
        `[SYSTEM: Binary content (${uniqueMimes}) stripped from response due to protocol limitations. ${BINARY_NO_FABRICATION_DIRECTIVE}]`,
      );
    }
  }

  // Whenever binary content is attached or referenced as a sibling, the
  // anti-fabrication directive must reach the model alongside any companion
  // text — the binary payload can be silently dropped by the model/transport
  // (see #27408), and unguarded companion text was the exact gap flagged in
  // the PR review of the original fix.
  const totalAttachedBinaryItems =
    filteredInlineDataParts.length + fileDataParts.length;
  if (
    totalAttachedBinaryItems > 0 &&
    !textParts.some((t) => t.includes(BINARY_NO_FABRICATION_DIRECTIVE))
  ) {
    textParts.push(
      `Binary content provided (${totalAttachedBinaryItems} item(s)). ${BINARY_NO_FABRICATION_DIRECTIVE}`,
    );
  }

  // Build the primary response part
  const part: Part = {
    functionResponse: {
      id: callId,
      name: toolName,
      response: textParts.length > 0 ? { output: textParts.join('\n') } : {},
    },
  };

  const isReadFileTool =
    toolName === 'read_file' || toolName === 'read_many_files';

  if (unsupportedInlineDataParts.length > 0 && isReadFileTool) {
    if (part.functionResponse) {
      Object.assign(part.functionResponse.response!, {
        [BINARY_INJECTION_KEY]: unsupportedInlineDataParts,
      });
    }
  }

  const isMultimodalFRSupported = supportsMultimodalFunctionResponse(
    model,
    config,
  );
  const siblingParts: Part[] = [...fileDataParts];

  if (filteredInlineDataParts.length > 0) {
    if (isMultimodalFRSupported) {
      // Nest inlineData if supported by the model
      Object.assign(part.functionResponse!, { parts: filteredInlineDataParts });
    } else {
      // Otherwise treat as siblings
      siblingParts.push(...filteredInlineDataParts);
    }
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
