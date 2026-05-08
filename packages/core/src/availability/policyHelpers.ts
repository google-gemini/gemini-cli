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
  getFlash3UtilityChain,
  getFlash25UtilityChain,
  SILENT_ACTIONS,
} from './policyCatalog.js';
import {
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  PREVIEW_GEMINI_MODEL_AUTO,
  isAutoModel,
  isGemini3Model,
  resolveModel,
} from '../config/models.js';
import type { ModelSelectionResult } from './modelAvailabilityService.js';
import type { ModelConfigKey } from '../services/modelConfigService.js';
import { ApprovalMode } from '../policy/types.js';

export interface ResolvePolicyChainOptions {
  wrapsAround?: boolean;
  /**
   * When true, builds a silent downgrade chain suitable for internal background
   * tasks (utility models). These chains step through Flash → Flash 2.5 →
   * Flash Lite without user prompts, since utility tasks tolerate lower-tier
   * models and should never block the interactive UI.
   *
   * Derived automatically by `applyModelSelection` from `ModelConfigKey.isChatModel`.
   * Chat callers MUST set `isChatModel: true`; omitting it is treated as utility.
   */
  isUtility?: boolean;
}

/**
 * Resolves the active policy chain for the given config, ensuring the
 * user-selected active model is represented.
 */
export function resolvePolicyChain(
  config: Config,
  preferredModel?: string,
  { wrapsAround = false, isUtility = false }: ResolvePolicyChainOptions = {},
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

  // Auto mode must always wrap chains so fallback candidates remain available
  // when the router resolves to a non-primary model (e.g. Flash). Without this,
  // applyDynamicSlicing reduces the chain to a single element and there is
  // nowhere to fall back to when that model hits its quota.
  const shouldWrapAround = wrapsAround || isAutoPreferred || isAutoConfigured;

  // --- UTILITY PATH ---
  // Internal background tasks (utility models) use a dedicated silent downgrade
  // chain: Flash3 → Flash2.5 → FlashLite. This avoids blocking the interactive
  // UI with prompts and provides two quota pool alternatives before giving up.
  if (isUtility) {
    if (config.getExperimentalDynamicModelConfiguration?.() === true) {
      const context = {
        useGemini3_1: useGemini31,
        useGemini3_1FlashLite: useGemini31FlashLite,
        useCustomTools: useCustomToolModel,
      };
      const utilityChainKey =
        resolvedModel === DEFAULT_GEMINI_FLASH_LITE_MODEL
          ? 'lite'
          : resolvedModel === PREVIEW_GEMINI_FLASH_MODEL
            ? 'flash3-utility'
            : resolvedModel === DEFAULT_GEMINI_FLASH_MODEL
              ? 'flash25-utility'
              : undefined;
      if (utilityChainKey) {
        return (
          config.modelConfigService.resolveChain(utilityChainKey, context) ??
          createSingleModelChain(resolvedModel)
        );
      }
    } else {
      if (resolvedModel === DEFAULT_GEMINI_FLASH_LITE_MODEL) {
        return getFlashLitePolicyChain();
      }
      if (resolvedModel === PREVIEW_GEMINI_FLASH_MODEL) {
        return getFlash3UtilityChain();
      }
      if (resolvedModel === DEFAULT_GEMINI_FLASH_MODEL) {
        return getFlash25UtilityChain();
      }
    }
    return createSingleModelChain(resolvedModel);
  }

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
      isAutoPreferred ||
      isAutoConfigured
    ) {
      // 1. Try to find a chain specifically for the current configured alias
      if (
        isAutoConfigured &&
        config.modelConfigService.getModelChain(configuredModel)
      ) {
        chain = config.modelConfigService.resolveChain(
          configuredModel,
          context,
        );
      }
      // 2. Fallback to family-based auto-routing
      if (!chain) {
        const isAutoSelection = isAutoPreferred || isAutoConfigured;
        const previewEnabled =
          hasAccessToPreview &&
          (isGemini3Model(resolvedModel, config) ||
            preferredModel === PREVIEW_GEMINI_MODEL_AUTO ||
            configuredModel === PREVIEW_GEMINI_MODEL_AUTO);
        const autoPrefix = isAutoSelection ? 'auto-' : '';
        const chainKey = previewEnabled ? 'preview' : 'default';
        chain = config.modelConfigService.resolveChain(
          `${autoPrefix}${chainKey}`,
          context,
        );
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
      const isAutoSelection = isAutoPreferred || isAutoConfigured;
      if (hasAccessToPreview) {
        const previewEnabled =
          isGemini3Model(resolvedModel, config) ||
          preferredModel === PREVIEW_GEMINI_MODEL_AUTO ||
          configuredModel === PREVIEW_GEMINI_MODEL_AUTO;
        chain = getModelPolicyChain({
          previewEnabled,
          isAutoSelection,
          userTier: config.getUserTier(),
          useGemini31,
          useGemini31FlashLite,
          useCustomToolModel,
        });
      } else {
        // User requested Gemini 3 but has no access. Proactively downgrade
        // to the stable Gemini 2.5 chain.
        chain = getModelPolicyChain({
          previewEnabled: false,
          isAutoSelection,
          userTier: config.getUserTier(),
          useGemini31,
          useGemini31FlashLite,
          useCustomToolModel,
        });
      }
    } else {
      chain = createSingleModelChain(modelFromConfig);
    }
    chain = applyDynamicSlicing(chain, resolvedModel, shouldWrapAround);
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
  isUtility: boolean = false,
): ModelSelectionResult {
  const chain = resolvePolicyChain(config, requestedModel, { isUtility });
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
 *
 * IMPORTANT: `modelConfigKey.isChatModel` MUST be set to `true` for
 * interactive chat callers. Any key without `isChatModel: true` is treated
 * as a utility model and routed through a silent downgrade chain (Flash →
 * Flash 2.5 → Flash Lite) that never prompts the user.
 */
export function applyModelSelection(
  config: Config,
  modelConfigKey: ModelConfigKey,
  options: { consumeAttempt?: boolean } = {},
): { model: string; config: GenerateContentConfig; maxAttempts?: number } {
  const resolved = config.modelConfigService.getResolvedConfig(modelConfigKey);
  const model = resolved.model;
  const isUtility = !modelConfigKey.isChatModel;
  const selection = selectModelForAvailability(config, model, isUtility);

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

  const chain = resolvePolicyChain(config, finalModel, { isUtility });
  const policy = chain.find((p) => p.model === finalModel);

  return {
    model: finalModel,
    config: generateContentConfig,
    maxAttempts: selection.attempts ?? policy?.maxAttempts,
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
    context.service.markRetryOncePerTurn(
      context.policy.model,
      context.policy.maxAttempts,
    );
    context.service.consumeStickyAttempt(context.policy.model);
  }
}
