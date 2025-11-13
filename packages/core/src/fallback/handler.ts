/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { AuthType } from '../core/contentGenerator.js';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { logFlashFallback, FlashFallbackEvent } from '../telemetry/index.js';
import type { AutoFallbackStatus } from './types.js';
import { coreEvents } from '../utils/events.js';

export async function handleFallback(
  config: Config,
  failedModel: string,
  authType?: string,
  error?: unknown,
): Promise<string | boolean | null> {
  // Applicability Checks
  if (authType !== AuthType.LOGIN_WITH_GOOGLE) return null;
  const currentAuthType = config.getContentGeneratorConfig()?.authType;
  const autoFallback = config.getAutoFallback();

  let autoFallbackStatus: AutoFallbackStatus = { status: 'not-attempted' };

  // Check auto-fallback settings
  if (currentAuthType === AuthType.LOGIN_WITH_GOOGLE && autoFallback.enabled) {
    if (
      autoFallback.type === 'gemini-api-key' &&
      process.env['GEMINI_API_KEY']
    ) {
      // Session-only switch to Gemini API key auth
      await config.refreshAuth(AuthType.USE_GEMINI);
      autoFallbackStatus = { status: 'success', authType: 'gemini-api-key' };
    } else if (
      autoFallback.type === 'vertex-ai' &&
      (process.env['GOOGLE_API_KEY'] ||
        (process.env['GOOGLE_CLOUD_PROJECT'] &&
          process.env['GOOGLE_CLOUD_LOCATION']))
    ) {
      // Session-only switch to Vertex AI auth
      await config.refreshAuth(AuthType.USE_VERTEX_AI);
      autoFallbackStatus = { status: 'success', authType: 'vertex-ai' };
    } else if (autoFallback.enabled) {
      // Auto-fallback is enabled but env vars are missing
      autoFallbackStatus = {
        status: 'missing-env-vars',
        authType: autoFallback.type,
      };
    }
  }

  const fallbackModel = DEFAULT_GEMINI_FLASH_MODEL;

  // Consult UI Handler for Intent
  const fallbackModelHandler = config.fallbackModelHandler;
  if (typeof fallbackModelHandler !== 'function') return null;

  try {
    // Pass the specific failed model and auto-fallback status to the UI handler.
    const intent = await fallbackModelHandler(
      failedModel,
      fallbackModel,
      error,
      autoFallbackStatus,
    );

    // Process Intent and Update State
    switch (intent) {
      case 'retry':
        // Activate fallback mode. The NEXT retry attempt will pick this up.
        activateFallbackMode(config, authType);
        return true; // Signal retryWithBackoff to continue.

      case 'stop':
        activateFallbackMode(config, authType);
        return false;

      case 'retry_later':
        return false;

      default:
        throw new Error(
          `Unexpected fallback intent received from fallbackModelHandler: "${intent}"`,
        );
    }
  } catch (handlerError) {
    console.error('Fallback UI handler failed:', handlerError);
    return null;
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
