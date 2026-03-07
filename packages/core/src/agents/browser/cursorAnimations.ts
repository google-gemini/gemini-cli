/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const MAX_Z_INDEX = 2147483647; // Max signed 32-bit integer

/**
 * CSS keyframes shared by all animation types.
 */
const STATIC_KEYFRAMES = `
  @keyframes __gemini_click {
    0% { transform: translate(-50%, -50%) scale(0.33); opacity: 1; }
    100% { transform: translate(-50%, -50%) scale(1); opacity: 0; }
  }
  @keyframes __gemini_scroll_down {
    0% { transform: translateY(0); opacity: 1; }
    100% { transform: translateY(40px); opacity: 0; }
  }
  @keyframes __gemini_scroll_up {
    0% { transform: translateY(0); opacity: 1; }
    100% { transform: translateY(-40px); opacity: 0; }
  }
`;

const KEYFRAMES_JSON = JSON.stringify(STATIC_KEYFRAMES);

/**
 * JS snippet that ensures animation keyframes are injected exactly once.
 */
const INJECT_STYLES_FN = `
  var sid = '__gemini_animations';
  if (!document.getElementById(sid)) {
    var s = document.createElement('style');
    s.id = sid;
    s.textContent = ${KEYFRAMES_JSON};
    document.head.appendChild(s);
  }
`;

/**
 * Click dot styles (shared between coordinate-based and listener-based).
 * Expects variables `cx` and `cy` to be in scope.
 */
const CREATE_CLICK_DOT = `
  var dot = document.createElement('div');
  dot.setAttribute('aria-hidden', 'true');
  dot.style.cssText = 'position:fixed;left:' + cx + 'px;top:' + cy + 'px;'
    + 'transform:translate(-50%,-50%);width:24px;height:24px;border-radius:50%;'
    + 'background:rgba(66,133,244,0.5);border:2px solid rgba(66,133,244,0.8);'
    + 'pointer-events:none;z-index:${MAX_Z_INDEX};'
    + 'animation:__gemini_click 0.6s ease-out forwards;';
  document.body.appendChild(dot);
  dot.addEventListener('animationend', function() { dot.remove(); });
`;

/**
 * Generates an arrow-function string for evaluate_script that injects a click
 * animation at the given (x, y) viewport coordinates.
 */
export function generateClickAnimationScript(x: number, y: number): string {
  return `() => {
  ${INJECT_STYLES_FN}
  var cx = ${x}, cy = ${y};
  ${CREATE_CLICK_DOT}
}`;
}

/**
 * Generates an arrow-function string that shows a click animation on the
 * element matching the given uid.
 */
export function generateClickAnimationByUidScript(uid: string): string {
  const safeUid = uid.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `() => {
  ${INJECT_STYLES_FN}
  var el = document.querySelector('[data-uid="${safeUid}"]') || document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return;
  var rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;
  var cx = rect.left + rect.width / 2;
  var cy = rect.top + rect.height / 2;
  ${CREATE_CLICK_DOT}
}`;
}

/**
 * Generates an arrow-function string that injects a scroll direction
 * indicator animation.
 */
export function generateScrollAnimationScript(
  direction: 'up' | 'down',
): string {
  const chevron = direction === 'down' ? '▼' : '▲';
  const barTop = direction === 'down' ? '45%' : '50%';
  const chevronTop = direction === 'down' ? '58%' : '37%';

  return `() => {
  ${INJECT_STYLES_FN}
  var wrapper = document.createElement('div');
  wrapper.setAttribute('aria-hidden', 'true');
  wrapper.style.cssText = 'position:fixed;right:20px;top:0;bottom:0;'
    + 'pointer-events:none;z-index:${MAX_Z_INDEX};'
    + 'animation:__gemini_scroll_${direction} 0.6s ease-out forwards;';

  var bar = document.createElement('div');
  bar.style.cssText = 'position:absolute;right:0;top:${barTop};'
    + 'width:6px;height:60px;border-radius:3px;'
    + 'background:rgba(66,133,244,0.5);'
    + 'box-shadow:0 0 8px rgba(66,133,244,0.3);';

  var arrow = document.createElement('div');
  arrow.textContent = '${chevron}';
  arrow.style.cssText = 'position:absolute;right:-7px;top:${chevronTop};'
    + 'font-size:20px;color:rgba(66,133,244,0.8);'
    + 'text-shadow:0 0 6px rgba(66,133,244,0.4);';

  wrapper.appendChild(bar);
  wrapper.appendChild(arrow);
  document.body.appendChild(wrapper);
  wrapper.addEventListener('animationend', function() { wrapper.remove(); });
}`;
}

/**
 * Generates CSS keyframes for animations (used for overlay injection).
 */
export function generateAnimationKeyframes(): string {
  return `
    <style id="__gemini_animations">
      ${STATIC_KEYFRAMES}
    </style>
  `;
}
