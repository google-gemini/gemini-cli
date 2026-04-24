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
  getFlashLitePolicyChain,
  SILENT_ACTIONS,
} from './policyCatalog.js';
import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
  GEMINI_MODEL_ALIAS_AUTO,
  isAutoModel,
  isGemini3Model,
  resolveModel,
} from '../config/models.js';
import type { ModelSelectionResult } from './modelAvailabilityService.js';
import type { ModelConfigKey } from '../services/modelConfigService.js';
import { ApprovalMode } from '../policy/types.js';

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
  const configuredModel = config.getModel();

  let chain: ModelPolicyChain | undefined;
  const useGemini31 = config.getGemini31LaunchedSync?.() ?? false;
  const useGemini31FlashLite =
    config.getGemini31FlashLiteLaunchedSync?.() ?? false;
  const useCustomToolModel = config.getUseCustomToolModelSync?.() ?? false;
  const hasAccessToPreview = config.getHasAccessToPreviewModel?.() ?? true;

  const resolvedModel = resolveModel(
    modelFromConfig,
    useGemini31,
    useGemini31FlashLite,
    useCustomToolModel,
    hasAccessToPreview,
    config,
  );
  const isAutoPreferred = preferredModel
    ? isAutoModel(preferredModel, config)
    : false;
  const isAutoConfigured = isAutoModel(configuredModel, config);

  // Auto-mode should always allow circular fallback (wrapsAround) to ensure
  // that we try every available model in the tiered chain before giving up.
  const shouldWrapAround = wrapsAround || isAutoModel(modelFromConfig, config);

  // --- DYNAMIC PATH ---
  if (config.getExperimentalDynamicModelConfiguration?.() === true) {
    const context = {
      useGemini3_1: useGemini31,
      useGemini3_1FlashLite: useGemini31FlashLite,
      useCustomTools: useCustomToolModel,
    };

    if (resolvedModel === DEFAULT_GEMINI_FLASH_LITE_MODEL) {
      chain = config.modelConfigService.resolveChain('lite', context);
    } else if (
      isGemini3Model(resolvedModel, config) ||
      isAutoModel(preferredModel ?? '', config) ||
      isAutoModel(configuredModel, config)
    ) {
      // 1. Try to find a chain specifically for the current configured alias
      if (
        isAutoModel(configuredModel, config) &&
        config.modelConfigService.getModelChain(configuredModel)
      ) {
        chain = config.modelConfigService.resolveChain(
          configuredModel,
          context,
        );
      }
      // 2. Fallback to family-based auto-routing
      if (!chain) {
        const previewEnabled =
          hasAccessToPreview &&
          (isGemini3Model(resolvedModel, config) ||
            preferredModel === PREVIEW_GEMINI_MODEL_AUTO ||
            configuredModel === PREVIEW_GEMINI_MODEL_AUTO ||
            configuredModel === GEMINI_MODEL_ALIAS_AUTO);
        const chainKey = previewEnabled ? 'preview' : 'default';
        chain = config.modelConfigService.resolveChain(chainKey, context);
      }
    }
    if (!chain) {
      // No matching modelChains found, default to single model chain
      chain = createSingleModelChain(modelFromConfig);
    }
    chain = applyDynamicSlicing(chain, resolvedModel, shouldWrapAround);
  } else {
    // --- LEGACY PATH ---

    if (resolvedModel === DEFAULT_GEMINI_FLASH_LITE_MODEL) {
      chain = getFlashLitePolicyChain();
    } else if (
      isGemini3Model(resolvedModel, config) ||
      isAutoPreferred ||
      isAutoConfigured
    ) {
      const previewEnabled =
        hasAccessToPreview &&
        (isGemini3Model(resolvedModel, config) ||
          preferredModel === PREVIEW_GEMINI_MODEL_AUTO ||
          configuredModel === PREVIEW_GEMINI_MODEL_AUTO ||
          configuredModel === GEMINI_MODEL_ALIAS_AUTO);
      chain = getModelPolicyChain({
        previewEnabled,
        userTier: config.getUserTier(),
        useGemini31,
        useGemini31FlashLite,
        useCustomToolModel,
      });
    } else {
      chain = createSingleModelChain(modelFromConfig);
    }
    chain = applyDynamicSlicing(chain, resolvedModel, shouldWrapAround);
  }

  // --- RESILIENCE INJECTION (QUOTA FAILOVER) ---
  // In Auto mode, if we have Pro and Flash in the chain, but Flash is exhausted,
  // we dynamically replace Flash with Flash Lite. This keeps chain length identical
  // (preserving test compatibility) while fixing the quota bug.
  // Defensive check for tests where getModelAvailabilityService might be missing.
  if (
    (isAutoPreferred || isAutoConfigured) &&
    typeof config.getModelAvailabilityService === 'function'
  ) {
    const availabilityService = config.getModelAvailabilityService();
    const flashModel = resolveModel(
      'flash',
      useGemini31,
      useGemini31FlashLite,
      useCustomToolModel,
      hasAccessToPreview,
      config,
    );
    const liteModel = resolveModel(
      'flash-lite',
      useGemini31,
      useGemini31FlashLite,
      useCustomToolModel,
      hasAccessToPreview,
      config,
    );

    // If Flash is in the chain and exhausted, replace it with Lite.
    const flashIndex = chain.findIndex((p) => p.model === flashModel);
    if (
      flashIndex !== -1 &&
      availabilityService.snapshot(flashModel)?.available === false
    ) {
      if (!chain.some((p) => p.model === liteModel)) {
        // Replace Flash with Lite to maintain length 2
        chain[flashIndex].model = liteModel;
      }
    }
  }

  // Apply Unified Silent Injection for Plan Mode with defensive checks
  if (config?.getApprovalMode?.() === ApprovalMode.PLAN) {
    return chain.map((policy) => ({
      ...policy,
      actions: { ...SILENT_ACTIONS },
    }));
  }

  return chain;
}

/**
 * Applies active-index slicing and wrap-around logic to a chain template.
 */
function applyDynamicSlicing(
  chain: ModelPolicy[],
  resolvedModel: string,
  wrapsAround: boolean,
): ModelPolicyChain {
  const activeIndex = chain.findIndex(
    (policy) => policy.model === resolvedModel,
  );
  if (activeIndex !== -1) {
    return wrapsAround
      ? [...chain.slice(activeIndex), ...chain.slice(0, activeIndex)]
      : [...chain.slice(activeIndex)];
  }

  // If the user specified a model not in the default chain, we assume they want
  // *only* that model. We do not fallback to the default chain.
  return [createDefaultPolicy(resolvedModel, { isLastResort: true })];
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

  if (modelConfigKey.isChatModel) {
    config.setActiveModel(finalModel);
  }

  if (selection.attempts && options.consumeAttempt !== false) {
    config.getModelAvailabilityService().consumeStickyAttempt(finalModel);
  }

  return {
    model: finalModel,
    config: generateContentConfig,
    maxAttempts: selection.attempts,
  };
}

export function resolvePolicyActionLegacy(
  failureKind: FailureKind,
  policy: ModelPolicy,
): FallbackAction {
  return policy.actions?.[failureKind] ?? 'prompt';
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
