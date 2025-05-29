/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { mergePartListUnions } from './useGeminiStream.js';
import { Part, PartListUnion } from '@google/genai';

// Mock useToolScheduler
vi.mock('./useToolScheduler', async () => {
  const actual = await vi.importActual('./useToolScheduler');
  return {
    ...actual, // We need mapToDisplay from actual
    useToolScheduler: vi.fn(),
  };
});

describe('mergePartListUnions', () => {
  it('should merge multiple PartListUnion arrays', () => {
    const list1: PartListUnion = [{ text: 'Hello' }];
    const list2: PartListUnion = [
      { inlineData: { mimeType: 'image/png', data: 'abc' } },
    ];
    const list3: PartListUnion = [{ text: 'World' }, { text: '!' }];
    const result = mergePartListUnions([list1, list2, list3]);
    expect(result).toEqual([
      { text: 'Hello' },
      { inlineData: { mimeType: 'image/png', data: 'abc' } },
      { text: 'World' },
      { text: '!' },
    ]);
  });

  it('should handle empty arrays in the input list', () => {
    const list1: PartListUnion = [{ text: 'First' }];
    const list2: PartListUnion = [];
    const list3: PartListUnion = [{ text: 'Last' }];
    const result = mergePartListUnions([list1, list2, list3]);
    expect(result).toEqual([{ text: 'First' }, { text: 'Last' }]);
  });

  it('should handle a single PartListUnion array', () => {
    const list1: PartListUnion = [
      { text: 'One' },
      { inlineData: { mimeType: 'image/jpeg', data: 'xyz' } },
    ];
    const result = mergePartListUnions([list1]);
    expect(result).toEqual(list1);
  });

  it('should return an empty array if all input arrays are empty', () => {
    const list1: PartListUnion = [];
    const list2: PartListUnion = [];
    const result = mergePartListUnions([list1, list2]);
    expect(result).toEqual([]);
  });

  it('should handle input list being empty', () => {
    const result = mergePartListUnions([]);
    expect(result).toEqual([]);
  });

  it('should correctly merge when PartListUnion items are single Parts not in arrays', () => {
    const part1: Part = { text: 'Single part 1' };
    const part2: Part = { inlineData: { mimeType: 'image/gif', data: 'gif' } };
    const listContainingSingleParts: PartListUnion[] = [
      part1,
      [part2],
      { text: 'Another single part' },
    ];
    const result = mergePartListUnions(listContainingSingleParts);
    expect(result).toEqual([
      { text: 'Single part 1' },
      { inlineData: { mimeType: 'image/gif', data: 'gif' } },
      { text: 'Another single part' },
    ]);
  });

  it('should handle a mix of arrays and single parts, including empty arrays and undefined/null parts if they were possible (though PartListUnion typing restricts this)', () => {
    const list1: PartListUnion = [{ text: 'A' }];
    const list2: PartListUnion = [];
    const part3: Part = { text: 'B' };
    const list4: PartListUnion = [
      { text: 'C' },
      { inlineData: { mimeType: 'text/plain', data: 'D' } },
    ];
    const result = mergePartListUnions([list1, list2, part3, list4]);
    expect(result).toEqual([
      { text: 'A' },
      { text: 'B' },
      { text: 'C' },
      { inlineData: { mimeType: 'text/plain', data: 'D' } },
    ]);
  });

  it('should preserve the order of parts from the input arrays', () => {
    const listA: PartListUnion = [{ text: '1' }, { text: '2' }];
    const listB: PartListUnion = [{ text: '3' }];
    const listC: PartListUnion = [{ text: '4' }, { text: '5' }];
    const result = mergePartListUnions([listA, listB, listC]);
    expect(result).toEqual([
      { text: '1' },
      { text: '2' },
      { text: '3' },
      { text: '4' },
      { text: '5' },
    ]);
  });

  it('should handle cases where some PartListUnion items are single Parts and others are arrays of Parts', () => {
    const singlePart1: Part = { text: 'First single' };
    const arrayPart1: Part[] = [
      { text: 'Array item 1' },
      { text: 'Array item 2' },
    ];
    const singlePart2: Part = {
      inlineData: { mimeType: 'application/json', data: 'e30=' },
    }; // {}
    const arrayPart2: Part[] = [{ text: 'Last array item' }];

    const result = mergePartListUnions([
      singlePart1,
      arrayPart1,
      singlePart2,
      arrayPart2,
    ]);
    expect(result).toEqual([
      { text: 'First single' },
      { text: 'Array item 1' },
      { text: 'Array item 2' },
      { inlineData: { mimeType: 'application/json', data: 'e30=' } },
      { text: 'Last array item' },
    ]);
  });
});
