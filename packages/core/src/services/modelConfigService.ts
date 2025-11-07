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
}

export interface ModelConfig {
  model?: string;
  generateContentConfig?: GenerateContentConfig;
}

export interface ModelConfigOverride {
  match: {
    model?: string; // Can be a model name or an alias
    overrideScope?: string;
  };
  modelConfig: ModelConfig;
}

export interface ModelConfigAlias {
  extends?: string;
  modelConfig: ModelConfig;
}

export interface ModelConfigServiceConfig {
  aliases?: Record<string, ModelConfigAlias>;
  overrides?: ModelConfigOverride[];
}

export type ResolvedModelConfig = _ResolvedModelConfig & {
  readonly _brand: unique symbol;
};

export interface _ResolvedModelConfig {
  model: string; // The actual, resolved model name
  generateContentConfig: GenerateContentConfig;
}

export class ModelConfigService {
  // TODO(12597): Process config to build a typed alias hierarchy.
  constructor(private readonly config: ModelConfigServiceConfig) {}

  private resolveAlias(
    aliasName: string,
    aliases: Record<string, ModelConfigAlias>,
    visited = new Set<string>(),
  ): ModelConfigAlias {
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

  private internalGetResolvedConfig(context: ModelConfigKey): {
    model: string | undefined;
    generateContentConfig: GenerateContentConfig;
  } {
    const config = this.config || {};
    const { aliases = {}, overrides = [] } = config;
    let baseModel: string | undefined = context.model;
    let resolvedConfig: GenerateContentConfig = {};

    // Step 1: Alias Resolution
    if (aliases[context.model]) {
      const resolvedAlias = this.resolveAlias(context.model, aliases);
      baseModel = resolvedAlias.modelConfig.model; // This can now be undefined
      resolvedConfig = this.deepMerge(
        resolvedConfig,
        resolvedAlias.modelConfig.generateContentConfig,
      );
    }

    // If an alias was used but didn't resolve to a model, `baseModel` is undefined.
    // We still need a model for matching overrides. We'll use the original alias name
    // for matching if no model is resolved yet.
    const modelForMatching = baseModel ?? context.model;

    const finalContext = {
      ...context,
      model: modelForMatching,
    };

    // Step 2: Override Application
    const matches = overrides
      .map((override, index) => {
        const matchEntries = Object.entries(override.match);
        if (matchEntries.length === 0) {
          return null;
        }

        const isMatch = matchEntries.every(([key, value]) => {
          if (key === 'model') {
            return value === context.model || value === finalContext.model;
          }
          if (key === 'overrideScope' && value === 'core') {
            // The 'core' overrideScope is special. It should match if the
            // overrideScope is explicitly 'core' or if the overrideScope
            // is not specified.
            return context.overrideScope === 'core' || !context.overrideScope;
          }
          return finalContext[key as keyof ModelConfigKey] === value;
        });

        if (isMatch) {
          return {
            specificity: matchEntries.length,
            modelConfig: override.modelConfig,
            index,
          };
        }
        return null;
      })
      .filter((match): match is NonNullable<typeof match> => match !== null);

    // The override application logic is designed to be both simple and powerful.
    // By first sorting all matching overrides by specificity (and then by their
    // original order as a tie-breaker), we ensure that as we merge the `config`
    // objects, the settings from the most specific rules are applied last,
    // correctly overwriting any values from broader, less-specific rules.
    // This achieves a per-property override effect without complex per-property logic.
    matches.sort((a, b) => {
      if (a.specificity !== b.specificity) {
        return a.specificity - b.specificity;
      }
      return a.index - b.index;
    });

    // Apply matching overrides
    for (const match of matches) {
      if (match.modelConfig.model) {
        baseModel = match.modelConfig.model;
      }
      if (match.modelConfig.generateContentConfig) {
        resolvedConfig = this.deepMerge(
          resolvedConfig,
          match.modelConfig.generateContentConfig,
        );
      }
    }

    return {
      model: baseModel,
      generateContentConfig: resolvedConfig,
    };
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
          acc[key] = this.deepMerge(
            accValue as Record<string, unknown>,
            objValue as Record<string, unknown>,
          );
        } else {
          acc[key] = objValue;
        }
      });

      return acc;
    }, {});
  }
}
