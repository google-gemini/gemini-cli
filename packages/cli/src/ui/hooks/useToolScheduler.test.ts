/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { formatLlmContentForFunctionResponse } from './useToolScheduler.js';
import { Part, PartListUnion } from '@google/genai';

describe('formatLlmContentForFunctionResponse', () => {
  it('should handle simple string llmContent', () => {
    const llmContent = 'Simple text output';
    const { functionResponseJson, additionalParts } =
      formatLlmContentForFunctionResponse(llmContent);
    expect(functionResponseJson).toEqual({ output: 'Simple text output' });
    expect(additionalParts).toEqual([]);
  });

  it('should handle llmContent as a single Part with text', () => {
    const llmContent: Part = { text: 'Text from Part object' };
    const { functionResponseJson, additionalParts } =
      formatLlmContentForFunctionResponse(llmContent);
    expect(functionResponseJson).toEqual({ output: 'Text from Part object' });
    expect(additionalParts).toEqual([]);
  });

  it('should handle llmContent as a PartListUnion array with a single text Part', () => {
    const llmContent: PartListUnion = [{ text: 'Text from array' }];
    const { functionResponseJson, additionalParts } =
      formatLlmContentForFunctionResponse(llmContent);
    expect(functionResponseJson).toEqual({ output: 'Text from array' });
    expect(additionalParts).toEqual([]);
  });

  it('should handle llmContent with inlineData', () => {
    const llmContent: Part = {
      inlineData: { mimeType: 'image/png', data: 'base64...' },
    };
    const { functionResponseJson, additionalParts } =
      formatLlmContentForFunctionResponse(llmContent);
    expect(functionResponseJson).toEqual({
      status: 'Binary content of type image/png was processed.',
    });
    expect(additionalParts).toEqual([llmContent]);
  });

  it('should handle llmContent with fileData', () => {
    const llmContent: Part = {
      fileData: { mimeType: 'application/pdf', fileUri: 'gs://...' },
    };
    const { functionResponseJson, additionalParts } =
      formatLlmContentForFunctionResponse(llmContent);
    expect(functionResponseJson).toEqual({
      status: 'Binary content of type application/pdf was processed.',
    });
    expect(additionalParts).toEqual([llmContent]);
  });

  it('should handle llmContent as an array of multiple Parts (text and inlineData)', () => {
    const llmContent: PartListUnion = [
      { text: 'Some textual description' },
      { inlineData: { mimeType: 'image/jpeg', data: 'base64data...' } },
      { text: 'Another text part' },
    ];
    const { functionResponseJson, additionalParts } =
      formatLlmContentForFunctionResponse(llmContent);
    expect(functionResponseJson).toEqual({
      status: 'Tool execution succeeded.',
    });
    expect(additionalParts).toEqual(llmContent);
  });

  it('should handle llmContent as an array with a single inlineData Part', () => {
    const llmContent: PartListUnion = [
      { inlineData: { mimeType: 'image/gif', data: 'gifdata...' } },
    ];
    const { functionResponseJson, additionalParts } =
      formatLlmContentForFunctionResponse(llmContent);
    // When the array is a single Part and that part is inlineData
    expect(functionResponseJson).toEqual({
      status: 'Binary content of type image/gif was processed.',
    });
    expect(additionalParts).toEqual(llmContent);
  });

  it('should handle llmContent as a generic Part (not text, inlineData, or fileData)', () => {
    // This case might represent a malformed or unexpected Part type.
    // For example, a Part that is just an empty object or has other properties.
    const llmContent: Part = { functionCall: { name: 'test', args: {} } }; // Example of a non-standard part for this context
    const { functionResponseJson, additionalParts } =
      formatLlmContentForFunctionResponse(llmContent);
    expect(functionResponseJson).toEqual({
      status: 'Tool execution succeeded.',
    });
    expect(additionalParts).toEqual([llmContent]);
  });

  it('should handle empty string llmContent', () => {
    const llmContent = '';
    const { functionResponseJson, additionalParts } =
      formatLlmContentForFunctionResponse(llmContent);
    expect(functionResponseJson).toEqual({ output: '' });
    expect(additionalParts).toEqual([]);
  });

  it('should handle llmContent as an empty array', () => {
    const llmContent: PartListUnion = [];
    const { functionResponseJson, additionalParts } =
      formatLlmContentForFunctionResponse(llmContent);
    expect(functionResponseJson).toEqual({
      status: 'Tool execution succeeded.',
    });
    expect(additionalParts).toEqual([]);
  });

  it('should handle llmContent as a Part with undefined inlineData/fileData/text', () => {
    const llmContent: Part = {}; // An empty part object
    const { functionResponseJson, additionalParts } =
      formatLlmContentForFunctionResponse(llmContent);
    expect(functionResponseJson).toEqual({
      status: 'Tool execution succeeded.',
    });
    expect(additionalParts).toEqual([llmContent]);
  });
});
