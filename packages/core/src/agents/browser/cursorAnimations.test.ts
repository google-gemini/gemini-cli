/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  generateClickAnimationScript,
  generateClickAnimationByUidScript,
  generateScrollAnimationScript,
} from './cursorAnimations.js';

describe('cursorAnimations', () => {
  describe('generateClickAnimationScript', () => {
    it('should return an arrow function with correct coordinates', () => {
      const script = generateClickAnimationScript(100, 200);
      expect(script).toMatch(/^\s*\(\)\s*=>/);
      expect(script).toContain('cx = 100');
      expect(script).toContain('cy = 200');
      expect(script).toContain('__gemini_click');
    });

    it('should include aria-hidden for accessibility', () => {
      const script = generateClickAnimationScript(50, 50);
      expect(script).toContain('aria-hidden');
    });

    it('should use a shared style injection pattern', () => {
      const script = generateClickAnimationScript(10, 20);
      expect(script).toContain("'__gemini_animations'");
    });
  });

  describe('generateClickAnimationByUidScript', () => {
    it('should return an arrow function that looks up data-uid', () => {
      const script = generateClickAnimationByUidScript('12_34');
      expect(script).toMatch(/^\s*\(\)\s*=>/);
      expect(script).toContain('[data-uid="12_34"]');
    });

    it('should properly escape string quotes in uid', () => {
      const script = generateClickAnimationByUidScript("12_3'4");
      expect(script).toContain('[data-uid="12_3\\\'4"]');
    });

    it('should include activeElement fallback', () => {
      const script = generateClickAnimationByUidScript('123');
      expect(script).toContain('|| document.activeElement');
    });

    it('should skip body and document element', () => {
      const script = generateClickAnimationByUidScript('123');
      expect(script).toContain('document.body');
      expect(script).toContain('document.documentElement');
    });

    it('should calculate center coordinates', () => {
      const script = generateClickAnimationByUidScript('123');
      expect(script).toContain('rect.left + rect.width / 2');
      expect(script).toContain('rect.top + rect.height / 2');
    });
  });

  describe('generateScrollAnimationScript', () => {
    it('should return an arrow function for scroll down with chevron', () => {
      const script = generateScrollAnimationScript('down');
      expect(script).toMatch(/^\s*\(\)\s*=>/);
      expect(script).toContain('__gemini_scroll_down');
      expect(script).toContain('▼');
    });

    it('should return an arrow function for scroll up with chevron', () => {
      const script = generateScrollAnimationScript('up');
      expect(script).toContain('__gemini_scroll_up');
      expect(script).toContain('▲');
    });

    it('should include a directional bar and chevron arrow', () => {
      const script = generateScrollAnimationScript('down');
      expect(script).toContain('width:6px');
      expect(script).toContain('height:60px');
      expect(script).toContain('border-radius:3px');
    });

    it('should use aria-hidden for accessibility', () => {
      const script = generateScrollAnimationScript('down');
      expect(script).toContain('aria-hidden');
    });

    it('should use the same shared style ID', () => {
      const script = generateScrollAnimationScript('down');
      expect(script).toContain("'__gemini_animations'");
    });
  });
});
