/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GenerateContentConfig } from '@google/genai';
import type { Config } from '../config/config.js';
import type {
  FailureKind,
  FallbackAction,
  ModelPolicy,
  ModelPolicyChain,
  RetryAvailabilityContext,
} from './modelPolicy.js';
import { createDefaultPolicy, getModelPolicyChain } from './policyCatalog.js';
import { DEFAULT_GEMINI_MODEL, getEffectiveModel } from '../config/models.js';
import type { ModelSelectionResult } from './modelAvailabilityService.js';

/**
 * Resolves the active policy chain for the given config, ensuring the
 * user-selected active model is represented.
 */
export function resolvePolicyChain(
  config: Config,
  preferredModel?: string,
): ModelPolicyChain {
  const chain = getModelPolicyChain({
    previewEnabled: !!config.getPreviewFeatures(),
    userTier: config.getUserTier(),
  });
  // TODO: This will be replaced when we get rid of Fallback Modes.
  // Switch to getActiveModel()
  const activeModel =
    preferredModel ??
    getEffectiveModel(
      config.isInFallbackMode(),
      config.getModel(),
      config.getPreviewFeatures(),
    );

  if (activeModel === 'auto') {
    return [...chain];
  }

  if (chain.some((policy) => policy.model === activeModel)) {
    return [...chain];
  }

  // If the user specified a model not in the default chain, we assume they want
  // *only* that model. We do not fallback to the default chain.
  return [createDefaultPolicy(activeModel, { isLastResort: true })];
}

/**
 * Produces the failed policy (if it exists in the chain) and the list of
 * fallback candidates that follow it.
 */
export function buildFallbackPolicyContext(
  chain: ModelPolicyChain,
  failedModel: string,
): {
  failedPolicy?: ModelPolicy;
  candidates: ModelPolicy[];
} {
  const index = chain.findIndex((policy) => policy.model === failedModel);
  if (index === -1) {
    return { failedPolicy: undefined, candidates: chain };
  }
  // Return [candidates_after, candidates_before] to prioritize downgrades
  // (continuing the chain) before wrapping around to upgrades.
  return {
    failedPolicy: chain[index],
    candidates: [...chain.slice(index + 1), ...chain.slice(0, index)],
  };
}

export function resolvePolicyAction(
  failureKind: FailureKind,
  policy: ModelPolicy,
): FallbackAction {
  return policy.actions?.[failureKind] ?? 'prompt';
}

/**
 * Creates a context provider for retry logic that returns the availability
 * sevice and resolves the current model's policy.
 *
 * @param modelGetter A function that returns the model ID currently being attempted.
 *        (Allows handling dynamic model changes during retries).
 */
export function createAvailabilityContextProvider(
  config: Config,
  modelGetter: () => string,
): () => RetryAvailabilityContext | undefined {
  return () => {
    if (!config.isModelAvailabilityServiceEnabled()) {
      return undefined;
    }
    const service = config.getModelAvailabilityService();
    const currentModel = modelGetter();

    // Resolve the chain for the specific model we are attempting.
    const chain = resolvePolicyChain(config, currentModel);
    const policy = chain.find((p) => p.model === currentModel);

    return policy ? { service, policy } : undefined;
  };
}

/**
 * Selects the model to use for an attempt via the availability service and
 * returns the selection context.
 */
export function selectModelForAvailability(
  config: Config,
  requestedModel: string,
): ModelSelectionResult | undefined {
  if (!config.isModelAvailabilityServiceEnabled()) {
    return undefined;
  }

  const chain = resolvePolicyChain(config, requestedModel);
  const selection = config
    .getModelAvailabilityService()
    .selectFirstAvailable(chain.map((p) => p.model));

  if (selection.selectedModel) return selection;

  const backupModel =
    chain.find((p) => p.isLastResort)?.model ?? DEFAULT_GEMINI_MODEL;

  return { selectedModel: backupModel, skipped: [] };
}

/**
 * Applies the model availability selection logic, including side effects
 * (setting active model, consuming sticky attempts) and config updates.
 */
export function applyModelSelection(
  config: Config,
  requestedModel: string,
  currentConfig?: GenerateContentConfig,
  overrideScope?: string,
  options: { consumeAttempt?: boolean } = {},
): { model: string; config?: GenerateContentConfig; maxAttempts?: number } {
  const selection = selectModelForAvailability(config, requestedModel);

  if (!selection?.selectedModel) {
    return { model: requestedModel, config: currentConfig };
  }

  const finalModel = selection.selectedModel;
  let finalConfig = currentConfig;

  // If model changed, re-resolve config
  if (finalModel !== requestedModel) {
    const { generateContentConfig } =
      config.modelConfigService.getResolvedConfig({
        overrideScope,
        model: finalModel,
      });

    finalConfig = currentConfig
      ? { ...currentConfig, ...generateContentConfig }
      : generateContentConfig;
  }

  config.setActiveModel(finalModel);

  if (selection.attempts && options.consumeAttempt !== false) {
    config.getModelAvailabilityService().consumeStickyAttempt(finalModel);
  }

  return {
    model: finalModel,
    config: finalConfig,
    maxAttempts: selection.attempts,
  };
}

export function applyAvailabilityTransition(
  getContext: (() => RetryAvailabilityContext | undefined) | undefined,
  failureKind: FailureKind,
): void {
  const context = getContext?.();
  if (!context) return;

  const transition = context.policy.stateTransitions?.[failureKind];
  if (!transition) return;

  if (transition === 'terminal') {
    context.service.markTerminal(
      context.policy.model,
      failureKind === 'terminal' ? 'quota' : 'capacity',
    );
  } else if (transition === 'sticky_retry') {
    context.service.markRetryOncePerTurn(context.policy.model);
  }
}
