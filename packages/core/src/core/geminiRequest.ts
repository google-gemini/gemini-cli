/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { type PartListUnion, type Part } from '@google/genai';

/**
 * Represents a request to be sent to the Gemini API.
 * For now, it's an alias to PartListUnion as the primary content.
 * This can be expanded later to include other request parameters.
 */
export type GeminiCodeRequest = PartListUnion;

export function partListUnionToString(value: PartListUnion): string {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(partListUnionToString).join('');
  }

  // Cast to Part, assuming it might contain project-specific fields
  const part = value as Part & {
    videoMetadata?: unknown;
    thought?: string;
    codeExecutionResult?: unknown;
    executableCode?: unknown;
  };

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

  if (part.text !== undefined) {
    return part.text;
  }

  return '';
}
