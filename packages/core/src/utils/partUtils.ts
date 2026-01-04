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
  FunctionCall,
} from '@google/genai';

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

  // Cast to Part, assuming it might contain project-specific fields
  const part = value as Part & {
    videoMetadata?: unknown;
    thought?: string;
    codeExecutionResult?: unknown;
    executableCode?: unknown;
  };

  if (options?.verbose) {
    if (part.videoMetadata !== undefined) {
      return `[Video Metadata]`;
    }
    if (part.thought !== undefined) {
      return `[Thought: ${part.thought}]`;
    }
    if (part.codeExecutionResult !== undefined) {
      return `[Code Execution Result]`;
    }
    if (part.executableCode !== undefined) {
      return `[Executable Code]`;
    }

    // Standard Part fields
    if (part.fileData !== undefined) {
      return `[File Data]`;
    }
    if (part.functionCall !== undefined) {
      return `[Function Call: ${part.functionCall.name}]`;
    }
    if (part.functionResponse !== undefined) {
      return `[Function Response: ${part.functionResponse.name}]`;
    }
    if (part.inlineData !== undefined) {
      return `<${part.inlineData.mimeType}>`;
    }
  }

  return part.text ?? '';
}

/**
 * Determines if the current set of parts is cumulative relative to the previous set.
 * In a cumulative stream, the new set of parts includes all parts from the previous
 * chunk, with the first part potentially being a grown version of the previous first part.
 */
export function isCumulative(prev: Part[], curr: Part[]): boolean {
  if (prev.length === 0 || curr.length === 0) return false;
  if (curr.length < prev.length) return false;

  const p0 = prev[0];
  const c0 = curr[0];

  // If the first part is text, check if it's growing
  if (p0.text !== undefined && c0.text !== undefined) {
    // Only return true if strictly growing. If lengths are equal, fall through to deep equality check.
    if (c0.text.length > p0.text.length && c0.text.startsWith(p0.text)) {
      return true;
    }
  }

  // For non-text parts (like functionCall), check if they are identical
  // (SDKs usually return new objects, so we use stringify for comparison)
  try {
    return JSON.stringify(p0) === JSON.stringify(c0);
  } catch {
    return false;
  }
}

/**
 * Determines if the current set of function calls is cumulative relative to the previous set.
 */
export function isCumulativeFunctionCalls(
  prev: FunctionCall[],
  curr: FunctionCall[],
): boolean {
  if (prev.length === 0 || curr.length === 0) return false;
  if (curr.length < prev.length) return false;

  try {
    // To be truly cumulative, the current array of function calls must start with the previous one.
    const prevStr = JSON.stringify(prev);
    const currPrefixStr = JSON.stringify(curr.slice(0, prev.length));
    return prevStr === currPrefixStr;
  } catch {
    return false;
  }
}

export function getResponseText(
  response: GenerateContentResponse,
): string | null {
  if (response.candidates && response.candidates.length > 0) {
    const candidate = response.candidates[0];

    if (
      candidate.content &&
      candidate.content.parts &&
      candidate.content.parts.length > 0
    ) {
      return candidate.content.parts
        .filter((part) => part.text)
        .map((part) => part.text)
        .join('');
    }
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
  const partArray = Array.isArray(parts)
    ? parts
    : typeof parts === 'string'
      ? [{ text: parts }]
      : [parts];

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
