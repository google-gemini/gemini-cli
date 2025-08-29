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
