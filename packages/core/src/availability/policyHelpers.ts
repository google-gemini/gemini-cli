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
import {
  createDefaultPolicy,
  createSingleModelChain,
  getModelPolicyChain,
} from './policyCatalog.js';
import {
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  PREVIEW_GEMINI_MODEL_AUTO,
  resolveModel,
} from '../config/models.js';
import type { ModelSelectionResult } from './modelAvailabilityService.js';
import type { ModelConfigKey } from '../services/modelConfigService.js';

/**
 * Resolves the active policy chain for the given config, ensuring the
 * user-selected active model is represented.
 */
export function resolvePolicyChain(
  config: Config,
  preferredModel?: string,
  wrapsAround: boolean = false,
): ModelPolicyChain {
  const modelFromConfig =
    preferredModel ?? config.getActiveModel?.() ?? config.getModel();

  let chain;

  if (
    config.getModel() === PREVIEW_GEMINI_MODEL_AUTO ||
    config.getModel() === DEFAULT_GEMINI_MODEL_AUTO
  ) {
    chain = getModelPolicyChain({
      previewEnabled: config.getModel() === PREVIEW_GEMINI_MODEL_AUTO,
      userTier: config.getUserTier(),
    });
  } else {
    chain = createSingleModelChain(modelFromConfig);
  }

  const activeModel = resolveModel(modelFromConfig);

  const activeIndex = chain.findIndex((policy) => policy.model === activeModel);
  if (activeIndex !== -1) {
    return wrapsAround
      ? [...chain.slice(activeIndex), ...chain.slice(0, activeIndex)]
      : [...chain.slice(activeIndex)];
  }

  // If the user specified a model not in the default chain, we assume they want
  // *only* that model. We do not fallback to the default chain.
  return [createDefaultPolicy(activeModel, { isLastResort: true })];
}

/**
 * Produces the failed policy (if it exists in the chain) and the list of
 * fallback candidates that follow it.
 * @param chain - The ordered list of available model policies.
 * @param failedModel - The identifier of the model that failed.
 * @param wrapsAround - If true, treats the chain as a circular buffer.
 */
export function buildFallbackPolicyContext(
  chain: ModelPolicyChain,
  failedModel: string,
  wrapsAround: boolean = false,
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
  const candidates = wrapsAround
    ? [...chain.slice(index + 1), ...chain.slice(0, index)]
    : [...chain.slice(index + 1)];
  return {
    failedPolicy: chain[index],
    candidates,
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
): ModelSelectionResult {
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
  modelConfigKey: ModelConfigKey,
  options: { consumeAttempt?: boolean } = {},
): { model: string; config: GenerateContentConfig; maxAttempts?: number } {
  const resolved = config.modelConfigService.getResolvedConfig(modelConfigKey);
  const model = resolved.model;
  const selection = selectModelForAvailability(config, model);

  if (!selection) {
    return { model, config: resolved.generateContentConfig };
  }

  const finalModel = selection.selectedModel ?? model;
  let generateContentConfig = resolved.generateContentConfig;

  if (finalModel !== model) {
    const fallbackResolved = config.modelConfigService.getResolvedConfig({
      ...modelConfigKey,
      model: finalModel,
    });
    generateContentConfig = fallbackResolved.generateContentConfig;
  }

  config.setActiveModel(finalModel);

  if (selection.attempts && options.consumeAttempt !== false) {
    config.getModelAvailabilityService().consumeStickyAttempt(finalModel);
  }

  return {
    model: finalModel,
    config: generateContentConfig,
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
