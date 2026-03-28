/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  buildPreClickListenerScript,
  buildClickAnimationScript,
  buildScrollAnimationScript,
  SCROLL_DOWN_KEYS,
  SCROLL_UP_KEYS,
} from './cursorAnimations.js';

describe('cursorAnimations', () => {
  describe('buildPreClickListenerScript', () => {
    it('should return a function string', () => {
      const script = buildPreClickListenerScript();
      expect(script).toContain('() =>');
    });

    it('should register a mousedown event listener (not click)', () => {
      const script = buildPreClickListenerScript();
      expect(script).toContain("addEventListener('mousedown'");
      expect(script).not.toContain("addEventListener('click'");
    });

    it('should guard against double-registration', () => {
      const script = buildPreClickListenerScript();
      expect(script).toContain('__geminiCursorClickListenerActive');
      expect(script).toContain("return 'listener-already-registered'");
    });

    it('should set a safety timeout for cleanup', () => {
      const script = buildPreClickListenerScript();
      expect(script).toContain('setTimeout(cleanup, 3000)');
    });

    it('should create element with aria-hidden for accessibility tree safety', () => {
      const script = buildPreClickListenerScript();
      expect(script).toContain('aria-hidden');
      expect(script).toContain("'true'");
    });

    it('should use Element.animate() for CSP compatibility', () => {
      const script = buildPreClickListenerScript();
      expect(script).toContain('dot.animate(');
    });

    it('should set pointer-events to none', () => {
      const script = buildPreClickListenerScript();
      expect(script).toContain('pointer-events: none');
    });

    it('should auto-remove via onfinish callback', () => {
      const script = buildPreClickListenerScript();
      expect(script).toContain('anim.onfinish');
      expect(script).toContain('dot.remove()');
    });

    it('should clean up listener via removeEventListener on mousedown', () => {
      const script = buildPreClickListenerScript();
      expect(script).toContain("removeEventListener('mousedown'");
    });

    it('should return status string', () => {
      const script = buildPreClickListenerScript();
      expect(script).toContain('click-listener-registered');
    });

    it('should store listener ref on window for cleanup', () => {
      const script = buildPreClickListenerScript();
      expect(script).toContain('__geminiCursorOnMousedown');
    });
  });

  describe('buildClickAnimationScript', () => {
    it('should embed correct x coordinate', () => {
      const script = buildClickAnimationScript(150, 200);
      expect(script).toContain('150');
    });

    it('should embed correct y coordinate', () => {
      const script = buildClickAnimationScript(150, 200);
      expect(script).toContain('200');
    });

    it('should round coordinates', () => {
      const script = buildClickAnimationScript(150.7, 200.3);
      expect(script).toContain('151');
      expect(script).toContain('200');
    });

    it('should use Element.animate() for CSP compatibility', () => {
      const script = buildClickAnimationScript(100, 100);
      expect(script).toContain('dot.animate(');
    });

    it('should set aria-hidden on injected element', () => {
      const script = buildClickAnimationScript(0, 0);
      expect(script).toContain('aria-hidden');
    });

    it('should self-remove after animation', () => {
      const script = buildClickAnimationScript(50, 50);
      expect(script).toContain('anim.onfinish');
      expect(script).toContain('dot.remove()');
    });

    it('should return status string', () => {
      const script = buildClickAnimationScript(0, 0);
      expect(script).toContain('click-animation-injected');
    });
  });

  describe('buildScrollAnimationScript', () => {
    it('should produce a valid function string for down direction', () => {
      const script = buildScrollAnimationScript('down');
      expect(script).toContain('() =>');
    });

    it('should produce a valid function string for up direction', () => {
      const script = buildScrollAnimationScript('up');
      expect(script).toContain('() =>');
    });

    it('should use cascading arrow panel design', () => {
      const script = buildScrollAnimationScript('down');
      expect(script).toContain('__gemini_scroll_panel');
      expect(script).toContain('▼');
    });

    it('should show up arrows for up direction', () => {
      const script = buildScrollAnimationScript('up');
      expect(script).toContain('▲');
    });

    it('should create three cascading arrows', () => {
      const script = buildScrollAnimationScript('down');
      expect(script).toContain('for (var i = 0; i < 3; i++)');
    });

    it('should use staggered animation delay', () => {
      const script = buildScrollAnimationScript('down');
      expect(script).toContain('delay: i * 220');
    });

    it('should replace any existing panel to avoid stacking', () => {
      const script = buildScrollAnimationScript('down');
      expect(script).toContain("getElementById('__gemini_scroll_panel')");
      expect(script).toContain('prev.remove()');
    });

    it('should use Element.animate() for CSP compatibility', () => {
      const script = buildScrollAnimationScript('down');
      expect(script).toContain('arrow.animate(');
      expect(script).toContain('panel.animate(');
    });

    it('should set aria-hidden on the panel', () => {
      const script = buildScrollAnimationScript('down');
      expect(script).toContain('aria-hidden');
    });

    it('should self-remove after panel animation', () => {
      const script = buildScrollAnimationScript('down');
      expect(script).toContain('panelAnim.onfinish');
      expect(script).toContain('panel.remove()');
    });

    it('should return status string', () => {
      const script = buildScrollAnimationScript('down');
      expect(script).toContain('scroll-animation-injected');
    });

    it('should have dark background with blue border styling', () => {
      const script = buildScrollAnimationScript('down');
      expect(script).toContain('rgba(8, 18, 48, 0.82)');
      expect(script).toContain('rgba(66, 133, 244, 0.75)');
    });
  });

  describe('scroll key sets', () => {
    it('should contain expected down-scroll keys', () => {
      expect(SCROLL_DOWN_KEYS.has('ArrowDown')).toBe(true);
      expect(SCROLL_DOWN_KEYS.has('PageDown')).toBe(true);
      expect(SCROLL_DOWN_KEYS.has('Space')).toBe(true);
      expect(SCROLL_DOWN_KEYS.has('End')).toBe(true);
    });

    it('should contain expected up-scroll keys', () => {
      expect(SCROLL_UP_KEYS.has('ArrowUp')).toBe(true);
      expect(SCROLL_UP_KEYS.has('PageUp')).toBe(true);
      expect(SCROLL_UP_KEYS.has('Home')).toBe(true);
    });

    it('should not overlap between up and down sets', () => {
      for (const key of SCROLL_DOWN_KEYS) {
        expect(SCROLL_UP_KEYS.has(key)).toBe(false);
      }
      for (const key of SCROLL_UP_KEYS) {
        expect(SCROLL_DOWN_KEYS.has(key)).toBe(false);
      }
    });
  });
});
