/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GenerateContentConfig } from '@google/genai';
import type { ModelPolicy } from '../availability/modelPolicy.js';

// The primary key for the ModelConfig is the model string. However, we also
// support a secondary key to limit the override scope, typically an agent name.
export interface ModelConfigKey {
  model: string;

  // In many cases the model (or model config alias) is sufficient to fully
  // scope an override. However, in some cases, we want additional scoping of
  // an override. Consider the case of developing a new subagent, perhaps we
  // want to override the temperature for all model calls made by this subagent.
  // However, we most certainly do not want to change the temperature for other
  // subagents, nor do we want to introduce a whole new set of aliases just for
  // the new subagent. Using the `overrideScope` we can limit our overrides to
  // model calls made by this specific subagent, and no others, while still
  // ensuring model configs are fully orthogonal to the agents who use them.
  overrideScope?: string;

  // Indicates whether this configuration request is happening during a retry attempt.
  // This allows overrides to specify different settings (e.g., higher temperature)
  // specifically for retry scenarios.
  isRetry?: boolean;

  // Indicates whether this request originates from the primary interactive chat model.
  // Enables the default fallback configuration to `chat-base` when unknown.
  isChatModel?: boolean;
}

export interface ModelConfig {
  model?: string;
  generateContentConfig?: GenerateContentConfig;
}

export interface ModelConfigOverride {
  match: {
    model?: string; // Can be a model name or an alias
    overrideScope?: string;
    isRetry?: boolean;
  };
  modelConfig: ModelConfig;
}

export interface ModelConfigAlias {
  extends?: string;
  modelConfig: ModelConfig;
}

// A model definition is a mapping from a model name to a list of features
// that the model supports. Model names can be either direct model IDs
// (gemini-2.5-pro) or aliases (auto).
export interface ModelDefinition {
  displayName?: string;
  tier?: string; // 'pro' | 'flash' | 'flash-lite' | 'custom' | 'auto'
  family?: string; // The gemini family, e.g. 'gemini-3' | 'gemini-2'
  isPreview?: boolean;
  // Specifies whether the model should be visible in the dialog.
  isVisible?: boolean;
  /** A short description of the model for the dialog. */
  dialogDescription?: string;
  features?: {
    // Whether the model supports thinking.
    thinking?: boolean;
    // Whether the model supports mutlimodal function responses. This is
    // supported in Gemini 3.
    multimodalToolUse?: boolean;
  };
}

// A model resolution is a mapping from a model name to a list of conditions
// that can be used to resolve the model to a model ID.
export interface ModelResolution {
  // The default model ID to use when no conditions are met.
  default: string;
  // A list of conditions that can be used to resolve the model.
  contexts?: Array<{
    // The condition to check for.
    condition: ResolutionCondition;
    // The model ID to use when the condition is met.
    target: string;
  }>;
}

/** The actual state of the current session. */
export interface ResolutionContext {
  useGemini3_1?: boolean;
  useGemini3_1FlashLite?: boolean;
  useCustomTools?: boolean;
  hasAccessToPreview?: boolean;
  requestedModel?: string;
}

/** The requirements defined in the registry. */
export interface ResolutionCondition {
  useGemini3_1?: boolean;
  useGemini3_1FlashLite?: boolean;
  useCustomTools?: boolean;
  hasAccessToPreview?: boolean;
  /** Matches if the current model is in this list. */
  requestedModels?: string[];
}

export interface ModelConfigServiceConfig {
  aliases?: Record<string, ModelConfigAlias>;
  customAliases?: Record<string, ModelConfigAlias>;
  overrides?: ModelConfigOverride[];
  customOverrides?: ModelConfigOverride[];
  modelDefinitions?: Record<string, ModelDefinition>;
  modelIdResolutions?: Record<string, ModelResolution>;
  classifierIdResolutions?: Record<string, ModelResolution>;
  modelChains?: Record<string, ModelPolicy[]>;
}

const MAX_ALIAS_CHAIN_DEPTH = 100;

export type ResolvedModelConfig = _ResolvedModelConfig & {
  readonly _brand: unique symbol;
};

export interface _ResolvedModelConfig {
  model: string; // The actual, resolved model name
  generateContentConfig: GenerateContentConfig;
}

export class ModelConfigService {
  private readonly runtimeAliases: Record<string, ModelConfigAlias> = {};
  private readonly runtimeOverrides: ModelConfigOverride[] = [];

  // TODO(12597): Process config to build a typed alias hierarchy.
  constructor(private readonly config: ModelConfigServiceConfig) {}

  getModelDefinition(modelId: string): ModelDefinition | undefined {
    const definition = this.config.modelDefinitions?.[modelId];
    if (definition) {
      return definition;
    }

    // For unknown models, return an implicit custom definition to match legacy behavior.
    if (!modelId.startsWith('gemini-')) {
      return {
        tier: 'custom',
        family: 'custom',
        features: {},
      };
    }

    return undefined;
  }

  getModelDefinitions(): Record<string, ModelDefinition> {
    return this.config.modelDefinitions ?? {};
  }

  private matches(
    condition: ResolutionCondition,
    context: ResolutionContext,
  ): boolean {
    return Object.entries(condition).every(([key, value]) => {
      if (value === undefined) return true;

      switch (key) {
        case 'useGemini3_1':
          return value === context.useGemini3_1;
        case 'useGemini3_1FlashLite':
          return value === context.useGemini3_1FlashLite;
        case 'useCustomTools':
          return value === context.useCustomTools;
        case 'hasAccessToPreview':
          return value === context.hasAccessToPreview;
        case 'requestedModels':
          return (
            Array.isArray(value) &&
            !!context.requestedModel &&
            value.includes(context.requestedModel)
          );
        default:
          return false;
      }
    });
  }

  // Resolves a model ID to a concrete model ID based on the provided context.
  resolveModelId(
    requestedName: string,
    context: ResolutionContext = {},
  ): string {
    const resolution = this.config.modelIdResolutions?.[requestedName];
    if (!resolution) {
      return requestedName;
    }

    for (const ctx of resolution.contexts ?? []) {
      if (this.matches(ctx.condition, context)) {
        return ctx.target;
      }
    }

    return resolution.default;
  }

  // Resolves a classifier model ID to a concrete model ID based on the provided context.
  resolveClassifierModelId(
    tier: string,
    requestedModel: string,
    context: ResolutionContext = {},
  ): string {
    const resolution = this.config.classifierIdResolutions?.[tier];
    const fullContext: ResolutionContext = { ...context, requestedModel };

    if (!resolution) {
      // Fallback to regular model resolution if no classifier-specific rule exists
      return this.resolveModelId(tier, fullContext);
    }

    for (const ctx of resolution.contexts ?? []) {
      if (this.matches(ctx.condition, fullContext)) {
        return ctx.target;
      }
    }

    return resolution.default;
  }

  getModelChain(chainName: string): ModelPolicy[] | undefined {
    return this.config.modelChains?.[chainName];
  }

  /**
   * Fetches a chain template and resolves all model IDs within it
   * based on the provided context.
   */
  resolveChain(
    chainName: string,
    context: ResolutionContext = {},
  ): ModelPolicy[] | undefined {
    const template = this.config.modelChains?.[chainName];
    if (!template) {
      return undefined;
    }
    // Map through the template and resolve each model ID
    return template.map((policy) => ({
      ...policy,
      model: this.resolveModelId(policy.model, context),
    }));
  }

  registerRuntimeModelConfig(aliasName: string, alias: ModelConfigAlias): void {
    this.runtimeAliases[aliasName] = alias;
  }

  registerRuntimeModelOverride(override: ModelConfigOverride): void {
    this.runtimeOverrides.push(override);
  }

  /**
   * Resolves a model configuration by merging settings from aliases and applying overrides.
   *
   * The resolution follows a linear application pipeline:
   *
   * 1. Alias Chain Resolution:
   *    Builds the inheritance chain from root to leaf. Configurations are merged starting from
   *    the root, so that children naturally override parents.
   *
   * 2. Override Level Assignment:
   *    Overrides are matched against the hierarchy and assigned a "Level" for application:
   *    - Level 0: Broad matches (Global or Resolved Model name).
   *    - Level 1..N: Hierarchy matches (from Root-most alias to Leaf-most alias).
   *
   * 3. Precedence & Application:
   *    Overrides are applied in order of their Level (ASC), then Specificity (ASC), then
   *    Configuration Order (ASC). This ensures that more targeted and "deeper" rules
   *    naturally layer on top of broader ones.
   *
   * 4. Orthogonality:
   *    All fields (including 'model') are treated equally. A more specific or deeper override
   *    can freely change any setting, including the target model name.
   */
  private internalGetResolvedConfig(context: ModelConfigKey): {
    model: string | undefined;
    generateContentConfig: GenerateContentConfig;
  } {
    const {
      aliases = {},
      customAliases = {},
      overrides = [],
      customOverrides = [],
    } = this.config || {};
    const allAliases = {
      ...aliases,
      ...customAliases,
      ...this.runtimeAliases,
    };

    const { aliasChain, baseModel, resolvedConfig } = this.resolveAliasChain(
      context.model,
      allAliases,
      context.isChatModel,
    );

    const modelToLevel = this.buildModelLevelMap(aliasChain, baseModel);
    const allOverrides = [
      ...overrides,
      ...customOverrides,
      ...this.runtimeOverrides,
    ];
    const matches = this.findMatchingOverrides(
      allOverrides,
      context,
      modelToLevel,
    );

    this.sortOverrides(matches);

    let currentConfig: ModelConfig = {
      model: baseModel,
      generateContentConfig: resolvedConfig,
    };

    for (const match of matches) {
      currentConfig = ModelConfigService.merge(
        currentConfig,
        match.modelConfig,
      );
    }

    return {
      model: currentConfig.model,
      generateContentConfig: currentConfig.generateContentConfig ?? {},
    };
  }

  private resolveAliasChain(
    requestedModel: string,
    allAliases: Record<string, ModelConfigAlias>,
    isChatModel?: boolean,
  ): {
    aliasChain: string[];
    baseModel: string | undefined;
    resolvedConfig: GenerateContentConfig;
  } {
    const aliasChain: string[] = [];

    if (allAliases[requestedModel]) {
      let current: string | undefined = requestedModel;
      const visited = new Set<string>();
      while (current) {
        const alias: ModelConfigAlias = allAliases[current];
        if (!alias) {
          throw new Error(`Alias "${current}" not found.`);
        }
        if (visited.size >= MAX_ALIAS_CHAIN_DEPTH) {
          throw new Error(
            `Alias inheritance chain exceeded maximum depth of ${MAX_ALIAS_CHAIN_DEPTH}.`,
          );
        }
        if (visited.has(current)) {
          throw new Error(
            `Circular alias dependency: ${[...visited, current].join(' -> ')}`,
          );
        }
        visited.add(current);
        aliasChain.push(current);
        current = alias.extends;
      }

      // Root-to-Leaf chain for merging and level assignment.
      const reversedChain = [...aliasChain].reverse();
      let resolvedConfig: ModelConfig = {};
      for (const aliasName of reversedChain) {
        const alias = allAliases[aliasName];
        resolvedConfig = ModelConfigService.merge(
          resolvedConfig,
          alias.modelConfig,
        );
      }
      return {
        aliasChain: reversedChain,
        baseModel: resolvedConfig.model,
        resolvedConfig: resolvedConfig.generateContentConfig ?? {},
      };
    }

    if (isChatModel) {
      const fallbackAlias = 'chat-base';
      if (allAliases[fallbackAlias]) {
        const fallbackResolution = this.resolveAliasChain(
          fallbackAlias,
          allAliases,
        );
        return {
          aliasChain: [...fallbackResolution.aliasChain, requestedModel],
          baseModel: requestedModel,
          resolvedConfig: fallbackResolution.resolvedConfig,
        };
      }
    }

    return {
      aliasChain: [requestedModel],
      baseModel: requestedModel,
      resolvedConfig: {},
    };
  }

  private buildModelLevelMap(
    aliasChain: string[],
    baseModel: string | undefined,
  ): Map<string, number> {
    const modelToLevel = new Map<string, number>();
    // Global and Model name are both level 0.
    if (baseModel) {
      modelToLevel.set(baseModel, 0);
    }
    // Alias chain starts at level 1.
    aliasChain.forEach((name, i) => modelToLevel.set(name, i + 1));
    return modelToLevel;
  }

  private findMatchingOverrides(
    overrides: ModelConfigOverride[],
    context: ModelConfigKey,
    modelToLevel: Map<string, number>,
  ): Array<{
    specificity: number;
    level: number;
    modelConfig: ModelConfig;
    index: number;
  }> {
    return overrides
      .map((override, index) => {
        const matchEntries = Object.entries(override.match);
        if (matchEntries.length === 0) return null;

        let matchedLevel = 0; // Default to Global
        const isMatch = matchEntries.every(([key, value]) => {
          if (key === 'model') {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
            const level = modelToLevel.get(value as string);
            if (level === undefined) return false;
            matchedLevel = level;
            return true;
          }
          if (key === 'overrideScope' && value === 'core') {
            return context.overrideScope === 'core' || !context.overrideScope;
          }
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          return context[key as keyof ModelConfigKey] === value;
        });

        return isMatch
          ? {
              specificity: matchEntries.length,
              level: matchedLevel,
              modelConfig: override.modelConfig,
              index,
            }
          : null;
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);
  }

  private sortOverrides(
    matches: Array<{ specificity: number; level: number; index: number }>,
  ): void {
    matches.sort((a, b) => {
      if (a.level !== b.level) {
        return a.level - b.level;
      }
      if (a.specificity !== b.specificity) {
        return a.specificity - b.specificity;
      }
      return a.index - b.index;
    });
  }

  getResolvedConfig(context: ModelConfigKey): ResolvedModelConfig {
    const resolved = this.internalGetResolvedConfig(context);

    if (!resolved.model) {
      throw new Error(
        `Could not resolve a model name for alias "${context.model}". Please ensure the alias chain or a matching override specifies a model.`,
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return {
      model: resolved.model,
      generateContentConfig: resolved.generateContentConfig,
    } as ResolvedModelConfig;
  }

  static isObject(item: unknown): item is Record<string, unknown> {
    return !!item && typeof item === 'object' && !Array.isArray(item);
  }

  /**
   * Merges an override `ModelConfig` into a base `ModelConfig`.
   * The override's model name takes precedence if provided.
   * The `generateContentConfig` properties are deeply merged.
   */
  static merge(base: ModelConfig, override: ModelConfig): ModelConfig {
    return {
      model: override.model ?? base.model,
      generateContentConfig: ModelConfigService.deepMerge(
        base.generateContentConfig,
        override.generateContentConfig,
      ),
    };
  }

  static deepMerge(
    config1: GenerateContentConfig | undefined,
    config2: GenerateContentConfig | undefined,
  ): GenerateContentConfig {
    return ModelConfigService.genericDeepMerge(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      config1 as Record<string, unknown> | undefined,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      config2 as Record<string, unknown> | undefined,
    ) as GenerateContentConfig;
  }

  private static genericDeepMerge(
    ...objects: Array<Record<string, unknown> | undefined>
  ): Record<string, unknown> {
    return objects.reduce((acc: Record<string, unknown>, obj) => {
      if (!obj) {
        return acc;
      }

      Object.keys(obj).forEach((key) => {
        const accValue = acc[key];
        const objValue = obj[key];

        // For now, we only deep merge objects, and not arrays. This is because
        // If we deep merge arrays, there is no way for the user to completely
        // override the base array.
        // TODO(joshualitt): Consider knobs here, i.e. opt-in to deep merging
        // arrays on a case-by-case basis.
        if (
          ModelConfigService.isObject(accValue) &&
          ModelConfigService.isObject(objValue)
        ) {
          acc[key] = ModelConfigService.genericDeepMerge(accValue, objValue);
        } else {
          acc[key] = objValue;
        }
      });

      return acc;
    }, {});
  }
}
