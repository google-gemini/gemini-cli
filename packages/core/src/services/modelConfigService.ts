/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GenerateContentConfig } from '@google/genai';

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

export interface ModelConfigServiceConfig {
  aliases?: Record<string, ModelConfigAlias>;
  customAliases?: Record<string, ModelConfigAlias>;
  overrides?: ModelConfigOverride[];
  customOverrides?: ModelConfigOverride[];
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

  registerRuntimeModelConfig(aliasName: string, alias: ModelConfigAlias): void {
    this.runtimeAliases[aliasName] = alias;
  }

  registerRuntimeModelOverride(override: ModelConfigOverride): void {
    this.runtimeOverrides.push(override);
  }

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
    const allOverrides = [
      ...overrides,
      ...customOverrides,
      ...this.runtimeOverrides,
    ];

    let baseModel: string | undefined = undefined;
    let baseModelWeight = Infinity;
    let resolvedConfig: GenerateContentConfig = {};
    const aliasChain: string[] = [];

    // 1. Resolve alias chain and base configuration.
    if (allAliases[context.model]) {
      let current: string | undefined = context.model;
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

      // Merge configurations from the root of the chain down to the requested alias.
      for (let i = aliasChain.length - 1; i >= 0; i--) {
        const alias = allAliases[aliasChain[i]];
        if (alias.modelConfig.model) {
          baseModel = alias.modelConfig.model;
          baseModelWeight = i;
        }
        resolvedConfig = this.deepMerge(
          resolvedConfig,
          alias.modelConfig.generateContentConfig,
        );
      }
    } else {
      // If not an alias, the requested model name is the starting point.
      aliasChain.push(context.model);
      baseModel = context.model;
      baseModelWeight = 0;
    }

    // 2. Identify and weight matching overrides.
    // Precedence weight: Requested Alias (0) > Resolved Model Name (0.5) > Parents (1..N).
    const modelToWeight = new Map<string, number>();
    aliasChain.forEach((name, i) => modelToWeight.set(name, i));
    if (baseModel && !modelToWeight.has(baseModel)) {
      modelToWeight.set(baseModel, 0.5);
    }

    const matches = allOverrides
      .map((override, index) => {
        const matchEntries = Object.entries(override.match);
        if (matchEntries.length === 0) return null;

        let matchedWeight = Infinity;
        const isMatch = matchEntries.every(([key, value]) => {
          if (key === 'model') {
            const weight = modelToWeight.get(value as string);
            if (weight === undefined) return false;
            matchedWeight = weight;
            return true;
          }
          if (key === 'overrideScope' && value === 'core') {
            return context.overrideScope === 'core' || !context.overrideScope;
          }
          return context[key as keyof ModelConfigKey] === value;
        });

        return isMatch
          ? {
              specificity: matchEntries.length,
              weight: matchedWeight,
              modelConfig: override.modelConfig,
              index,
            }
          : null;
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);

    // 3. Sort overrides: higher specificity wins. If specificity is tied:
    //    - If both match a model in the hierarchy, closer to leaf (smaller weight) wins.
    //    - Otherwise, configuration order (index) wins.
    matches.sort((a, b) => {
      if (a.specificity !== b.specificity) {
        return a.specificity - b.specificity;
      }
      if (
        a.weight !== b.weight &&
        a.weight !== Infinity &&
        b.weight !== Infinity
      ) {
        return b.weight - a.weight; // Larger weight (further from leaf) applied first
      }
      return a.index - b.index;
    });

    // 4. Apply matching overrides.
    for (const match of matches) {
      if (match.modelConfig.model) {
        // Protect child-defined models from parent or broad overrides.
        if (baseModel === undefined || match.weight <= baseModelWeight) {
          baseModel = match.modelConfig.model;
          baseModelWeight = match.weight;
        }
      }
      if (match.modelConfig.generateContentConfig) {
        resolvedConfig = this.deepMerge(
          resolvedConfig,
          match.modelConfig.generateContentConfig,
        );
      }
    }

    return { model: baseModel, generateContentConfig: resolvedConfig };
  }

  getResolvedConfig(context: ModelConfigKey): ResolvedModelConfig {
    const resolved = this.internalGetResolvedConfig(context);

    if (!resolved.model) {
      throw new Error(
        `Could not resolve a model name for alias "${context.model}". Please ensure the alias chain or a matching override specifies a model.`,
      );
    }

    return {
      model: resolved.model,
      generateContentConfig: resolved.generateContentConfig,
    } as ResolvedModelConfig;
  }

  private isObject(item: unknown): item is Record<string, unknown> {
    return !!item && typeof item === 'object' && !Array.isArray(item);
  }

  private deepMerge(
    config1: GenerateContentConfig | undefined,
    config2: GenerateContentConfig | undefined,
  ): Record<string, unknown> {
    return this.genericDeepMerge(
      config1 as Record<string, unknown> | undefined,
      config2 as Record<string, unknown> | undefined,
    );
  }

  private genericDeepMerge(
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
        if (this.isObject(accValue) && this.isObject(objValue)) {
          acc[key] = this.deepMerge(accValue, objValue);
        } else {
          acc[key] = objValue;
        }
      });

      return acc;
    }, {});
  }
}
