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
 */

import type { BrowserManager } from './browserManager.js';
import { debugLogger } from '../../utils/debugLogger.js';

const OVERLAY_ELEMENT_ID = '__gemini_automation_overlay';
const OVERLAY_STYLE_ID = '__gemini_automation_style';

/**
 * JavaScript code to inject the automation overlay
 */
const OVERLAY_INJECTION_SCRIPT = `
(() => {
  // Remove existing overlay if present
  const existingOverlay = document.getElementById('${OVERLAY_ELEMENT_ID}');
  if (existingOverlay) {
    existingOverlay.remove();
  }
  
  const existingStyle = document.getElementById('${OVERLAY_STYLE_ID}');
  if (existingStyle) {
    existingStyle.remove();
  }
  
  // Create style element with animation
  const style = document.createElement('style');
  style.id = '${OVERLAY_STYLE_ID}';
  style.textContent = \`
    @keyframes __gemini_pulse {
      0%, 100% { 
        border-color: rgba(66, 133, 244, 0.2); 
        box-shadow: inset 0 0 8px rgba(66, 133, 244, 0.1); 
      }
      50% { 
        border-color: rgba(66, 133, 244, 0.6); 
        box-shadow: inset 0 0 16px rgba(66, 133, 244, 0.2); 
      }
    }
  \`;
  document.head.appendChild(style);
  
  // Create overlay element
  const overlay = document.createElement('div');
  overlay.id = '${OVERLAY_ELEMENT_ID}';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.setAttribute('role', 'presentation');
  overlay.style.cssText = \`
    position: fixed; 
    inset: 0; 
    z-index: 2147483647;
    pointer-events: none;
    border: 3px solid rgba(66, 133, 244, 0.4);
    animation: __gemini_pulse 2s ease-in-out infinite;
  \`;
  
  document.body.appendChild(overlay);
  
  return 'Automation overlay injected successfully';
})();
`;

/**
 * JavaScript code to remove the automation overlay
 */
const OVERLAY_REMOVAL_SCRIPT = `
(() => {
  const overlay = document.getElementById('${OVERLAY_ELEMENT_ID}');
  if (overlay) {
    overlay.remove();
  }
  
  const style = document.getElementById('${OVERLAY_STYLE_ID}');
  if (style) {
    style.remove();
  }
  
  return 'Automation overlay removed successfully';
})();
`;

/**
 * Injects the automation overlay into the current page
 */
export async function injectAutomationOverlay(
  browserManager: BrowserManager,
  signal?: AbortSignal,
): Promise<void> {
  try {
    debugLogger.log('Injecting automation overlay...');

    const result = await browserManager.callTool(
      'evaluate_script',
      { code: OVERLAY_INJECTION_SCRIPT },
      signal,
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
 * Removes the automation overlay from the current page
 */
export async function removeAutomationOverlay(
  browserManager: BrowserManager,
  signal?: AbortSignal,
): Promise<void> {
  try {
    debugLogger.log('Removing automation overlay...');

    const result = await browserManager.callTool(
      'evaluate_script',
      { code: OVERLAY_REMOVAL_SCRIPT },
      signal,
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
