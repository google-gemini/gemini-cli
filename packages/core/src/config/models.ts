/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Interface for the ModelConfigService to break circular dependencies.
 */
export interface IModelConfigService {
  getModelDefinition(modelId: string):
    | {
        tier?: string;
        family?: string;
        isPreview?: boolean;
        displayName?: string;
        features?: {
          thinking?: boolean;
          multimodalToolUse?: boolean;
        };
      }
    | undefined;
}

/**
 * Interface defining the minimal configuration required for model capability checks.
 * This helps break circular dependencies between Config and models.ts.
 */
export interface ModelCapabilityContext {
  readonly modelConfigService: IModelConfigService;
  getExperimentalDynamicModelConfiguration(): boolean;
}

export const PREVIEW_GEMINI_MODEL = 'gemini-3-pro-preview';
export const PREVIEW_GEMINI_3_1_MODEL = 'gemini-3.1-pro-preview';
export const PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL =
  'gemini-3.1-pro-preview-customtools';
export const PREVIEW_GEMINI_FLASH_MODEL = 'gemini-3-flash-preview';

// Kept for backward compatibility with internal tools (classifier, summarizer, etc.)
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-pro';
export const DEFAULT_GEMINI_FLASH_MODEL = 'gemini-2.5-flash';
export const DEFAULT_GEMINI_FLASH_LITE_MODEL = 'gemini-2.5-flash-lite';

// Progressive fallback tier list — Gemini 3 only, smartest to cheapest.
const MODEL_TIER_LIST = [
  PREVIEW_GEMINI_3_1_MODEL,
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
];

export const VALID_GEMINI_MODELS = new Set([
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_3_1_MODEL,
  PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  // Keep Gemini 2 models valid for internal tool configs
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
]);

// Legacy aliases kept for backward compatibility with other code paths
export const PREVIEW_GEMINI_MODEL_AUTO = 'auto-gemini-3';
export const DEFAULT_GEMINI_MODEL_AUTO = 'auto-gemini-2.5';

// The only user-facing alias. All other aliases resolve to auto.
export const GEMINI_MODEL_ALIAS_AUTO = 'auto';
export const GEMINI_MODEL_ALIAS_PRO = 'pro';
export const GEMINI_MODEL_ALIAS_FLASH = 'flash';
export const GEMINI_MODEL_ALIAS_FLASH_LITE = 'flash-lite';

export const VALID_ALIASES = new Set([
  GEMINI_MODEL_ALIAS_AUTO,
  GEMINI_MODEL_ALIAS_PRO,
  GEMINI_MODEL_ALIAS_FLASH,
  GEMINI_MODEL_ALIAS_FLASH_LITE,
  PREVIEW_GEMINI_MODEL_AUTO,
  DEFAULT_GEMINI_MODEL_AUTO,
]);

export const DEFAULT_GEMINI_EMBEDDING_MODEL = 'gemini-embedding-001';

// Cap the thinking at 8192 to prevent run-away thinking loops.
export const DEFAULT_THINKING_MODE = 8192;

/**
 * Resolves the requested model alias to a concrete Gemini 3 model name.
 * All aliases funnel into progressive auto mode (Gemini 3 only).
 */
export function resolveModel(
  requestedModel: string,
  useGemini3_1: boolean = false,
  useCustomToolModel: boolean = false,
  hasAccessToPreview: boolean = true,
): string {
  switch (requestedModel) {
    case GEMINI_MODEL_ALIAS_AUTO:
    case PREVIEW_GEMINI_MODEL_AUTO:
    case DEFAULT_GEMINI_MODEL_AUTO:
      return resolveProgressiveAutoModel(
        useGemini3_1,
        useCustomToolModel,
        hasAccessToPreview,
      );

    case GEMINI_MODEL_ALIAS_PRO:
      // Pro alias → best available pro model
      return useGemini3_1
        ? useCustomToolModel
          ? PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL
          : PREVIEW_GEMINI_3_1_MODEL
        : PREVIEW_GEMINI_MODEL;

    case GEMINI_MODEL_ALIAS_FLASH:
      return PREVIEW_GEMINI_FLASH_MODEL;

    case GEMINI_MODEL_ALIAS_FLASH_LITE:
      // No more flash-lite in Gemini 3; redirect to flash
      return PREVIEW_GEMINI_FLASH_MODEL;

    default:
      // Concrete model name — if it's a Gemini 2 model, redirect to auto
      if (isGemini2Model(requestedModel)) {
        return resolveProgressiveAutoModel(
          useGemini3_1,
          useCustomToolModel,
          hasAccessToPreview,
        );
      }
      return requestedModel;
  }
}

/**
 * Resolves the appropriate model based on the classifier's decision.
 */
export function resolveClassifierModel(
  requestedModel: string,
  modelAlias: string,
  useGemini3_1: boolean = false,
  useCustomToolModel: boolean = false,
  hasAccessToPreview: boolean = true,
): string {
  if (modelAlias === GEMINI_MODEL_ALIAS_FLASH) {
    return PREVIEW_GEMINI_FLASH_MODEL;
  }
  return resolveModel(
    requestedModel,
    useGemini3_1,
    useCustomToolModel,
    hasAccessToPreview,
  );
}

/**
 * Iterates through the Gemini 3 tier list and returns the first active model.
 * Falls back to gemini-3-flash-preview as the absolute floor.
 */
function resolveProgressiveAutoModel(
  useGemini3_1: boolean,
  useCustomToolModel: boolean,
  hasAccessToPreview: boolean,
): string {
  for (const model of MODEL_TIER_LIST) {
    if (
      isActiveModel(model, useGemini3_1, useCustomToolModel, hasAccessToPreview)
    ) {
      return model;
    }
  }
  // Absolute floor: Gemini 3 Flash
  return PREVIEW_GEMINI_FLASH_MODEL;
}

export function getDisplayString(
  model: string,
  config?: ModelCapabilityContext,
) {
  if (config?.getExperimentalDynamicModelConfiguration?.() === true) {
    const definition = config.modelConfigService.getModelDefinition(model);
    if (definition?.displayName) {
      return definition.displayName;
    }
  }

  switch (model) {
    case GEMINI_MODEL_ALIAS_AUTO:
    case PREVIEW_GEMINI_MODEL_AUTO:
    case DEFAULT_GEMINI_MODEL_AUTO:
      return 'Auto';
    case GEMINI_MODEL_ALIAS_PRO:
      return PREVIEW_GEMINI_MODEL;
    case GEMINI_MODEL_ALIAS_FLASH:
      return PREVIEW_GEMINI_FLASH_MODEL;
    case PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL:
      return PREVIEW_GEMINI_3_1_MODEL;
    default:
      return model;
  }
}

/**
 * Checks if the model is a preview model.
 *
 * @param model The model name to check.
 * @param config Optional config object for dynamic model configuration.
 * @returns True if the model is a preview model.
 */
export function isPreviewModel(
  model: string,
  config?: ModelCapabilityContext,
): boolean {
  if (config?.getExperimentalDynamicModelConfiguration?.() === true) {
    return (
      config.modelConfigService.getModelDefinition(model)?.isPreview === true
    );
  }

  return (
    model === PREVIEW_GEMINI_MODEL ||
    model === PREVIEW_GEMINI_3_1_MODEL ||
    model === PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL ||
    model === PREVIEW_GEMINI_FLASH_MODEL ||
    model === PREVIEW_GEMINI_MODEL_AUTO
  );
}

/**
 * Checks if the model is a Pro model.
 *
 * @param model The model name to check.
 * @param config Optional config object for dynamic model configuration.
 * @returns True if the model is a Pro model.
 */
export function isProModel(
  model: string,
  config?: ModelCapabilityContext,
): boolean {
  if (config?.getExperimentalDynamicModelConfiguration?.() === true) {
    return config.modelConfigService.getModelDefinition(model)?.tier === 'pro';
  }
  return model.toLowerCase().includes('pro');
}

/**
 * Checks if the model is a Gemini 3 model.
 *
 * @param model The model name to check.
 * @param config Optional config object for dynamic model configuration.
 * @returns True if the model is a Gemini 3 model.
 */
export function isGemini3Model(
  model: string,
  config?: ModelCapabilityContext,
): boolean {
  if (config?.getExperimentalDynamicModelConfiguration?.() === true) {
    // Legacy behavior resolves the model first.
    const resolved = resolveModel(model);
    return (
      config.modelConfigService.getModelDefinition(resolved)?.family ===
      'gemini-3'
    );
  }

  const resolved = resolveModel(model);
  return /^gemini-3(\.|-|$)/.test(resolved);
}

/**
 * Checks if the model is a Gemini 2.x model.
 */
export function isGemini2Model(model: string): boolean {
  // This is legacy behavior, will remove this when gemini 2 models are no
  // longer needed.
  return /^gemini-2(\.|$)/.test(model);
}

/**
 * Checks if the model is a "custom" model (not Gemini branded).
 *
 * @param model The model name to check.
 * @param config Optional config object for dynamic model configuration.
 * @returns True if the model is not a Gemini branded model.
 */
export function isCustomModel(
  model: string,
  config?: ModelCapabilityContext,
): boolean {
  if (config?.getExperimentalDynamicModelConfiguration?.() === true) {
    const resolved = resolveModel(model);
    return (
      config.modelConfigService.getModelDefinition(resolved)?.tier ===
        'custom' || !resolved.startsWith('gemini-')
    );
  }
  const resolved = resolveModel(model);
  return !resolved.startsWith('gemini-');
}

/**
 * Checks if the model should be treated as a modern model.
 */
export function supportsModernFeatures(model: string): boolean {
  if (isGemini3Model(model)) return true;
  return isCustomModel(model);
}

/**
 * Checks if the model is an auto model.
 *
 * @param model The model name to check.
 * @param config Optional config object for dynamic model configuration.
 * @returns True if the model is an auto model.
 */
export function isAutoModel(
  model: string,
  config?: ModelCapabilityContext,
): boolean {
  if (config?.getExperimentalDynamicModelConfiguration?.() === true) {
    return config.modelConfigService.getModelDefinition(model)?.tier === 'auto';
  }
  return (
    model === GEMINI_MODEL_ALIAS_AUTO ||
    model === PREVIEW_GEMINI_MODEL_AUTO ||
    model === DEFAULT_GEMINI_MODEL_AUTO
  );
}

/**
 * Checks if the model supports multimodal function responses.
 */
export function supportsMultimodalFunctionResponse(
  model: string,
  config?: ModelCapabilityContext,
): boolean {
  if (config?.getExperimentalDynamicModelConfiguration?.() === true) {
    return (
      config.modelConfigService.getModelDefinition(model)?.features
        ?.multimodalToolUse === true
    );
  }
  return isGemini3Model(model);
}

/**
 * Checks if the given model is considered active based on the current configuration.
 * Only Gemini 3 models participate in auto mode.
 */
export function isActiveModel(
  model: string,
  useGemini3_1: boolean = false,
  useCustomToolModel: boolean = false,
  hasAccessToPreview: boolean = true,
): boolean {
  // Gemini 2 models are never active for user-facing auto mode
  if (isGemini2Model(model)) {
    return false;
  }

  // Custom (non-Gemini) models are always active
  if (!VALID_GEMINI_MODELS.has(model) && !model.startsWith('gemini-')) {
    return true;
  }

  // Preview models require preview access
  if (!hasAccessToPreview && isPreviewModel(model)) {
    return false;
  }

  // Gemini 3.1 model gating
  if (useGemini3_1) {
    if (useCustomToolModel) {
      return model !== PREVIEW_GEMINI_3_1_MODEL;
    } else {
      return model !== PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL;
    }
  } else {
    return (
      model !== PREVIEW_GEMINI_3_1_MODEL &&
      model !== PREVIEW_GEMINI_3_1_CUSTOM_TOOLS_MODEL
    );
  }
}

/**
 * Checks if the model name is valid (either a valid model or a valid alias).
 */
export function isValidModelOrAlias(model: string): boolean {
  if (VALID_ALIASES.has(model)) {
    return true;
  }
  if (VALID_GEMINI_MODELS.has(model)) {
    return true;
  }
  // Allow custom models (non-gemini models)
  if (!model.startsWith('gemini-')) {
    return true;
  }
  return false;
}

/**
 * Gets a list of all valid model names and aliases for error messages.
 */
export function getValidModelsAndAliases(): string[] {
  return [...new Set([...VALID_ALIASES, ...VALID_GEMINI_MODELS])].sort();
}

/**
 * Returns the ordered Gemini 3 tier list for use by the fallback/policy system.
 */
export function getModelTierList(): readonly string[] {
  return MODEL_TIER_LIST;
}
