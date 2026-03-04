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
 */

import type { BrowserManager } from './browserManager.js';
import { debugLogger } from '../../utils/debugLogger.js';

/**
 * JavaScript code to inject the input blocker overlay.
 * This blocks all user input events while allowing CDP commands to work normally.
 */
const INPUT_BLOCKER_SCRIPT = `(() => {
  // Remove any existing blocker first
  const existing = document.getElementById('__gemini_input_blocker');
  if (existing) {
    existing.remove();
  }

  const blocker = document.createElement('div');
  blocker.id = '__gemini_input_blocker';
  blocker.setAttribute('aria-hidden', 'true');
  blocker.setAttribute('role', 'presentation');
  blocker.style.cssText = \`
    position: fixed; inset: 0; z-index: 2147483646;
    cursor: not-allowed;
    background: transparent;
  \`;

  // Block all input events
  const blockEvent = (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  };

  for (const event of ['click', 'mousedown', 'mouseup', 'keydown', 'keyup',
    'keypress', 'touchstart', 'touchend', 'touchmove', 'wheel', 'contextmenu',
    'dblclick', 'pointerdown', 'pointerup', 'pointermove']) {
    blocker.addEventListener(event, blockEvent, { capture: true });
  }

  // Informational banner at bottom
  const banner = document.createElement('div');
  banner.style.cssText = \`
    position: fixed; bottom: 0; left: 0; right: 0;
    background: rgba(30, 30, 30, 0.85);
    color: #fff; padding: 8px 16px;
    font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    text-align: center; z-index: 2147483647;
    backdrop-filter: blur(8px);
    border-top: 1px solid rgba(66, 133, 244, 0.5);
  \`;
  banner.textContent = '🤖 Gemini CLI is controlling this browser. Input is disabled during automation.';

  blocker.appendChild(banner);
  document.body.appendChild(blocker);
})();`;

/**
 * JavaScript code to remove the input blocker overlay.
 */
const REMOVE_BLOCKER_SCRIPT = `(() => {
  const blocker = document.getElementById('__gemini_input_blocker');
  if (blocker) {
    blocker.remove();
  }
})();`;

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
      code: INPUT_BLOCKER_SCRIPT,
    });
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
      code: REMOVE_BLOCKER_SCRIPT,
    });
  } catch (error) {
    // Log but don't throw - removal failure is not critical
    debugLogger.warn(
      'Failed to remove input blocker: ' +
        (error instanceof Error ? error.message : String(error)),
    );
  }
}
