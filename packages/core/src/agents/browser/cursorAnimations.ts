/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Cursor animation utilities for visual feedback during browser automation.
 *
 * Provides functions to generate JavaScript strings that inject ephemeral
 * visual indicators into the page when the agent clicks or scrolls:
 *
 * - Click: A pulsing blue circular ripple at the click coordinates, fading
 *   out over ~600ms and then self-removing.
 * - Scroll: A translucent blue rectangular bar on the right edge of the
 *   viewport that slides in the scroll direction and fades out.
 *
 * ### How click animations work
 *
 * CDP-dispatched clicks trigger real DOM mousedown/pointerdown events.
 * `buildPreClickListenerScript()` registers a one-shot event listener
 * (capture phase, removed after the first event) BEFORE the click tool
 * executes. When the CDP click fires, the listener receives the exact
 * clientX/clientY and injects the ripple at that position.
 *
 * This approach works for BOTH click(uid) (accessibility-tree) and
 * click_at(x, y) (vision mode), and correctly handles non-focusable elements
 * such as <div>, <span>, and <li> that would not become document.activeElement.
 *
 * All injected elements carry aria-hidden="true" so they are invisible to
 * chrome-devtools-mcp's accessibility-tree snapshots (take_snapshot).
 *
 * The scripts are passed to chrome-devtools-mcp's evaluate_script tool which
 * expects a plain function expression (NOT an IIFE), matching the convention
 * used in automationOverlay.ts and inputBlocker.ts.
 *
 * @keyframes rules are injected once into <head> (guarded by an id check)
 * All animations use the Web Animations API (element.animate) to avoid
 * injecting <style> tags, improving performance and satisfying strict
 * Content Security Policies (CSPs).
 */

/** Window property used to detect duplicate listeners. */
const CLICK_LISTENER_PROP = '__geminiCursorClickListenerActive';

/** Window property used to store the listener function reference for cleanup. */
const CLICK_LISTENER_FN_PROP = '__geminiCursorOnMousedown';

/** Keys that trigger a downward scroll action. */
export const SCROLL_DOWN_KEYS: ReadonlySet<string> = new Set([
  'ArrowDown',
  'PageDown',
  'Space',
  'End',
]);

/** Keys that trigger an upward scroll action. */
export const SCROLL_UP_KEYS: ReadonlySet<string> = new Set([
  'ArrowUp',
  'PageUp',
  'Home',
]);

/**
 * Builds a JavaScript function string that registers a **one-shot** mousedown
 * capture listener. When the CDP click fires (triggering a real DOM event),
 * the listener reads `e.clientX / e.clientY`, injects the ripple at that
 * position, and immediately removes itself.
 *
 * Must be called (and awaited) BEFORE the click tool executes so that the
 * listener is in place by the time the DOM event fires.
 *
 * Uses a window property to prevent double-registration if
 * evaluate_script is called twice in quick succession, and sets a 3-second
 * timeout to ensure cleanup if the click never fires.
 */
export function buildPreClickListenerScript(): string {
  return `() => {
    // Guard: only one listener at a time.
    if (window.${CLICK_LISTENER_PROP}) {
      return 'listener-already-registered';
    }
    window.${CLICK_LISTENER_PROP} = true;

    function cleanup() {
      if (window.${CLICK_LISTENER_FN_PROP}) {
        document.removeEventListener('mousedown', window.${CLICK_LISTENER_FN_PROP}, true);
        delete window.${CLICK_LISTENER_FN_PROP};
      }
      delete window.${CLICK_LISTENER_PROP};
    }

    // Safety fallback: if no click happens within 3 seconds, clean up to avoid memory leaks
    // or intercepting a later, unrelated click.
    var safetyTimeout = setTimeout(cleanup, 3000);

    function onMousedown(e) {
      clearTimeout(safetyTimeout);
      cleanup();

      var x = e.clientX;
      var y = e.clientY;

      var dot = document.createElement('div');
      dot.setAttribute('aria-hidden', 'true');
      dot.setAttribute('role', 'presentation');
      dot.style.cssText = [
        'position: fixed',
        'left: ' + (x - 12) + 'px',
        'top: ' + (y - 12) + 'px',
        'width: 24px',
        'height: 24px',
        'border-radius: 50%',
        'background: rgba(66, 133, 244, 0.85)',
        'border: 3px solid rgba(66, 133, 244, 1.0)',
        'pointer-events: none',
        'z-index: 2147483647'
      ].join('; ');

      (document.body || document.documentElement).appendChild(dot);

      var anim = dot.animate([
        { transform: 'scale(0.3)', opacity: 1 },
        { transform: 'scale(1)', opacity: 0.6, offset: 0.6 },
        { transform: 'scale(1.4)', opacity: 0 }
      ], {
        duration: 600,
        easing: 'ease-out',
        fill: 'forwards'
      });

      anim.onfinish = function() { dot.remove(); };
    }

    window.${CLICK_LISTENER_FN_PROP} = onMousedown;
    // capture: true ensures we receive the event even when elements call
    // stopPropagation. CDP-simulated clicks dispatch real mousedown events.
    document.addEventListener('mousedown', onMousedown, true);
    return 'click-listener-registered';
  }`;
}

/**
 * Builds a JavaScript function string that injects the click ripple directly
 * at the given viewport coordinates without needing a pre-registered listener.
 *
 * Used for click_at(x, y) where coordinates are known ahead of time and we
 * can inject the animation immediately after execute (post-click) since the
 * coordinates are deterministic.
 *
 * @param x Viewport-relative X coordinate in CSS pixels.
 * @param y Viewport-relative Y coordinate in CSS pixels.
 */
export function buildClickAnimationScript(x: number, y: number): string {
  const ix = Math.round(x);
  const iy = Math.round(y);

  return `() => {
    var dot = document.createElement('div');
    dot.setAttribute('aria-hidden', 'true');
    dot.setAttribute('role', 'presentation');
    dot.style.cssText = [
      'position: fixed',
      'left: ' + (${ix} - 12) + 'px',
      'top: ' + (${iy} - 12) + 'px',
      'width: 24px',
      'height: 24px',
      'border-radius: 50%',
      'background: rgba(66, 133, 244, 0.85)',
      'border: 3px solid rgba(66, 133, 244, 1.0)',
      'pointer-events: none',
      'z-index: 2147483647'
    ].join('; ');

    (document.body || document.documentElement).appendChild(dot);

    var anim = dot.animate([
      { transform: 'scale(0.3)', opacity: 1 },
      { transform: 'scale(1)', opacity: 0.6, offset: 0.6 },
      { transform: 'scale(1.4)', opacity: 0 }
    ], {
      duration: 600,
      easing: 'ease-out',
      fill: 'forwards'
    });

    anim.onfinish = function() { dot.remove(); };
    return 'click-animation-injected';
  }`;
}

/**
 * Builds a JavaScript function string that injects a prominent floating panel
 * with three cascading directional arrows (▼ for down, ▲ for up) that animate
 * in sequence, clearly communicating scroll direction.
 *
 * The panel:
 * - Fades in and scales from 0.9 → 1 over 150ms
 * - Shows three arrows that flow in the scroll direction with 220ms stagger
 * - Stays visible for ~1.4s total, then fades out
 * - Self-removes when panel fade animation ends
 * - Replaces any existing scroll panel to avoid stacking on rapid scrolls
 *
 * @param direction 'down' for downward scroll, 'up' for upward scroll.
 */
export function buildScrollAnimationScript(direction: 'up' | 'down'): string {
  const arrowChar = direction === 'down' ? '▼' : '▲';

  // Transform values based on direction
  const yTransforms =
    direction === 'down'
      ? ['-6px', '0px', '5px', '12px']
      : ['6px', '0px', '-5px', '-12px'];

  return `() => {
    // Replace any existing panel to avoid stacking on rapid scrolls.
    var prev = document.getElementById('__gemini_scroll_panel');
    if (prev) prev.remove();

    var panel = document.createElement('div');
    panel.id = '__gemini_scroll_panel';
    panel.setAttribute('aria-hidden', 'true');
    panel.setAttribute('role', 'presentation');
    panel.style.cssText = [
      'position: fixed',
      'right: 24px',
      'top: 50%',
      'display: flex',
      'flex-direction: column',
      'align-items: center',
      'gap: 4px',
      'background: rgba(8, 18, 48, 0.82)',
      'border: 1.5px solid rgba(66, 133, 244, 0.75)',
      'border-radius: 14px',
      'padding: 12px 16px',
      'pointer-events: none',
      'z-index: 2147483647',
      'box-shadow: 0 0 18px rgba(66, 133, 244, 0.5), 0 4px 16px rgba(0,0,0,0.4)'
    ].join('; ');

    for (var i = 0; i < 3; i++) {
      var arrow = document.createElement('div');
      arrow.textContent = '${arrowChar}';
      arrow.style.cssText = [
        'color: rgba(100, 168, 255, 0.95)',
        'font-size: 16px',
        'line-height: 1',
        'opacity: 0'
      ].join('; ');

      panel.appendChild(arrow);

      arrow.animate([
        { opacity: 0, transform: 'translateY(${yTransforms[0]})' },
        { opacity: 1, transform: 'translateY(${yTransforms[1]})', offset: 0.35 },
        { opacity: 1, transform: 'translateY(${yTransforms[2]})', offset: 0.65 },
        { opacity: 0, transform: 'translateY(${yTransforms[3]})' }
      ], {
        duration: 880,
        delay: i * 220,
        easing: 'ease-in-out',
        fill: 'forwards'
      });
    }

    (document.body || document.documentElement).appendChild(panel);

    var panelAnim = panel.animate([
      { opacity: 0, transform: 'translateY(-50%) scale(0.88)' },
      { opacity: 1, transform: 'translateY(-50%) scale(1)', offset: 0.12 },
      { opacity: 1, transform: 'translateY(-50%) scale(1)', offset: 0.8 },
      { opacity: 0, transform: 'translateY(-50%) scale(0.92)' }
    ], {
      duration: 1500,
      easing: 'ease-out',
      fill: 'forwards'
    });

    panelAnim.onfinish = function() { panel.remove(); };

    return 'scroll-animation-injected';
  }`;
}
