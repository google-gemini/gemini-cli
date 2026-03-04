/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Generates JavaScript code to inject a click animation at given coordinates.
 * Uses static keyframes and element-level positioning to avoid race conditions.
 */
export function generateClickAnimationScript(x: number, y: number): string {
  return `
    (function() {
      ${INTERNAL_INJECT_STYLES_JS}
      
      const dot = document.createElement('div');
      dot.setAttribute('aria-hidden', 'true');
      dot.style.cssText = \`
        position: fixed; left: \${${x}}px; top: \${${y}}px;
        transform: translate(-50%, -50%);
        width: 24px; height: 24px; border-radius: 50%;
        background: rgba(66, 133, 244, 0.5);
        border: 2px solid rgba(66, 133, 244, 0.8);
        pointer-events: none; z-index: 2147483647;
        animation: __gemini_click 0.6s ease-out forwards;
      \`;
      document.body.appendChild(dot);
      dot.addEventListener('animationend', () => dot.remove());
    })();
  `;
}

/**
 * Generates JavaScript code to inject a scroll animation.
 */
export function generateScrollAnimationScript(
  direction: 'up' | 'down',
): string {
  return `
    (function() {
      ${INTERNAL_INJECT_STYLES_JS}

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
    })();
  `;
}

/**
 * Generates CSS keyframes for animations.
 */
export function generateAnimationKeyframes(): string {
  return `
    <style id="__gemini_animations">
      ${STATIC_KEYFRAMES}
    </style>
  `;
}

/**
 * Shared static keyframes that don't depend on specific coordinates.
 * Using transform: scale for click avoids re-calculating keyframes per click.
 */
const STATIC_KEYFRAMES = `
  @keyframes __gemini_click {
    0% { transform: translate(-50%, -50%) scale(0.33); opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
  }
  @keyframes __gemini_scroll_down {
    0% { transform: translateY(-50%) translateX(0); opacity: 1; }
    100% { transform: translateY(-50%) translateX(20px); opacity: 0; }
  }
  @keyframes __gemini_scroll_up {
    0% { transform: translateY(-50%) translateX(0); opacity: 1; }
    100% { transform: translateY(-50%) translateX(-20px); opacity: 0; }
  }
`;

/**
 * Internal JS snippet to inject static styles once.
 */
const INTERNAL_INJECT_STYLES_JS = `
  const styleId = '__gemini_animations';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = ${JSON.stringify(STATIC_KEYFRAMES)};
    document.head.appendChild(style);
  }
`.trim();
