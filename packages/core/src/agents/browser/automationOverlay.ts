/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Automation overlay utilities for visual indication during browser automation.
 *
 * Provides functions to inject and remove a pulsating blue border overlay
 * that indicates when the browser is under AI agent control.
 *
 * Uses the Web Animations API instead of injected <style> tags so the
 * animation works on sites with strict Content Security Policies (e.g. google.com).
 *
 * The script strings are passed to chrome-devtools-mcp's evaluate_script tool
 * which expects a plain function expression (NOT an IIFE).
 */

import type { BrowserManager } from './browserManager.js';
import { debugLogger } from '../../utils/debugLogger.js';

const OVERLAY_ELEMENT_ID = '__gemini_automation_overlay';

/**
 * Builds the JavaScript function string that injects the automation overlay.
 *
 * Returns a plain arrow-function expression (no trailing invocation) because
 * chrome-devtools-mcp's evaluate_script tool invokes it internally.
 *
 * Avoids nested template literals by using string concatenation for cssText.
 */
function buildInjectionScript(): string {
  return `() => {
    const id = '${OVERLAY_ELEMENT_ID}';
    const existing = document.getElementById(id);
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.setAttribute('role', 'presentation');

    Object.assign(overlay.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      right: '0',
      bottom: '0',
      zIndex: '2147483647',
      pointerEvents: 'none',
      border: '6px solid rgba(66, 133, 244, 1.0)',
    });

    document.documentElement.appendChild(overlay);

    try {
      overlay.animate([
        { borderColor: 'rgba(66,133,244,0.3)', boxShadow: 'inset 0 0 8px rgba(66,133,244,0.15)' },
        { borderColor: 'rgba(66,133,244,1.0)', boxShadow: 'inset 0 0 16px rgba(66,133,244,0.5)' },
        { borderColor: 'rgba(66,133,244,0.3)', boxShadow: 'inset 0 0 8px rgba(66,133,244,0.15)' }
      ], { duration: 2000, iterations: Infinity, easing: 'ease-in-out' });
    } catch (e) {
      // Silently ignore animation errors, as they can happen on sites with strict CSP.
      // The border itself is the most important visual indicator.
    }

    return 'overlay-injected';
  }`;
}

/**
 * Builds the JavaScript function string that removes the automation overlay.
 */
function buildRemovalScript(): string {
  return `() => {
    const el = document.getElementById('${OVERLAY_ELEMENT_ID}');
    if (el) el.remove();
    return 'overlay-removed';
  }`;
}

/**
 * Injects the automation overlay into the current page.
 */
export async function injectAutomationOverlay(
  browserManager: BrowserManager,
  signal?: AbortSignal,
): Promise<void> {
  try {
    debugLogger.log('Injecting automation overlay...');

    const result = await browserManager.callTool(
      'evaluate_script',
      { function: buildInjectionScript() },
      signal,
      true,
    );

    if (result.isError) {
      debugLogger.warn('Failed to inject automation overlay:', result);
    } else {
      debugLogger.log('Automation overlay injected successfully');
    }
  } catch (error) {
    debugLogger.warn('Error injecting automation overlay:', error);
  }
}

/**
 * Removes the automation overlay from the current page.
 */
export async function removeAutomationOverlay(
  browserManager: BrowserManager,
  signal?: AbortSignal,
): Promise<void> {
  try {
    debugLogger.log('Removing automation overlay...');

    const result = await browserManager.callTool(
      'evaluate_script',
      { function: buildRemovalScript() },
      signal,
      true,
    );

    if (result.isError) {
      debugLogger.warn('Failed to remove automation overlay:', result);
    } else {
      debugLogger.log('Automation overlay removed successfully');
    }
  } catch (error) {
    debugLogger.warn('Error removing automation overlay:', error);
  }
}
