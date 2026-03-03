/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import type {
  GenerateContentResponse,
  PartListUnion,
  Part,
  PartUnion,
  Content,
  FunctionCall,
  FunctionResponse,
  Blob as InlineData,
  FileData,
} from '@google/genai';

/**
 * Type guard to check if a value is a Gemini Part object.
 */
export function isPart(value: unknown): value is Part {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !('parts' in value)
  );
}

/**
 * Type guard to check if a value is a text-based Part object.
 */
export function isTextPart(value: unknown): value is { text: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'text' in value &&
    typeof (value as Record<string, unknown>)['text'] === 'string'
  );
}

/**
 * Type guard to check if a value is a Gemini Content object.
 */
export function isContent(value: unknown): value is Content {
  return typeof value === 'object' && value !== null && 'parts' in value;
}

/**
 * Normalizes a PartListUnion or Content parts into a standard Part array.
 * Filters out null or undefined items.
 */
export function toParts(value: PartListUnion | undefined | null): Part[] {
  if (value == null) {
    return [];
  }
  const array = Array.isArray(value) ? value : [value];
  return array
    .filter((p): p is PartUnion => p != null)
    .map((p) => (typeof p === 'string' ? { text: p } : p));
}

/**
 * Handles thought parts for API compatibility (e.g. CountToken API).
 * The CountToken API expects parts to have certain required "oneof" fields initialized,
 * but thought parts don't always conform to this schema and can cause API failures.
 * This function merges thoughts into text parts.
 */
export function toPartWithThoughtAsText(part: PartUnion): Part {
  if (typeof part === 'string') {
    return { text: part };
  }

  const maybeThoughtPart: unknown = part;
  if (isThoughtPart(maybeThoughtPart)) {
    const thoughtText = `[Thought: ${maybeThoughtPart.thought}]`;
    const newPart: Record<string, unknown> = { ...part };
    delete newPart['thought'];

    const hasApiContent =
      'functionCall' in newPart ||
      'functionResponse' in newPart ||
      'inlineData' in newPart ||
      'fileData' in newPart;

    if (hasApiContent) {
      // It's a functionCall or other non-text part. Just strip the thought.
      return newPart as Part;
    }

    // If no other valid API content, this must be a text part.
    // Combine existing text (if any) with the thought, preserving other properties.
    const text = newPart['text'] ?? '';
    const existingText = typeof text === 'string' ? text : String(text);
    const combinedText = existingText
      ? `${existingText}\n${thoughtText}`
      : thoughtText;

    return {
      ...newPart,
      text: combinedText,
    } as Part;
  }

  return part;
}

/**
 * Type guard to check if a value is a function call Part object.
 */
export function isFunctionCallPart(
  value: unknown,
): value is { functionCall: FunctionCall } {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('functionCall' in value)
  ) {
    return false;
  }
  const functionCall = (value as Record<string, unknown>)['functionCall'];
  return (
    typeof functionCall === 'object' &&
    functionCall !== null &&
    'name' in functionCall &&
    typeof (functionCall as Record<string, unknown>)['name'] === 'string'
  );
}

/**
 * Type guard to check if a value is a function response Part object.
 */
export function isFunctionResponsePart(
  value: unknown,
): value is { functionResponse: FunctionResponse } {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('functionResponse' in value)
  ) {
    return false;
  }
  const functionResponse = (value as Record<string, unknown>)[
    'functionResponse'
  ];
  return (
    typeof functionResponse === 'object' &&
    functionResponse !== null &&
    'name' in functionResponse &&
    typeof (functionResponse as Record<string, unknown>)['name'] === 'string'
  );
}

/**
 * Type guard to check if a value is an inline data Part object.
 */
export function isInlineDataPart(
  value: unknown,
): value is { inlineData: InlineData } {
  if (typeof value !== 'object' || value === null || !('inlineData' in value)) {
    return false;
  }
  const inlineData = (value as Record<string, unknown>)['inlineData'];
  return (
    typeof inlineData === 'object' &&
    inlineData !== null &&
    'mimeType' in inlineData &&
    typeof (inlineData as Record<string, unknown>)['mimeType'] === 'string'
  );
}

/**
 * Type guard to check if a value is a file data Part object.
 */
export function isFileDataPart(
  value: unknown,
): value is { fileData: FileData } {
  if (typeof value !== 'object' || value === null || !('fileData' in value)) {
    return false;
  }
  const fileData = (value as Record<string, unknown>)['fileData'];
  return (
    typeof fileData === 'object' &&
    fileData !== null &&
    'mimeType' in fileData &&
    typeof (fileData as Record<string, unknown>)['mimeType'] === 'string'
  );
}

/**
 * A Gemini Part object that contains a 'thought' string.
 * This extends the base Part interface but overrides the 'thought' property type
 * from boolean to string to support thinking models.
 */
export type ThoughtPart = Omit<Part, 'thought'> & { thought: string };

/**
 * Type guard to check if a value is a thought Part object.
 */
export function isThoughtPart(value: unknown): value is ThoughtPart {
  return (
    typeof value === 'object' &&
    value !== null &&
    'thought' in value &&
    typeof (value as Record<string, unknown>)['thought'] === 'string'
  );
}

/**
 * Converts a PartListUnion into a string.
 * If verbose is true, includes summary representations of non-text parts.
 */
export function partToString(
  value: PartListUnion,
  options?: { verbose?: boolean },
): string {
  if (!value) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((part) => partToString(part, options)).join('');
  }

  if (options?.verbose) {
    if ('videoMetadata' in value && value.videoMetadata !== undefined) {
      return `[Video Metadata]`;
    }

    const maybeThoughtPart: unknown = value;
    if (isThoughtPart(maybeThoughtPart)) {
      return `[Thought: ${maybeThoughtPart.thought}]`;
    }

    if (
      'codeExecutionResult' in value &&
      value.codeExecutionResult !== undefined
    ) {
      return `[Code Execution Result]`;
    }
    if ('executableCode' in value && value.executableCode !== undefined) {
      return `[Executable Code]`;
    }

    // Standard Part fields
    if (isFileDataPart(value)) {
      return `[File Data]`;
    }
    if (isFunctionCallPart(value)) {
      return `[Function Call: ${value.functionCall.name}]`;
    }
    if (isFunctionResponsePart(value)) {
      return `[Function Response: ${value.functionResponse.name}]`;
    }
    if (isInlineDataPart(value)) {
      return `<${value.inlineData.mimeType}>`;
    }
  }

  return isTextPart(value) ? value.text : '';
}

export function getResponseText(
  response: GenerateContentResponse,
): string | null {
  const candidate = response.candidates?.[0];

  if (candidate?.content?.parts && candidate.content.parts.length > 0) {
    return candidate.content.parts
      .filter(
        (part): part is { text: string } =>
          isTextPart(part) && !isThoughtPart(part),
      )
      .map((part) => part.text)
      .join('');
  }
  return null;
}

/**
 * Asynchronously maps over a PartListUnion, applying a transformation function
 * to the text content of each text-based part.
 *
 * @param parts The PartListUnion to process.
 * @param transform A function that takes a string of text and returns a Promise
 *   resolving to an array of new PartUnions.
 * @returns A Promise that resolves to a new array of PartUnions with the
 *   transformations applied.
 */
export async function flatMapTextParts(
  parts: PartListUnion,
  transform: (text: string) => Promise<PartUnion[]>,
): Promise<PartUnion[]> {
  const result: PartUnion[] = [];
  const partArray = toParts(parts);

  for (const part of partArray) {
    let textToProcess: string | undefined;
    if (typeof part === 'string') {
      textToProcess = part;
    } else if ('text' in part) {
      textToProcess = part.text;
    }

    if (textToProcess !== undefined) {
      const transformedParts = await transform(textToProcess);
      result.push(...transformedParts);
    } else {
      // Pass through non-text parts unmodified.
      result.push(part);
    }
  }
  return result;
}

/**
 * Appends a string of text to the last text part of a prompt, or adds a new
 * text part if the last part is not a text part.
 *
 * @param prompt The prompt to modify.
 * @param textToAppend The text to append to the prompt.
 * @param separator The separator to add between existing text and the new text.
 * @returns The modified prompt.
 */
export function appendToLastTextPart(
  prompt: PartUnion[],
  textToAppend: string,
  separator = '\n\n',
): PartUnion[] {
  if (!textToAppend) {
    return prompt;
  }

  if (prompt.length === 0) {
    return [{ text: textToAppend }];
  }

  const newPrompt = [...prompt];
  const lastPart = newPrompt.at(-1);

  if (typeof lastPart === 'string') {
    newPrompt[newPrompt.length - 1] = `${lastPart}${separator}${textToAppend}`;
  } else if (lastPart && 'text' in lastPart) {
    newPrompt[newPrompt.length - 1] = {
      ...lastPart,
      text: `${lastPart.text}${separator}${textToAppend}`,
    };
  } else {
    newPrompt.push({ text: `${separator}${textToAppend}` });
  }

  return newPrompt;
}
