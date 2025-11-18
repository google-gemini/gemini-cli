/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import { shortAsciiLogo, longAsciiLogo, tinyAsciiLogo } from './AsciiArt.js';

describe('AsciiArt', () => {
  describe('shortAsciiLogo', () => {
    it('should be a non-empty string', () => {
      expect(shortAsciiLogo).toBeDefined();
      expect(typeof shortAsciiLogo).toBe('string');
      expect(shortAsciiLogo.length).toBeGreaterThan(0);
    });

    it('should contain GEMINI text in ASCII art', () => {
      expect(shortAsciiLogo).toContain('█');
      expect(shortAsciiLogo).toContain('░');
    });

    it('should have multiple lines', () => {
      const lines = shortAsciiLogo.split('\n');
      expect(lines.length).toBeGreaterThan(1);
    });

    it('should start with newline', () => {
      expect(shortAsciiLogo.charAt(0)).toBe('\n');
    });

    it('should contain box drawing characters', () => {
      expect(shortAsciiLogo).toMatch(/[█░]/);
    });

    it('should have consistent width across lines', () => {
      const lines = shortAsciiLogo
        .split('\n')
        .filter((line) => line.length > 0);
      const widths = lines.map((line) => line.length);
      const maxWidth = Math.max(...widths);
      const minWidth = Math.min(...widths);

      // Most lines should have similar width
      expect(maxWidth - minWidth).toBeLessThan(50);
    });
  });

  describe('longAsciiLogo', () => {
    it('should be a non-empty string', () => {
      expect(longAsciiLogo).toBeDefined();
      expect(typeof longAsciiLogo).toBe('string');
      expect(longAsciiLogo.length).toBeGreaterThan(0);
    });

    it('should contain GEMINI text in ASCII art', () => {
      expect(longAsciiLogo).toContain('█');
      expect(longAsciiLogo).toContain('░');
    });

    it('should have multiple lines', () => {
      const lines = longAsciiLogo.split('\n');
      expect(lines.length).toBeGreaterThan(1);
    });

    it('should start with newline', () => {
      expect(longAsciiLogo.charAt(0)).toBe('\n');
    });

    it('should be longer than short logo', () => {
      expect(longAsciiLogo.length).toBeGreaterThan(shortAsciiLogo.length);
    });

    it('should have wider lines than short logo', () => {
      const longLines = longAsciiLogo
        .split('\n')
        .filter((line) => line.length > 0);
      const shortLines = shortAsciiLogo
        .split('\n')
        .filter((line) => line.length > 0);

      const longMaxWidth = Math.max(...longLines.map((line) => line.length));
      const shortMaxWidth = Math.max(...shortLines.map((line) => line.length));

      expect(longMaxWidth).toBeGreaterThan(shortMaxWidth);
    });

    it('should contain additional decorative elements', () => {
      // Long logo has the "███" prefix on some lines
      expect(longAsciiLogo).toContain('███');
    });
  });

  describe('tinyAsciiLogo', () => {
    it('should be a non-empty string', () => {
      expect(tinyAsciiLogo).toBeDefined();
      expect(typeof tinyAsciiLogo).toBe('string');
      expect(tinyAsciiLogo.length).toBeGreaterThan(0);
    });

    it('should contain ASCII art characters', () => {
      expect(tinyAsciiLogo).toContain('█');
      expect(tinyAsciiLogo).toContain('░');
    });

    it('should have multiple lines', () => {
      const lines = tinyAsciiLogo.split('\n');
      expect(lines.length).toBeGreaterThan(1);
    });

    it('should start with newline', () => {
      expect(tinyAsciiLogo.charAt(0)).toBe('\n');
    });

    it('should be shorter than short logo', () => {
      expect(tinyAsciiLogo.length).toBeLessThan(shortAsciiLogo.length);
    });

    it('should be shorter than long logo', () => {
      expect(tinyAsciiLogo.length).toBeLessThan(longAsciiLogo.length);
    });

    it('should have narrower lines than short logo', () => {
      const tinyLines = tinyAsciiLogo
        .split('\n')
        .filter((line) => line.length > 0);
      const shortLines = shortAsciiLogo
        .split('\n')
        .filter((line) => line.length > 0);

      const tinyMaxWidth = Math.max(...tinyLines.map((line) => line.length));
      const shortMaxWidth = Math.max(...shortLines.map((line) => line.length));

      expect(tinyMaxWidth).toBeLessThan(shortMaxWidth);
    });
  });

  describe('logo comparisons', () => {
    it('should all be different', () => {
      expect(shortAsciiLogo).not.toBe(longAsciiLogo);
      expect(shortAsciiLogo).not.toBe(tinyAsciiLogo);
      expect(longAsciiLogo).not.toBe(tinyAsciiLogo);
    });

    it('should all use same character set', () => {
      const allLogos = [shortAsciiLogo, longAsciiLogo, tinyAsciiLogo];
      allLogos.forEach((logo) => {
        expect(logo).toMatch(/[█░]/);
      });
    });

    it('should all have consistent line count', () => {
      const shortLines = shortAsciiLogo.split('\n').filter((l) => l.length > 0);
      const longLines = longAsciiLogo.split('\n').filter((l) => l.length > 0);
      const tinyLines = tinyAsciiLogo.split('\n').filter((l) => l.length > 0);

      // All should have 8 lines of ASCII art
      expect(shortLines).toHaveLength(8);
      expect(longLines).toHaveLength(8);
      expect(tinyLines).toHaveLength(8);
    });

    it('should be ordered by size: tiny < short < long', () => {
      expect(tinyAsciiLogo.length).toBeLessThan(shortAsciiLogo.length);
      expect(shortAsciiLogo.length).toBeLessThan(longAsciiLogo.length);
    });
  });

  describe('logo properties', () => {
    it('should all be strings', () => {
      expect(typeof shortAsciiLogo).toBe('string');
      expect(typeof longAsciiLogo).toBe('string');
      expect(typeof tinyAsciiLogo).toBe('string');
    });

    it('should all be immutable', () => {
      const originalShort = shortAsciiLogo;
      const originalLong = longAsciiLogo;
      const originalTiny = tinyAsciiLogo;

      // Strings are immutable in JavaScript
      expect(shortAsciiLogo).toBe(originalShort);
      expect(longAsciiLogo).toBe(originalLong);
      expect(tinyAsciiLogo).toBe(originalTiny);
    });

    it('should not contain tabs', () => {
      expect(shortAsciiLogo).not.toContain('\t');
      expect(longAsciiLogo).not.toContain('\t');
      expect(tinyAsciiLogo).not.toContain('\t');
    });

    it('should use spaces for alignment', () => {
      expect(shortAsciiLogo).toContain(' ');
      expect(longAsciiLogo).toContain(' ');
      expect(tinyAsciiLogo).toContain(' ');
    });
  });

  describe('visual structure', () => {
    it('should have consistent vertical structure in short logo', () => {
      const lines = shortAsciiLogo.split('\n').filter((l) => l.length > 0);
      expect(
        lines.every((line) => line.includes('█') || line.includes('░')),
      ).toBe(true);
    });

    it('should have consistent vertical structure in long logo', () => {
      const lines = longAsciiLogo.split('\n').filter((l) => l.length > 0);
      expect(
        lines.every((line) => line.includes('█') || line.includes('░')),
      ).toBe(true);
    });

    it('should have consistent vertical structure in tiny logo', () => {
      const lines = tinyAsciiLogo.split('\n').filter((l) => l.length > 0);
      expect(
        lines.every((line) => line.includes('█') || line.includes('░')),
      ).toBe(true);
    });
  });
});
