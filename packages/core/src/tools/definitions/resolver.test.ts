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
    expect(result.declaration).toEqual(mockDefinition.base);
  });

  it('should return overridden description when modelId matches override criteria', () => {
    const definitionWithOverride: ToolDefinition = {
      ...mockDefinition,
      overrides: (modelId: string) => {
        if (modelId === 'special-model') {
          return { description: 'Overridden description' };
        }
        return undefined;
      },
    };

    const result = resolveToolDeclaration(
      definitionWithOverride,
      'special-model',
    );
    expect(result.declaration.description).toBe('Overridden description');
    expect(result.declaration.name).toBe(mockDefinition.base.name);
  });

  it('should return base definition when modelId does not match override criteria', () => {
    const definitionWithOverride: ToolDefinition = {
      ...mockDefinition,
      overrides: (modelId: string) => {
        if (modelId === 'special-model') {
          return { description: 'Overridden description' };
        }
        return undefined;
      },
    };

    const result = resolveToolDeclaration(
      definitionWithOverride,
      'regular-model',
    );
    expect(result.declaration.description).toBe(
      mockDefinition.base.description,
    );
  });

  it('should return the base definition when a modelId is provided but no overrides exist', () => {
    const result = resolveToolDeclaration(mockDefinition, 'gemini-1.5-pro');
    expect(result.declaration).toEqual(mockDefinition.base);
  });
});
