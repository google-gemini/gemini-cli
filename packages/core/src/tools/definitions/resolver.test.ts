/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { Type } from '@google/genai';
import { resolveToolDeclaration } from './resolver.js';
import type { ToolDefinition } from './types.js';

describe('resolveToolDeclaration', () => {
  const mockDefinition: ToolDefinition = {
    base: {
      name: 'test_tool',
      description: 'A test tool description',
      parameters: {
        type: Type.OBJECT,
        properties: {
          param1: { type: Type.STRING },
        },
      },
    },
  };

  it('should return the base definition when no modelId is provided', () => {
    const result = resolveToolDeclaration(mockDefinition);
    expect(result).toEqual(mockDefinition.base);
  });

  it('should return the base definition when a modelId is provided (current implementation)', () => {
    const result = resolveToolDeclaration(mockDefinition, 'gemini-1.5-pro');
    expect(result).toEqual(mockDefinition.base);
  });

  it('should return the same object reference as base (current implementation)', () => {
    const result = resolveToolDeclaration(mockDefinition);
    expect(result).toBe(mockDefinition.base);
  });
});
