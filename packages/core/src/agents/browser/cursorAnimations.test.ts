/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  generateClickAnimationScript,
  generateScrollAnimationScript,
} from './cursorAnimations.js';

describe('cursorAnimations', () => {
  describe('generateClickAnimationScript', () => {
    it('should generate valid JavaScript with correct coordinates', () => {
      const script = generateClickAnimationScript(100, 200);
      expect(script).toContain('100');
      expect(script).toContain('200');
      expect(script).toContain('__gemini_click');
    });

    it('should include aria-hidden for accessibility', () => {
      const script = generateClickAnimationScript(50, 50);
      expect(script).toContain('aria-hidden');
    });

    it('should use a get-or-create pattern for keyframes', () => {
      const script = generateClickAnimationScript(10, 20);
      expect(script).toContain(
        "const keyframesId = '__gemini_click_keyframes'",
      );
      expect(script).toContain('document.getElementById(keyframesId)');
      expect(script).toContain('style.textContent = `');
    });
  });

  describe('generateScrollAnimationScript', () => {
    it('should generate scroll down animation', () => {
      const script = generateScrollAnimationScript('down');
      expect(script).toContain('__gemini_scroll_down');
    });

    it('should generate scroll up animation', () => {
      const script = generateScrollAnimationScript('up');
      expect(script).toContain('__gemini_scroll_up');
    });

    it('should use a static ID for scroll keyframes', () => {
      const script = generateScrollAnimationScript('down');
      expect(script).toContain("const styleId = '__gemini_scroll_keyframes'");
      expect(script).toContain('__gemini_scroll_up');
      expect(script).toContain('__gemini_scroll_down');
    });
  });
});
