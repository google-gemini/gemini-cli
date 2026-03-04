/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates JavaScript code to inject a click animation at given coordinates
 */
export function generateClickAnimationScript(x: number, y: number): string {
  return `
    (function() {
      const dot = document.createElement('div');
      dot.setAttribute('aria-hidden', 'true');
      dot.style.cssText = \`
        position: fixed; left: \${${x} - 12}px; top: \${${y} - 12}px;
        width: 24px; height: 24px; border-radius: 50%;
        background: rgba(66, 133, 244, 0.5);
        border: 2px solid rgba(66, 133, 244, 0.8);
        pointer-events: none; z-index: 2147483647;
        animation: __gemini_click 0.6s ease-out forwards;
      \`;
      document.body.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove());

      // Inject keyframes if not present
      const keyframesId = '__gemini_click_keyframes';
      let style = document.getElementById(keyframesId);
      if (!style) {
        style = document.createElement('style');
        style.id = keyframesId;
        document.head.appendChild(style);
      }
      style.textContent = \`
        @keyframes __gemini_click {
          0% { width: 8px; height: 8px; left: \${${x} - 4}px; top: \${${y} - 4}px; opacity: 1; }
          100% { width: 24px; height: 24px; left: \${${x} - 12}px; top: \${${y} - 12}px; opacity: 0; }
        }
      \`;
    })();
  `;
}

/**
 * Generates JavaScript code to inject a scroll animation
 */
export function generateScrollAnimationScript(
  direction: 'up' | 'down',
): string {
  return `
    (function() {
      const indicator = document.createElement('div');
      indicator.setAttribute('aria-hidden', 'true');
      indicator.style.cssText = \`
        position: fixed; right: 16px; top: 50%;
        transform: translateY(-50%);
        width: 6px; height: 60px; border-radius: 3px;
        background: rgba(66, 133, 244, 0.4);
        pointer-events: none; z-index: 2147483647;
        animation: __gemini_scroll_${direction} 0.5s ease-out forwards;
      \`;
      document.body.appendChild(indicator);
      indicator.addEventListener('animationend', () => indicator.remove());

      // Inject keyframes if not present
      const styleId = '__gemini_scroll_keyframes';
      if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = \`
          @keyframes __gemini_scroll_down {
            0% { transform: translateY(-50%) translateX(0); opacity: 1; }
            100% { transform: translateY(-50%) translateX(20px); opacity: 0; }
          }
          @keyframes __gemini_scroll_up {
            0% { transform: translateY(-50%) translateX(0); opacity: 1; }
            100% { transform: translateY(-50%) translateX(-20px); opacity: 0; }
          }
        \`;
        document.head.appendChild(style);
      }
    })();
  `;
}

/**
 * Generates CSS keyframes for animations.
 * Primarily used for cases where we know coordinates ahead of time or global injection.
 */
export function generateAnimationKeyframes(x: number, y: number): string {
  return `
    <style>
      @keyframes __gemini_click {
        0% { width: 8px; height: 8px; left: ${x - 4}px; top: ${y - 4}px; opacity: 1; }
        100% { width: 24px; height: 24px; left: ${x - 12}px; top: ${y - 12}px; opacity: 0; }
      }
      @keyframes __gemini_scroll_down {
        0% { transform: translateY(-50%) translateX(0); opacity: 1; }
        100% { transform: translateY(-50%) translateX(20px); opacity: 0; }
      }
      @keyframes __gemini_scroll_up {
        0% { transform: translateY(-50%) translateX(0); opacity: 1; }
        100% { transform: translateY(-50%) translateX(-20px); opacity: 0; }
      }
    </style>
  `;
}
