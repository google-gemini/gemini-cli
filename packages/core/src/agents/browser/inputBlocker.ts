/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Input blocker utility for browser agent.
 *
 * Injects a transparent overlay that captures all user input events
 * and displays an informational banner during automation.
 *
 * IMPORTANT: chrome-devtools-mcp's evaluate_script tool expects:
 *   { function: "() => { ... }" }
 * It takes a function declaration string, NOT raw code.
 * The parameter name is "function", not "code" or "expression".
 */

import type { BrowserManager } from './browserManager.js';
import { debugLogger } from '../../utils/debugLogger.js';

/**
 * JavaScript function to inject the input blocker overlay.
 * This blocks all user input events while allowing CDP commands to work normally.
 *
 * Must be a function declaration (NOT an IIFE) because evaluate_script
 * evaluates it via Puppeteer's page.evaluate().
 */
const INPUT_BLOCKER_FUNCTION = `() => {
  // Remove any existing blocker first
  const existing = document.getElementById('__gemini_input_blocker');
  if (existing) {
    existing.remove();
  }

  const blocker = document.createElement('div');
  blocker.id = '__gemini_input_blocker';
  blocker.setAttribute('aria-hidden', 'true');
  blocker.setAttribute('role', 'presentation');
  blocker.style.cssText = [
    'position: fixed',
    'inset: 0',
    'z-index: 2147483646',
    'cursor: not-allowed',
    'background: transparent',
  ].join('; ');

  // Block all input events
  const blockEvent = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  };

  const events = [
    'click', 'mousedown', 'mouseup', 'keydown', 'keyup',
    'keypress', 'touchstart', 'touchend', 'touchmove', 'wheel',
    'contextmenu', 'dblclick', 'pointerdown', 'pointerup', 'pointermove',
  ];
  for (const event of events) {
    blocker.addEventListener(event, blockEvent, { capture: true });
  }

  // Capsule-shaped floating pill at bottom center
  const pill = document.createElement('div');
  pill.style.cssText = [
    'position: fixed',
    'bottom: 20px',
    'left: 50%',
    'transform: translateX(-50%) translateY(20px)',
    'display: flex',
    'align-items: center',
    'gap: 10px',
    'padding: 10px 20px',
    'background: rgba(24, 24, 27, 0.88)',
    'color: #fff',
    'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    'font-size: 13px',
    'line-height: 1',
    'border-radius: 999px',
    'z-index: 2147483647',
    'backdrop-filter: blur(16px)',
    '-webkit-backdrop-filter: blur(16px)',
    'border: 1px solid rgba(255, 255, 255, 0.08)',
    'box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05)',
    'opacity: 0',
    'transition: opacity 0.4s ease, transform 0.4s ease',
    'white-space: nowrap',
    'user-select: none',
    'pointer-events: none',
  ].join('; ');

  // Pulsing red dot
  const dot = document.createElement('span');
  dot.style.cssText = [
    'width: 10px',
    'height: 10px',
    'border-radius: 50%',
    'background: #ef4444',
    'display: inline-block',
    'flex-shrink: 0',
    'box-shadow: 0 0 6px rgba(239, 68, 68, 0.6)',
    'animation: __gemini_pulse 2s ease-in-out infinite',
  ].join('; ');

  // Labels
  const label = document.createElement('span');
  label.style.cssText = 'font-weight: 600; letter-spacing: 0.01em;';
  label.textContent = 'Gemini CLI is controlling this browser';

  const sep = document.createElement('span');
  sep.style.cssText = 'width: 1px; height: 14px; background: rgba(255,255,255,0.2); flex-shrink: 0;';

  const sub = document.createElement('span');
  sub.style.cssText = 'color: rgba(255,255,255,0.55); font-size: 12px;';
  sub.textContent = 'Input disabled during automation';

  pill.appendChild(dot);
  pill.appendChild(label);
  pill.appendChild(sep);
  pill.appendChild(sub);

  // Inject @keyframes for the pulse animation
  const styleEl = document.createElement('style');
  styleEl.id = '__gemini_input_blocker_style';
  styleEl.textContent = '@keyframes __gemini_pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.85); } }';
  document.head.appendChild(styleEl);

  blocker.appendChild(pill);
  const target = document.body || document.documentElement;
  if (target) {
    target.appendChild(blocker);
    // Trigger entrance animation
    requestAnimationFrame(() => {
      pill.style.opacity = '1';
      pill.style.transform = 'translateX(-50%) translateY(0)';
    });
  }
}`;

/**
 * JavaScript function to remove the input blocker overlay.
 */
const REMOVE_BLOCKER_FUNCTION = `() => {
  const blocker = document.getElementById('__gemini_input_blocker');
  if (blocker) {
    blocker.remove();
  }
  const style = document.getElementById('__gemini_input_blocker_style');
  if (style) {
    style.remove();
  }
}`;

/**
 * Injects the input blocker overlay into the current page.
 *
 * @param browserManager The browser manager to use for script execution
 * @returns Promise that resolves when the blocker is injected
 */
export async function injectInputBlocker(
  browserManager: BrowserManager,
): Promise<void> {
  try {
    await browserManager.callTool('evaluate_script', {
      function: INPUT_BLOCKER_FUNCTION,
    });
    debugLogger.log('Input blocker injected successfully');
  } catch (error) {
    // Log but don't throw - input blocker is a UX enhancement, not critical functionality
    debugLogger.warn(
      'Failed to inject input blocker: ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}

/**
 * Removes the input blocker overlay from the current page.
 *
 * @param browserManager The browser manager to use for script execution
 * @returns Promise that resolves when the blocker is removed
 */
export async function removeInputBlocker(
  browserManager: BrowserManager,
): Promise<void> {
  try {
    await browserManager.callTool('evaluate_script', {
      function: REMOVE_BLOCKER_FUNCTION,
    });
    debugLogger.log('Input blocker removed successfully');
  } catch (error) {
    // Log but don't throw - removal failure is not critical
    debugLogger.warn(
      'Failed to remove input blocker: ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}
