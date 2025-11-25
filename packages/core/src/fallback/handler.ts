/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { AuthType } from '../core/contentGenerator.js';
import {
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL,
} from '../config/models.js';
import { logFlashFallback, FlashFallbackEvent } from '../telemetry/index.js';
import { coreEvents } from '../utils/events.js';
import { openBrowserSecurely } from '../utils/secure-browser-launcher.js';
import { debugLogger } from '../utils/debugLogger.js';
import { getErrorMessage } from '../utils/errors.js';
import { ModelNotFoundError } from '../utils/httpErrors.js';
import { TerminalQuotaError } from '../utils/googleQuotaErrors.js';

const UPGRADE_URL_PAGE = 'https://goo.gle/set-up-gemini-code-assist';

export async function handleFallback(
  config: Config,
  failedModel: string,
  authType?: string,
  error?: unknown,
): Promise<string | boolean | null> {
  // Applicability Checks
  if (authType !== AuthType.LOGIN_WITH_GOOGLE) return null;

  // Guardrail: If it's a ModelNotFoundError but NOT the preview model, do not handle it.
  if (
    error instanceof ModelNotFoundError &&
    failedModel !== PREVIEW_GEMINI_MODEL
  ) {
    return null;
  }
  const shouldActivatePreviewFallback =
    failedModel === PREVIEW_GEMINI_MODEL &&
    !(error instanceof TerminalQuotaError);
  // Preview Model Specific Logic
  if (shouldActivatePreviewFallback) {
    // Always set bypass mode for the immediate retry, for non-TerminalQuotaErrors.
    // This ensures the next attempt uses 2.5 Pro.
    config.setPreviewModelBypassMode(true);

    // If we are already in Preview Model fallback mode (user previously said "Always"),
    // we silently retry (which will use 2.5 Pro due to bypass mode).
    if (config.isPreviewModelFallbackMode()) {
      return true;
    }
  }

  const fallbackModel = shouldActivatePreviewFallback
    ? DEFAULT_GEMINI_MODEL
    : DEFAULT_GEMINI_FLASH_MODEL;

  // Consult UI Handler for Intent
  const fallbackModelHandler = config.fallbackModelHandler;
  if (typeof fallbackModelHandler !== 'function') return null;

  try {
    // Pass the specific failed model to the UI handler.
    const intent = await fallbackModelHandler(
      failedModel,
      fallbackModel,
      error,
    );

    // Process Intent and Update State
    switch (intent) {
      case 'retry_always':
        // If the error is non-retryable, e.g. TerminalQuota Error, trigger a regular fallback to flash.
        // For all other errors, activate previewModel fallback.
        if (shouldActivatePreviewFallback) {
          activatePreviewModelFallbackMode(config);
        } else {
          activateFallbackMode(config, authType);
        }
        return true; // Signal retryWithBackoff to continue.

      case 'retry_once':
        // Just retry this time, do NOT set sticky fallback mode.
        return true;

      case 'stop':
        activateFallbackMode(config, authType);
        return false;

      case 'retry_later':
        return false;

      case 'upgrade':
        await handleUpgrade();
        return false;

      default:
        throw new Error(
          `Unexpected fallback intent received from fallbackModelHandler: "${intent}"`,
        );
    }
  } catch (handlerError) {
    debugLogger.error('Fallback UI handler failed:', handlerError);
    return null;
  }
}

async function handleUpgrade() {
  try {
    await openBrowserSecurely(UPGRADE_URL_PAGE);
  } catch (error) {
    debugLogger.warn(
      'Failed to open browser automatically:',
      getErrorMessage(error),
    );
  }
}

function activateFallbackMode(config: Config, authType: string | undefined) {
  if (!config.isInFallbackMode()) {
    config.setFallbackMode(true);
    coreEvents.emitFallbackModeChanged(true);
    if (authType) {
      logFlashFallback(config, new FlashFallbackEvent(authType));
    }
  }
}

function activatePreviewModelFallbackMode(config: Config) {
  if (!config.isPreviewModelFallbackMode()) {
    config.setPreviewModelFallbackMode(true);
    // We might want a specific event for Preview Model fallback, but for now we just set the mode.
  }
}
