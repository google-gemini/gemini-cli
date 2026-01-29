/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';

export function isFunctionResponse(content: Content): boolean {
  if (content.role !== 'user' || !content.parts || content.parts.length === 0) {
    return false;
  }
  const nonThoughtParts = content.parts.filter((p) => !p.thought);
  return (
    nonThoughtParts.length > 0 &&
    nonThoughtParts.every((part) => !!part.functionResponse)
  );
}

export function isFunctionCall(content: Content): boolean {
  return (
    content.role === 'model' &&
    !!content.parts &&
    content.parts.every((part) => !!part.functionCall)
  );
}
