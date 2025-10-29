/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  toGraphemes,
  toCodePoints,
  cpLen,
  cpSlice,
  clearGraphemeCache,
} from './textUtils.js';

describe('toGraphemes', () => {
  beforeEach(() => {
    clearGraphemeCache();
  });

  afterEach(() => {
    clearGraphemeCache();
  });

  describe('Basic ASCII', () => {
    it('should handle ASCII strings', () => {
      expect(toGraphemes('hello')).toEqual(['h', 'e', 'l', 'l', 'o']);
      expect(toGraphemes('ABC123')).toEqual(['A', 'B', 'C', '1', '2', '3']);
    });

    it('should handle empty strings', () => {
      expect(toGraphemes('')).toEqual([]);
    });

    it('should handle single characters', () => {
      expect(toGraphemes('a')).toEqual(['a']);
    });
  });

  describe('Precomposed Characters (Issue #12212, #12183)', () => {
    it('should handle Portuguese ç', () => {
      expect(toGraphemes('ç')).toEqual(['ç']);
      expect(toGraphemes('café')).toEqual(['c', 'a', 'f', 'é']);
    });

    it('should handle Swedish å', () => {
      expect(toGraphemes('å')).toEqual(['å']);
      expect(toGraphemes('Malmö')).toEqual(['M', 'a', 'l', 'm', 'ö']);
    });

    it('should handle German umlauts', () => {
      expect(toGraphemes('ü')).toEqual(['ü']);
      expect(toGraphemes('München')).toEqual([
        'M',
        'ü',
        'n',
        'c',
        'h',
        'e',
        'n',
      ]);
    });

    it('should handle French accents', () => {
      expect(toGraphemes('é')).toEqual(['é']);
      expect(toGraphemes('à')).toEqual(['à']);
      expect(toGraphemes('è')).toEqual(['è']);
      expect(toGraphemes('ê')).toEqual(['ê']);
    });

    it('should handle Spanish tildes', () => {
      expect(toGraphemes('ñ')).toEqual(['ñ']);
      expect(toGraphemes('España')).toEqual(['E', 's', 'p', 'a', 'ñ', 'a']);
    });
  });

  describe('Combining Marks', () => {
    it('should handle combining acute accent', () => {
      // e + combining acute accent (U+0301)
      const eWithAcute = 'e\u0301';
      const result = toGraphemes(eWithAcute);
      // Should be treated as a single grapheme cluster
      expect(result.length).toBe(1);
      // The visual representation should look like é
      expect(result[0]).toBe(eWithAcute);
    });

    it('should handle combining diacriticals', () => {
      // a + combining tilde (U+0303)
      const aWithTilde = 'a\u0303';
      const result = toGraphemes(aWithTilde);
      // Should be treated as a single grapheme cluster
      expect(result.length).toBe(1);
      expect(result[0]).toBe(aWithTilde);
    });

    it('should handle multiple combining marks', () => {
      // a + combining tilde + combining grave
      const complex = 'a\u0303\u0300';
      const result = toGraphemes(complex);
      // Should be treated as a single grapheme cluster
      expect(result.length).toBe(1);
    });
  });

  describe('Emoji', () => {
    it('should handle basic emoji', () => {
      expect(toGraphemes('😀')).toEqual(['😀']);
      expect(toGraphemes('🎉')).toEqual(['🎉']);
    });

    it('should handle family emoji with ZWJ', () => {
      const family = '👨‍👩‍👧‍👦';
      expect(toGraphemes(family)).toEqual([family]);
    });

    it('should handle profession emoji', () => {
      const doctor = '👨‍⚕️';
      expect(toGraphemes(doctor)).toEqual([doctor]);
    });

    it('should handle emoji with skin tone modifiers', () => {
      const waving = '👋🏽';
      expect(toGraphemes(waving)).toEqual([waving]);
    });

    it('should handle flag sequences', () => {
      const usFlag = '🇺🇸';
      const brFlag = '🇧🇷';
      expect(toGraphemes(usFlag)).toEqual([usFlag]);
      expect(toGraphemes(brFlag)).toEqual([brFlag]);
      expect(toGraphemes(usFlag + brFlag)).toEqual([usFlag, brFlag]);
    });
  });

  describe('Mixed Content', () => {
    it('should handle mixed ASCII and Unicode', () => {
      expect(toGraphemes('Hello café')).toEqual([
        'H',
        'e',
        'l',
        'l',
        'o',
        ' ',
        'c',
        'a',
        'f',
        'é',
      ]);
    });

    it('should handle mixed emoji and text', () => {
      const input = 'Hi 👋 there';
      expect(toGraphemes(input)).toEqual([
        'H',
        'i',
        ' ',
        '👋',
        ' ',
        't',
        'h',
        'e',
        'r',
        'e',
      ]);
    });

    it('should handle real-world example from Issue #12212', () => {
      // User trying to type "São Paulo"
      const input = 'São Paulo';
      expect(toGraphemes(input)).toEqual([
        'S',
        'ã',
        'o',
        ' ',
        'P',
        'a',
        'u',
        'l',
        'o',
      ]);
    });
  });

  describe('Cache Behavior', () => {
    it('should cache results', () => {
      const input = 'café';
      const result1 = toGraphemes(input);
      const result2 = toGraphemes(input);
      // Should return the same cached result
      expect(result1).toBe(result2);
    });

    it('should not cache very long strings', () => {
      const longString = 'a'.repeat(2000);
      const result1 = toGraphemes(longString);
      const result2 = toGraphemes(longString);
      // Results should be equal but not the same object
      expect(result1).toEqual(result2);
      expect(result1).not.toBe(result2);
    });

    it('should clear cache when requested', () => {
      const input = 'test';
      const result1 = toGraphemes(input);
      clearGraphemeCache();
      const result2 = toGraphemes(input);
      expect(result1).toEqual(result2);
      expect(result1).not.toBe(result2);
    });
  });
});

describe('cpLen', () => {
  it('should return correct length for ASCII', () => {
    expect(cpLen('hello')).toBe(5);
  });

  it('should return correct length for Unicode', () => {
    expect(cpLen('café')).toBe(4);
    expect(cpLen('ç')).toBe(1);
  });

  it('should return correct length for emoji', () => {
    expect(cpLen('👋')).toBe(1);
    expect(cpLen('👨‍👩‍👧‍👦')).toBe(1);
  });

  it('should return correct length for flags', () => {
    expect(cpLen('🇺🇸')).toBe(1);
  });

  it('should handle empty strings', () => {
    expect(cpLen('')).toBe(0);
  });
});

describe('cpSlice', () => {
  it('should slice ASCII strings correctly', () => {
    expect(cpSlice('hello', 0, 2)).toBe('he');
    expect(cpSlice('hello', 2)).toBe('llo');
  });

  it('should slice Unicode strings correctly', () => {
    expect(cpSlice('café', 0, 2)).toBe('ca');
    expect(cpSlice('café', 2)).toBe('fé');
  });

  it('should slice emoji correctly', () => {
    expect(cpSlice('Hi 👋 there', 0, 4)).toBe('Hi 👋');
    expect(cpSlice('Hi 👋 there', 3, 4)).toBe('👋');
  });

  it('should slice mixed content correctly', () => {
    const input = 'Hello café';
    expect(cpSlice(input, 0, 5)).toBe('Hello');
    expect(cpSlice(input, 6)).toBe('café');
  });

  it('should handle negative indices', () => {
    expect(cpSlice('hello', -2)).toBe('lo');
  });

  it('should handle out of bounds', () => {
    expect(cpSlice('test', 10)).toBe('');
    expect(cpSlice('test', 0, 10)).toBe('test');
  });
});

describe('Regression Tests for Issues', () => {
  it('Issue #12212: Should handle ç character in WSL', () => {
    // User reported that 'ç' character doesn't appear in WSL
    const input = 'ç';
    expect(cpLen(input)).toBe(1);
    expect(toGraphemes(input)).toEqual(['ç']);
    expect(cpSlice(input, 0, 1)).toBe('ç');
  });

  it('Issue #12183: Should handle Swedish å character', () => {
    // User reported that Swedish 'å' character cannot be input
    const input = 'å';
    expect(cpLen(input)).toBe(1);
    expect(toGraphemes(input)).toEqual(['å']);
    expect(cpSlice(input, 0, 1)).toBe('å');
  });

  it('Should handle cursor movement with multi-byte characters', () => {
    // Simulating cursor moving through "café"
    const text = 'café';
    const graphemes = toGraphemes(text);

    expect(graphemes[0]).toBe('c');
    expect(graphemes[1]).toBe('a');
    expect(graphemes[2]).toBe('f');
    expect(graphemes[3]).toBe('é');
    expect(graphemes.length).toBe(4);
  });

  it('Should handle word boundaries correctly', () => {
    // Test that word navigation works with Unicode
    const text = 'hello café world';
    const graphemes = toGraphemes(text);

    // Find space after "café"
    const firstSpaceIndex = graphemes.indexOf(' ', 0);
    const secondSpaceIndex = graphemes.indexOf(' ', firstSpaceIndex + 1);

    const word2 = cpSlice(text, firstSpaceIndex + 1, secondSpaceIndex);
    expect(word2).toBe('café');
  });
});

describe('toCodePoints (deprecated but still used internally)', () => {
  it('should split by code points, not graphemes', () => {
    // toCodePoints should return individual code points for stripUnsafeCharacters
    const simple = 'abc';
    expect(toCodePoints(simple)).toEqual(['a', 'b', 'c']);
  });

  it('should handle surrogate pairs correctly', () => {
    // Emoji are surrogate pairs and should be single code points
    const emoji = '😀';
    expect(toCodePoints(emoji)).toEqual(['😀']);
  });

  it('should NOT merge combining marks (different from toGraphemes)', () => {
    // This is critical: toCodePoints must return individual code points
    // so stripUnsafeCharacters can inspect each one
    const combining = 'e\u0301'; // e + combining acute
    const codePoints = toCodePoints(combining);

    // Should be 2 code points, not 1 grapheme cluster
    expect(codePoints.length).toBe(2);
    expect(codePoints[0]).toBe('e');
    expect(codePoints[1]).toBe('\u0301');
  });

  it('difference between toCodePoints and toGraphemes', () => {
    const text = 'e\u0301'; // e + combining acute

    // toCodePoints: splits by code points (2 elements)
    expect(toCodePoints(text).length).toBe(2);

    // toGraphemes: splits by grapheme clusters (1 element)
    expect(toGraphemes(text).length).toBe(1);
  });
});
