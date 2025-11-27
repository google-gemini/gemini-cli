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
import {
  RetryableQuotaError,
  TerminalQuotaError,
} from '../utils/googleQuotaErrors.js';
import type { FallbackIntent, FallbackRecommendation } from './types.js';
import type { FailureKind } from '../availability/modelPolicy.js';
import {
  buildFallbackPolicyContext,
  resolvePolicyChain,
  resolvePolicyAction,
} from '../availability/policyHelpers.js';

const UPGRADE_URL_PAGE = 'https://goo.gle/set-up-gemini-code-assist';

export async function handleFallback(
  config: Config,
  failedModel: string,
  authType?: string,
  error?: unknown,
): Promise<string | boolean | null> {
  if (config.isModelAvailabilityServiceEnabled()) {
    return handlePolicyDrivenFallback(config, failedModel, authType, error);
  }
  return legacyHandleFallback(config, failedModel, authType, error);
}

/**
 * Old fallback logic relying on hard coded strings
 */
async function legacyHandleFallback(
  config: Config,
  failedModel: string,
  authType?: string,
  error?: unknown,
): Promise<string | boolean | null> {
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
    return await processIntent(
      config,
      intent,
      failedModel,
      fallbackModel,
      authType,
      error,
    );
  } catch (handlerError) {
    console.error('Fallback UI handler failed:', handlerError);
    return null;
  }
}

/**
 * New fallback logic using the ModelAvailabilityService
 */
async function handlePolicyDrivenFallback(
  config: Config,
  failedModel: string,
  authType?: string,
  error?: unknown,
): Promise<string | boolean | null> {
  if (authType !== AuthType.LOGIN_WITH_GOOGLE) {
    return null;
  }

  const chain = resolvePolicyChain(config);
  const { failedPolicy, candidates } = buildFallbackPolicyContext(
    chain,
    failedModel,
  );
  if (!candidates.length) {
    return null;
  }

  const availability = config.getModelAvailabilityService();
  const selection = availability.selectFirstAvailable(
    candidates.map((policy) => policy.model),
  );

  let lastResortPolicy = candidates.find((policy) => policy.isLastResort);
  if (!lastResortPolicy) {
    debugLogger.warn(
      'No isLastResort policy found in candidates, using last candidate as fallback.',
    );
    lastResortPolicy = candidates[candidates.length - 1];
  }

  const fallbackModel = selection.selectedModel ?? lastResortPolicy.model;
  const selectedPolicy =
    candidates.find((policy) => policy.model === fallbackModel) ??
    lastResortPolicy;

  if (!fallbackModel || fallbackModel === failedModel) {
    return null;
  }

  const failureKind = classifyFailureKind(error);
  const action = resolvePolicyAction(failureKind, selectedPolicy);

  if (action === 'silent') {
    return processIntent(
      config,
      'retry_always',
      failedModel,
      fallbackModel,
      authType,
      error,
    );
  }

  // This will be used in the future when FallbackRecommendation is passed through UI
  const recommendation: FallbackRecommendation = {
    ...selection,
    selectedModel: fallbackModel,
    action,
    failureKind,
    failedPolicy,
    selectedPolicy,
  };
  void recommendation;

  const handler = config.getFallbackModelHandler();
  if (typeof handler !== 'function') {
    return null;
  }

  try {
    const intent = await handler(failedModel, fallbackModel, error);
    return await processIntent(
      config,
      intent,
      failedModel,
      fallbackModel,
      authType,
    );
  } catch (handlerError) {
    debugLogger.error('Fallback handler failed:', handlerError);
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

async function processIntent(
  config: Config,
  intent: FallbackIntent | null,
  failedModel: string,
  fallbackModel: string,
  authType?: string,
  error?: unknown,
): Promise<boolean> {
  switch (intent) {
    case 'retry_always':
      // If the error is non-retryable, e.g. TerminalQuota Error, trigger a regular fallback to flash.
      // For all other errors, activate previewModel fallback.
      if (
        failedModel === PREVIEW_GEMINI_MODEL &&
        !(error instanceof TerminalQuotaError)
      ) {
        activatePreviewModelFallbackMode(config);
      } else {
        activateFallbackMode(config, authType);
      }
      return true;

    case 'retry_once':
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

function classifyFailureKind(error?: unknown): FailureKind {
  if (error instanceof TerminalQuotaError) {
    return 'terminal';
  }
  if (error instanceof RetryableQuotaError) {
    return 'transient';
  }
  if (error instanceof ModelNotFoundError) {
    return 'not_found';
  }
  return 'unknown';
}
