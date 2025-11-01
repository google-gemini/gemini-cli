/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GenerateContentConfig } from '@google/genai';

export interface GenerationContext {
  agent?: string;
  model: string; // Can be a model name or an alias
}

export interface GenerationSettings {
  model?: string;
  config?: Partial<GenerateContentConfig>;
}

export interface GenerationOverride {
  match: {
    agent?: string;
    model?: string; // Can be a model name or an alias
  };
  settings: GenerationSettings;
}

export interface GenerationAlias {
  extends?: string;
  settings: GenerationSettings;
}

export interface ModelGenerationServiceConfig {
  aliases?: Record<string, GenerationAlias>;
  overrides?: GenerationOverride[];
  config?: Partial<GenerateContentConfig>;
}

export type ResolvedModelConfig = _ResolvedGenerationSettings & {
  readonly _brand: unique symbol;
};

export interface _ResolvedGenerationSettings {
  model: string; // The actual, resolved model name

  sdkConfig: GenerateContentConfig;
}

export class ModelGenerationConfigService {
  constructor(private readonly config: ModelGenerationServiceConfig) {}

  private resolveAlias(
    aliasName: string,
    aliases: Record<string, GenerationAlias>,
    visited = new Set<string>(),
  ): GenerationAlias {
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
      settings: {
        model: alias.settings.model ?? baseAlias.settings.model,
        config: this.deepMerge(
          baseAlias.settings.config,
          alias.settings.config,
        ),
      },
    };
  }

  private internalGetResolvedConfig(context: GenerationContext): {
    model: string | undefined;
    sdkConfig: Partial<GenerateContentConfig>;
  } {
    const config = this.config || {};
    const { aliases = {}, overrides = [], config: globalConfig = {} } = config;
    let baseModel: string | undefined = context.model;
    let resolvedConfig: Partial<GenerateContentConfig> = { ...globalConfig };

    // Step 1: Alias Resolution
    if (aliases[context.model]) {
      const resolvedAlias = this.resolveAlias(context.model, aliases);
      baseModel = resolvedAlias.settings.model; // This can now be undefined
      resolvedConfig = this.deepMerge(
        resolvedConfig,
        resolvedAlias.settings.config,
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
          if (key === 'agent' && value === 'core') {
            // The 'core' agent is special. It should match if the agent is
            // explicitly 'core' or if the agent is not specified.
            return context.agent === 'core' || !context.agent;
          }
          return finalContext[key as keyof GenerationContext] === value;
        });

        if (isMatch) {
          return {
            specificity: matchEntries.length,
            settings: override.settings,
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
      if (match.settings.model) {
        baseModel = match.settings.model;
      }
      if (match.settings.config) {
        resolvedConfig = this.deepMerge(resolvedConfig, match.settings.config);
      }
    }

    return {
      model: baseModel,
      sdkConfig: resolvedConfig,
    };
  }

  getResolvedConfig(context: GenerationContext): ResolvedModelConfig {
    const resolved = this.internalGetResolvedConfig(context);

    if (!resolved.model) {
      throw new Error(
        `Could not resolve a model name for alias "${context.model}". Please ensure the alias chain or a matching override specifies a model.`,
      );
    }

    // TODO(joshualitt): This is a hacky approximation. We should probably
    // have a more robust way of determining if a model is a terminal string.
    if (!resolved.model.startsWith('gemini-')) {
      throw new Error(
        `Resolved model "${resolved.model}" is not a valid terminal model string. It should start with "gemini-".`,
      );
    }

    return {
      model: resolved.model,
      sdkConfig: resolved.sdkConfig as GenerateContentConfig,
    } as ResolvedModelConfig;
  }

  private isObject(item: unknown): item is Record<string, unknown> {
    return !!item && typeof item === 'object' && !Array.isArray(item);
  }

  private deepMerge(
    ...objects: Array<Record<string, unknown> | undefined>
  ): Record<string, unknown> {
    return objects.reduce((acc: Record<string, unknown>, obj) => {
      if (!obj) {
        return acc;
      }

      Object.keys(obj).forEach((key) => {
        const accValue = acc[key];
        const objValue = obj[key];

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
