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

  // TODO(12597): Process config to build a typed alias hierarchy.
  constructor(private readonly config: ModelConfigServiceConfig) {}

  registerRuntimeModelConfig(aliasName: string, alias: ModelConfigAlias): void {
    this.runtimeAliases[aliasName] = alias;
  }

  private resolveAlias(
    aliasName: string,
    aliases: Record<string, ModelConfigAlias>,
    visited = new Set<string>(),
  ): ModelConfigAlias {
    if (visited.size >= MAX_ALIAS_CHAIN_DEPTH) {
      throw new Error(
        `Alias inheritance chain exceeded maximum depth of ${MAX_ALIAS_CHAIN_DEPTH}.`,
      );
    }
    if (visited.has(aliasName)) {
      throw new Error(
        `Circular alias dependency: ${[...visited, aliasName].join(' -> ')}`,
      );
    }
    visited.add(aliasName);

    const alias = aliases[aliasName];
    if (!alias) {
      throw new Error(`Alias "${aliasName}" not found.`);
    }

    if (!alias.extends) {
      return alias;
    }

    const baseAlias = this.resolveAlias(alias.extends, aliases, visited);

    return {
      modelConfig: {
        model: alias.modelConfig.model ?? baseAlias.modelConfig.model,
        generateContentConfig: this.deepMerge(
          baseAlias.modelConfig.generateContentConfig,
          alias.modelConfig.generateContentConfig,
        ),
      },
    };
  }

  private getAliasChain(
    aliasName: string,
    aliases: Record<string, ModelConfigAlias>,
  ): string[] {
    const chain: string[] = [];
    let current: string | undefined = aliasName;
    const visited = new Set<string>();
    while (current && aliases[current]) {
      if (visited.size >= MAX_ALIAS_CHAIN_DEPTH) {
        throw new Error(
          `Alias inheritance chain exceeded maximum depth of ${MAX_ALIAS_CHAIN_DEPTH}.`,
        );
      }
      if (visited.has(current)) {
        break;
      }
      visited.add(current);
      chain.push(current);
      current = aliases[current].extends;
    }
    return chain;
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
    const allOverrides = [...overrides, ...customOverrides];

    let baseModel: string | undefined = context.model;
    let resolvedConfig: GenerateContentConfig = {};
    let currentModelSourceIndex = allAliases[context.model] ? Infinity : 0;

    // Step 1: Alias Resolution
    const aliasChain = allAliases[context.model]
      ? this.getAliasChain(context.model, allAliases)
      : [context.model];

    if (allAliases[context.model]) {
      const resolvedAlias = this.resolveAlias(context.model, allAliases);
      baseModel = resolvedAlias.modelConfig.model;
      resolvedConfig = this.deepMerge(
        resolvedConfig,
        resolvedAlias.modelConfig.generateContentConfig,
      );

      // Identify which alias in the chain provided the model name.
      if (baseModel) {
        for (let i = 0; i < aliasChain.length; i++) {
          if (allAliases[aliasChain[i]].modelConfig.model) {
            currentModelSourceIndex = i;
            break;
          }
        }
      }
    }

    // Prepare models for override matching (Chain + Resolved Model Name).
    const modelsToMatch = [...aliasChain];
    if (baseModel && !modelsToMatch.includes(baseModel)) {
      modelsToMatch.push(baseModel);
    }

    // Step 2: Override Application
    const matches = allOverrides
      .map((override, index) => {
        const matchEntries = Object.entries(override.match);
        if (matchEntries.length === 0) return null;

        let matchedAliasIndex = Infinity;
        const isMatch = matchEntries.every(([key, value]) => {
          if (key === 'model') {
            const matchIndex = modelsToMatch.indexOf(value as string);
            if (matchIndex === -1) return false;

            // Precedence tie-breaker: Requested Alias (0) > Resolved Model Name (-1) > Parents (1..N).
            const isResolvedModelName =
              matchIndex === modelsToMatch.length - 1 &&
              value === baseModel &&
              !allAliases[value];
            matchedAliasIndex = isResolvedModelName ? -1 : matchIndex;
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
              aliasIndex: matchedAliasIndex,
              modelConfig: override.modelConfig,
              index,
            }
          : null;
      })
      .filter((m): m is NonNullable<typeof m> => m !== null);

    // Sort: Higher specificity wins. For same specificity, use alias depth as a tie-breaker
    // between model matches, otherwise fall back to configuration order.
    const getWeight = (idx: number) => (idx === -1 ? 0.5 : idx);
    matches.sort((a, b) => {
      if (a.specificity !== b.specificity) {
        return a.specificity - b.specificity;
      }
      if (
        a.aliasIndex !== Infinity &&
        b.aliasIndex !== Infinity &&
        a.aliasIndex !== b.aliasIndex
      ) {
        return getWeight(b.aliasIndex) - getWeight(a.aliasIndex);
      }
      return a.index - b.index;
    });

    // Apply matching overrides
    for (const match of matches) {
      if (match.modelConfig.model) {
        // Protect child-defined models from parent overrides.
        if (
          baseModel === undefined ||
          match.aliasIndex <= currentModelSourceIndex
        ) {
          baseModel = match.modelConfig.model;
          currentModelSourceIndex = match.aliasIndex;
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
