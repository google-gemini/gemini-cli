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
 *  - Click:  A pulsing blue circular ripple at the click coordinates, fading
 *            out over ~600ms and then self-removing.
 *  - Scroll: A translucent blue rectangular bar on the right edge of the
 *            viewport that slides in the scroll direction and fades out.
 *
 * ### How click animations work
 *
 * CDP-dispatched clicks trigger real DOM mousedown/pointerdown events.
 * `buildPreClickListenerScript()` registers a one-shot event listener
 * (capture phase, removed after the first event) BEFORE the click tool
 * executes.  When the CDP click fires, the listener receives the exact
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
 * rather than using the Web Animations API, keeping the implementation
 * consistent with inputBlocker.ts.  Each animation element self-removes via
 * the animationend event.
 */

/** Id for the shared <style> element that holds the click @keyframes. */
const CLICK_STYLE_ID = '__gemini_cursor_style';

/** Id for the shared <style> element that holds the scroll @keyframes. */
const SCROLL_STYLE_ID = '__gemini_scroll_style';

/** Id used on the one-shot listener sentinel so we can detect double-inject. */
const CLICK_LISTENER_SENTINEL_ID = '__gemini_click_listener';

/**
 * CSS @keyframes block for the click ripple (injected once per page).
 * Shared between pre-click-listener and direct injection scripts.
 */
const CLICK_KEYFRAMES =
  '@keyframes __gemini_click { ' +
  '0%   { transform: scale(0.3); opacity: 1; } ' +
  '60%  { transform: scale(1);   opacity: 0.6; } ' +
  '100% { transform: scale(1.4); opacity: 0; } ' +
  '}';

/**
 * Builds a JavaScript function string that registers a **one-shot** mousedown
 * capture listener.  When the CDP click fires (triggering a real DOM event),
 * the listener reads `e.clientX / e.clientY`, injects the ripple at that
 * position, and immediately removes itself.
 *
 * Must be called (and awaited) BEFORE the click tool executes so that the
 * listener is in place by the time the DOM event fires.
 *
 * The sentinel `<span>` attached to `<head>` prevents double-registration if
 * evaluate_script is called twice in quick succession.
 */
export function buildPreClickListenerScript(): string {
  return `() => {
    // Guard: only one listener at a time.
    if (document.getElementById('${CLICK_LISTENER_SENTINEL_ID}')) {
      return 'listener-already-registered';
    }
    var sentinel = document.createElement('span');
    sentinel.id = '${CLICK_LISTENER_SENTINEL_ID}';
    sentinel.setAttribute('aria-hidden', 'true');
    (document.head || document.documentElement).appendChild(sentinel);

    // Ensure @keyframes are injected once per page.
    if (!document.getElementById('${CLICK_STYLE_ID}')) {
      var s = document.createElement('style');
      s.id = '${CLICK_STYLE_ID}';
      s.textContent = '${CLICK_KEYFRAMES}';
      (document.head || document.documentElement).appendChild(s);
    }

    function onMousedown(e) {
      // Remove sentinel and listener immediately.
      var sen = document.getElementById('${CLICK_LISTENER_SENTINEL_ID}');
      if (sen) sen.remove();
      document.removeEventListener('mousedown', onMousedown, true);

      var x = e.clientX;
      var y = e.clientY;

      var dot = document.createElement('div');
      dot.setAttribute('aria-hidden', 'true');
      dot.setAttribute('role', 'presentation');
      dot.style.cssText = [
        'position: fixed',
        'left: ' + (x - 12) + 'px',
        'top: '  + (y - 12) + 'px',
        'width: 24px',
        'height: 24px',
        'border-radius: 50%',
        'background: rgba(66, 133, 244, 0.5)',
        'border: 2px solid rgba(66, 133, 244, 0.8)',
        'pointer-events: none',
        'z-index: 2147483647',
        'animation: __gemini_click 0.6s ease-out forwards',
      ].join('; ');

      (document.body || document.documentElement).appendChild(dot);
      dot.addEventListener('animationend', function() { dot.remove(); }, { once: true });
    }

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
 * @param x  Viewport-relative X coordinate in CSS pixels.
 * @param y  Viewport-relative Y coordinate in CSS pixels.
 */
export function buildClickAnimationScript(x: number, y: number): string {
  const ix = Math.round(x);
  const iy = Math.round(y);

  return `() => {
    if (!document.getElementById('${CLICK_STYLE_ID}')) {
      var s = document.createElement('style');
      s.id = '${CLICK_STYLE_ID}';
      s.textContent = '${CLICK_KEYFRAMES}';
      (document.head || document.documentElement).appendChild(s);
    }

    var dot = document.createElement('div');
    dot.setAttribute('aria-hidden', 'true');
    dot.setAttribute('role', 'presentation');
    dot.style.cssText = [
      'position: fixed',
      'left: ' + (${ix} - 12) + 'px',
      'top: '  + (${iy} - 12) + 'px',
      'width: 24px',
      'height: 24px',
      'border-radius: 50%',
      'background: rgba(66, 133, 244, 0.5)',
      'border: 2px solid rgba(66, 133, 244, 0.8)',
      'pointer-events: none',
      'z-index: 2147483647',
      'animation: __gemini_click 0.6s ease-out forwards',
    ].join('; ');

    (document.body || document.documentElement).appendChild(dot);
    dot.addEventListener('animationend', function() { dot.remove(); }, { once: true });
    return 'click-animation-injected';
  }`;
}

/**
 * Builds a JavaScript function string that injects a prominent floating panel
 * with three cascading directional arrows (▼ for down, ▲ for up) that animate
 * in sequence, clearly communicating scroll direction.
 *
 * The panel:
 *  - Fades in and scales from 0.9 → 1 over 150ms
 *  - Shows three arrows that flow in the scroll direction with 220ms stagger
 *  - Stays visible for ~1.4s total, then fades out
 *  - Self-removes when panel fade animation ends
 *  - Replaces any existing scroll panel to avoid stacking on rapid scrolls
 *
 * @param direction  'down' for downward scroll, 'up' for upward scroll.
 */
export function buildScrollAnimationScript(direction: 'up' | 'down'): string {
  const arrowChar = direction === 'down' ? '▼' : '▲';
  const arrowKeyframe = `__gemini_scroll_arrow_${direction}`;

  return `() => {
    // Replace any existing panel to avoid stacking on rapid scrolls.
    var prev = document.getElementById('__gemini_scroll_panel');
    if (prev) prev.remove();

    // Inject @keyframes once per page.
    if (!document.getElementById('${SCROLL_STYLE_ID}')) {
      var st = document.createElement('style');
      st.id = '${SCROLL_STYLE_ID}';
      st.textContent =
        '@keyframes __gemini_scroll_arrow_down { ' +
          '0%   { opacity: 0; transform: translateY(-6px); } ' +
          '35%  { opacity: 1; transform: translateY(0px); } ' +
          '65%  { opacity: 1; transform: translateY(5px); } ' +
          '100% { opacity: 0; transform: translateY(12px); } ' +
        '} ' +
        '@keyframes __gemini_scroll_arrow_up { ' +
          '0%   { opacity: 0; transform: translateY(6px); } ' +
          '35%  { opacity: 1; transform: translateY(0px); } ' +
          '65%  { opacity: 1; transform: translateY(-5px); } ' +
          '100% { opacity: 0; transform: translateY(-12px); } ' +
        '} ' +
        '@keyframes __gemini_scroll_panel { ' +
          '0%   { opacity: 0; transform: translateY(-50%) scale(0.88); } ' +
          '12%  { opacity: 1; transform: translateY(-50%) scale(1); } ' +
          '80%  { opacity: 1; transform: translateY(-50%) scale(1); } ' +
          '100% { opacity: 0; transform: translateY(-50%) scale(0.92); } ' +
        '}';
      (document.head || document.documentElement).appendChild(st);
    }

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
      'box-shadow: 0 0 18px rgba(66, 133, 244, 0.5), 0 4px 16px rgba(0,0,0,0.4)',
      'animation: __gemini_scroll_panel 1.5s ease-out forwards',
    ].join('; ');

    var delays = ['0s', '0.22s', '0.44s'];
    for (var i = 0; i < 3; i++) {
      var arrow = document.createElement('div');
      arrow.textContent = '${arrowChar}';
      arrow.style.cssText = [
        'color: rgba(100, 168, 255, 0.95)',
        'font-size: 16px',
        'line-height: 1',
        'opacity: 0',
        'animation: ${arrowKeyframe} 0.88s ease-in-out forwards',
        'animation-delay: ' + delays[i],
      ].join('; ');
      panel.appendChild(arrow);
    }

    (document.body || document.documentElement).appendChild(panel);

    // Only remove on the panel's own animationend, not bubbled arrow events.
    panel.addEventListener('animationend', function(e) {
      if (e.target === panel) panel.remove();
    });

    return 'scroll-animation-injected';
  }`;
}

/** Keys that represent downward scroll actions. */
export const SCROLL_DOWN_KEYS = new Set([
  'ArrowDown',
  'PageDown',
  'Space',
  ' ',
]);

/** Keys that represent upward scroll actions. */
export const SCROLL_UP_KEYS = new Set(['ArrowUp', 'PageUp']);
