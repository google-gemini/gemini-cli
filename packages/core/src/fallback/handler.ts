/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Config } from '../config/config.js';
import { AuthType } from '../core/contentGenerator.js';
import {
  openBrowserSecurely,
  shouldLaunchBrowser,
} from '../utils/secure-browser-launcher.js';
import { debugLogger } from '../utils/debugLogger.js';
import { getErrorMessage } from '../utils/errors.js';
import type { FallbackIntent, FallbackRecommendation } from './types.js';
import { classifyFailureKind } from '../availability/errorClassification.js';
import type { ModelPolicy } from '../availability/modelPolicy.js';
import type { ModelAvailabilityService } from '../availability/modelAvailabilityService.js';
import {
  buildFallbackPolicyContext,
  resolvePolicyChain,
  resolvePolicyAction,
  applyAvailabilityTransition,
} from '../availability/policyHelpers.js';

export const UPGRADE_URL_PAGE = 'https://goo.gle/set-up-gemini-code-assist';

type ModelQuotaStatus = {
  remainingAmount?: number;
  remaining?: number;
};

export async function handleFallback(
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
    true,
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
    const quotaAvailableCandidates = await getQuotaAvailableCandidates(
      config,
      availability,
      candidates,
    );

    // If no candidates have quota, we cannot select a fallback model based on quota.
    // Return null to indicate failure to find a suitable fallback.
    if (!quotaAvailableCandidates.length) {
      debugLogger.warn('No fallback models with available quota found.');
      return null;
    }

    const selection = availability.selectFirstAvailable(
      quotaAvailableCandidates.map((policy) => policy.model),
    );

    const lastResortPolicy = quotaAvailableCandidates.find(
      (policy) => policy.isLastResort,
    );
    const selectedFallbackModel =
      selection.selectedModel ?? lastResortPolicy?.model;
    const selectedPolicy = quotaAvailableCandidates.find(
      (policy) => policy.model === selectedFallbackModel,
    );

    if (
      !selectedFallbackModel ||
      selectedFallbackModel === failedModel ||
      !selectedPolicy
    ) {
      return null;
    }

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

  const handler = config.getFallbackModelHandler();
  if (typeof handler !== 'function') {
    return null;
  }

  try {
    const intent = await handler(failedModel, fallbackModel, error);

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

async function getQuotaAvailableCandidates(
  config: Config,
  availability: ModelAvailabilityService,
  candidates: ModelPolicy[],
): Promise<ModelPolicy[]> {
  const quotaPositiveCandidates: ModelPolicy[] = [];
  const unknownQuotaCandidates: ModelPolicy[] = [];

  for (const candidatePolicy of candidates) {
    const quotaStatusFromAvailability = await getQuotaStatusFromService(
      availability,
      candidatePolicy.model,
    );
    const quotaStatus =
      quotaStatusFromAvailability ??
      config.getRemainingQuotaForModel?.(candidatePolicy.model);
    const remaining = getRemainingFromQuotaStatus(quotaStatus);

    if (remaining === undefined) {
      unknownQuotaCandidates.push(candidatePolicy);
      continue;
    }

    if (remaining > 0) {
      quotaPositiveCandidates.push(candidatePolicy);
    }
  }

  if (quotaPositiveCandidates.length > 0) {
    return quotaPositiveCandidates;
  }

  return unknownQuotaCandidates;
}

function getQuotaStatusFromService(
  availability: ModelAvailabilityService,
  model: string,
): Promise<ModelQuotaStatus | undefined> | ModelQuotaStatus | undefined {
  const getQuotaStatusValue = Reflect.get(
    availability,
    'getQuotaStatus',
  ) as unknown;
  if (typeof getQuotaStatusValue !== 'function') {
    return undefined;
  }

  const getQuotaStatusResult: unknown = getQuotaStatusValue.call(
    availability,
    model,
  );
  if (getQuotaStatusResult instanceof Promise) {
    return getQuotaStatusResult.then((value) => normalizeQuotaStatus(value));
  }

  return normalizeQuotaStatus(getQuotaStatusResult);
}

function normalizeQuotaStatus(quotaStatus: unknown): ModelQuotaStatus {
  if (!quotaStatus || typeof quotaStatus !== 'object') {
    return undefined;
  }

  const remaining = quotaStatus as {
    remaining?: number;
    remainingAmount?: number;
  };
  if (
    remaining.remainingAmount === undefined &&
    remaining.remaining === undefined
  ) {
    return undefined;
  }

  return remaining;
}

function getRemainingFromQuotaStatus(
  quotaStatus:
    | {
        remainingAmount?: number;
        remaining?: number;
      }
    | undefined,
): number | undefined {
  return quotaStatus?.remainingAmount ?? quotaStatus?.remaining;
}

async function handleUpgrade() {
  if (!shouldLaunchBrowser()) {
    debugLogger.log(
      `Cannot open browser in this environment. Please visit: ${UPGRADE_URL_PAGE}`,
    );
    return;
  }
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
      config.activateFallbackMode(fallbackModel);
      return true;

    case 'retry_once':
      // For distinct retry (retry_once), we do NOT set the active model permanently.
      // The FallbackStrategy will handle routing to the available model for this turn
      // based on the availability service state (which is updated before this).
      return true;

    case 'retry_with_credits':
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
