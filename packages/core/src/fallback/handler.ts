/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { AuthType } from '../core/contentGenerator.js';
import { openBrowserSecurely } from '../utils/secure-browser-launcher.js';
import { debugLogger } from '../utils/debugLogger.js';
import { getErrorMessage } from '../utils/errors.js';
import type {
  AutoFallbackStatus,
  FallbackIntent,
  FallbackRecommendation,
} from './types.js';
import { classifyFailureKind } from '../availability/errorClassification.js';
import {
  buildFallbackPolicyContext,
  resolvePolicyChain,
  resolvePolicyAction,
  applyAvailabilityTransition,
} from '../availability/policyHelpers.js';

const UPGRADE_URL_PAGE = 'https://goo.gle/set-up-gemini-code-assist';

export async function handleFallback(
  config: Config,
  failedModel: string,
  authType?: string,
  error?: unknown,
): Promise<string | boolean | null> {
  if (authType !== AuthType.LOGIN_WITH_GOOGLE) {
    return null;
  }

  // Check for automatic auth fallback when quota is hit
  const autoFallback = config.getAutoFallback();
  let autoFallbackStatus: AutoFallbackStatus = { status: 'not-attempted' };

  if (autoFallback.enabled) {
    const hasGeminiApiKey = Boolean(process.env['GEMINI_API_KEY']);
    const hasVertexAI = Boolean(
      process.env['GOOGLE_API_KEY'] ||
        (process.env['GOOGLE_CLOUD_PROJECT'] &&
          process.env['GOOGLE_CLOUD_LOCATION']),
    );

    if (autoFallback.type === 'gemini-api-key') {
      if (hasGeminiApiKey) {
        try {
          await config.refreshAuth(AuthType.USE_GEMINI);
          autoFallbackStatus = {
            status: 'success',
            authType: 'gemini-api-key',
          };
        } catch (e) {
          debugLogger.warn('Auto-fallback to Gemini API key failed:', e);
          autoFallbackStatus = { status: 'not-attempted' };
        }
      } else {
        autoFallbackStatus = {
          status: 'missing-env-vars',
          authType: 'gemini-api-key',
        };
      }
    } else if (autoFallback.type === 'vertex-ai') {
      if (hasVertexAI) {
        try {
          await config.refreshAuth(AuthType.USE_VERTEX_AI);
          autoFallbackStatus = { status: 'success', authType: 'vertex-ai' };
        } catch (e) {
          debugLogger.warn('Auto-fallback to Vertex AI failed:', e);
          autoFallbackStatus = { status: 'not-attempted' };
        }
      } else {
        autoFallbackStatus = {
          status: 'missing-env-vars',
          authType: 'vertex-ai',
        };
      }
    }
  }

  const chain = resolvePolicyChain(config);
  const { failedPolicy, candidates } = buildFallbackPolicyContext(
    chain,
    failedModel,
  );

  const failureKind = classifyFailureKind(error);
  const availability = config.getModelAvailabilityService();
  const getAvailabilityContext = () => {
    if (!failedPolicy) return undefined;
    return { service: availability, policy: failedPolicy };
  };

  let fallbackModel: string;
  if (!candidates.length) {
    fallbackModel = failedModel;
  } else {
    const selection = availability.selectFirstAvailable(
      candidates.map((policy) => policy.model),
    );

    const lastResortPolicy = candidates.find((policy) => policy.isLastResort);
    const selectedFallbackModel =
      selection.selectedModel ?? lastResortPolicy?.model;
    const selectedPolicy = candidates.find(
      (policy) => policy.model === selectedFallbackModel,
    );

    if (
      !selectedFallbackModel ||
      selectedFallbackModel === failedModel ||
      !selectedPolicy
    ) {
      // If auto-fallback to a different auth succeeded, still call the handler
      // to show the success message and trigger retry with the same model.
      if (autoFallbackStatus.status === 'success') {
        fallbackModel = failedModel;
      } else {
        return null;
      }
    } else {
      fallbackModel = selectedFallbackModel;

      // failureKind is already declared and calculated above
      const action = resolvePolicyAction(failureKind, selectedPolicy);

      if (action === 'silent') {
        applyAvailabilityTransition(getAvailabilityContext, failureKind);
        return processIntent(config, 'retry_always', fallbackModel);
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
    }
  }

  const handler = config.getFallbackModelHandler();
  if (typeof handler !== 'function') {
    return null;
  }

  try {
    const intent = await handler(
      failedModel,
      fallbackModel,
      error,
      autoFallbackStatus,
    );

    // If the user chose to switch/retry, we apply the availability transition
    // to the failed model (e.g. marking it terminal if it had a quota error).
    // We DO NOT apply it if the user chose 'stop' or 'retry_later', allowing
    // them to try again later with the same model state.
    if (intent === 'retry_always' || intent === 'retry_once') {
      applyAvailabilityTransition(getAvailabilityContext, failureKind);
    }

    return await processIntent(config, intent, fallbackModel);
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
  fallbackModel: string,
): Promise<boolean> {
  switch (intent) {
    case 'retry_always':
      // TODO(telemetry): Implement generic fallback event logging. Existing
      // logFlashFallback is specific to a single Model.
      config.setActiveModel(fallbackModel);
      return true;

    case 'retry_once':
      // For distinct retry (retry_once), we do NOT set the active model permanently.
      // The FallbackStrategy will handle routing to the available model for this turn
      // based on the availability service state (which is updated before this).
      return true;

    case 'stop':
      // Do not switch model on stop. User wants to stay on current model (and stop).
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
