/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type AuthType,
  getLocalBackendName,
  isLocalBackendAuthType,
  resolveLocalBackendBaseUrl,
} from '../core/contentGenerator.js';
import { isLocalGemma4Alias } from '../config/models.js';

export interface LocalModel {
  id: string;
  object?: string;
  owned_by?: string;
}

export type LocalModelMapping = Partial<Record<string, string>>;

interface ModelsResponse {
  data?: Array<{
    id?: unknown;
    object?: unknown;
    owned_by?: unknown;
  }>;
}

function isModelsResponse(value: unknown): value is ModelsResponse {
  return typeof value === 'object' && value !== null && 'data' in value;
}

export class LocalModelService {
  constructor(private readonly fetchImpl: typeof fetch = globalThis.fetch) {}

  get fetch(): typeof fetch {
    return this.fetchImpl;
  }

  async discoverModels(
    authType: AuthType,
    baseUrl?: string,
  ): Promise<LocalModel[]> {
    if (!isLocalBackendAuthType(authType)) {
      throw new Error(`Unsupported local backend auth type: ${authType}`);
    }

    const resolvedBaseUrl = resolveLocalBackendBaseUrl(authType, baseUrl);
    const url = new URL(
      'models',
      ensureTrailingSlash(resolvedBaseUrl),
    ).toString();

    const response = await this.fetchImpl(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(
        `Unable to query ${getLocalBackendName(authType)} models at ${url}: ${response.status} ${response.statusText}`,
      );
    }

    const json: unknown = await response.json();
    const payload = isModelsResponse(json) ? json : { data: [] };
    return (payload.data ?? [])
      .map((item) => ({
        id: typeof item.id === 'string' ? item.id : '',
        object: typeof item.object === 'string' ? item.object : undefined,
        owned_by: typeof item.owned_by === 'string' ? item.owned_by : undefined,
      }))
      .filter((item) => item.id.length > 0);
  }

  /**
   * Lightweight ping to check if a local backend is reachable.
   * Returns `true` if the backend responds with a non-error status,
   * `false` otherwise (including timeouts).
   */
  async pingBackend(
    authType: AuthType,
    baseUrl?: string,
  ): Promise<boolean> {
    if (!isLocalBackendAuthType(authType)) {
      return false;
    }

    const resolvedBaseUrl = resolveLocalBackendBaseUrl(authType, baseUrl);
    const url = new URL(
      'models',
      ensureTrailingSlash(resolvedBaseUrl),
    ).toString();

    try {
      const response = await this.fetchImpl(url, {
        headers: {
          Accept: 'application/json',
        },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  filterGemma4Models(models: LocalModel[]): LocalModel[] {
    return models.filter((model) => {
      const normalizedId = model.id.toLowerCase();
      return (
        normalizedId.includes('gemma') &&
        normalizedId.includes('4') &&
        !normalizedId.includes('embed') &&
        !normalizedId.includes('functiongemma')
      );
    });
  }

  resolveModelName(
    requestedModel: string,
    discoveredModels: LocalModel[],
    modelMapping?: LocalModelMapping,
  ): string | undefined {
    const trimmedModel = requestedModel.trim();
    if (!trimmedModel) {
      return undefined;
    }

    if (discoveredModels.some((model) => model.id === trimmedModel)) {
      return trimmedModel;
    }

    if (!isLocalGemma4Alias(trimmedModel)) {
      return trimmedModel;
    }

    const mappedModel = modelMapping?.[trimmedModel];
    if (mappedModel) {
      return discoveredModels.some((model) => model.id === mappedModel)
        ? mappedModel
        : undefined;
    }

    const gemma4Models = this.filterGemma4Models(discoveredModels);
    if (gemma4Models.length === 0) {
      return undefined;
    }

    const find = (pattern: RegExp) =>
      gemma4Models.find((model) => pattern.test(model.id))?.id;

    switch (trimmedModel) {
      case 'gemma4':
        return (
          find(/26b|26/i) ??
          find(/31b|31/i) ??
          find(/e4b/i) ??
          find(/e2b/i) ??
          gemma4Models[0]?.id
        );
      case 'gemma4-26b':
        return find(/26b|26/i);
      case 'gemma4-31b':
        return gemma4Models.find(
          (model) => /31b|31/i.test(model.id) && !/cloud/i.test(model.id),
        )?.id;
      case 'gemma4-31b-cloud':
        return gemma4Models.find(
          (model) => /31b|31/i.test(model.id) && /cloud/i.test(model.id),
        )?.id;
      case 'gemma4-e4b':
        return find(/e4b/i);
      case 'gemma4-e2b':
        return find(/e2b/i);
      default:
        return undefined;
    }
  }

  async resolveModelId(
    authType: AuthType,
    requestedModel: string,
    baseUrl?: string,
    modelMapping?: LocalModelMapping,
  ): Promise<string> {
    if (!isLocalBackendAuthType(authType)) {
      throw new Error(`Unsupported local backend auth type: ${authType}`);
    }

    const discoveredModels = await this.discoverModels(authType, baseUrl);
    const resolvedModel = this.resolveModelName(
      requestedModel,
      discoveredModels,
      modelMapping,
    );

    if (resolvedModel) {
      return resolvedModel;
    }

    const backendName = getLocalBackendName(authType);
    const availableGemmaModels = this.filterGemma4Models(discoveredModels).map(
      (model) => model.id,
    );

    if (isLocalGemma4Alias(requestedModel)) {
      const availableLabel =
        availableGemmaModels.length > 0
          ? availableGemmaModels.join(', ')
          : 'none found';
      const mappingLabel = modelMapping?.[requestedModel]
        ? ` Requested mapping: ${modelMapping[requestedModel]}.`
        : '';
      throw new Error(
        `Unable to resolve local model alias "${requestedModel}" on ${backendName}.${mappingLabel} Available Gemma 4 models: ${availableLabel}.`,
      );
    }

    return requestedModel;
  }
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith('/') ? value : `${value}/`;
}
