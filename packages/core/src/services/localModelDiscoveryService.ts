/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getLocalBackendName,
  resolveLocalBackendBaseUrl,
  type LocalBackendAuthType,
  type LocalBackendName,
} from '../core/contentGenerator.js';
import { LocalModelService, type LocalModel } from './localModelService.js';
import {
  resolveGemma4Defaults,
  type LocalModelMetadata,
  type ModelTuningSettings,
  tuneModelFromMetadata,
} from './localModelMetadata.js';

const DEFAULT_DISCOVERY_TIMEOUT_MS = 1500;

function getLocalBackendDiscoveryOrder(): LocalBackendAuthType[] {
  return [
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    'local-ollama' as LocalBackendAuthType,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    'local-lm-studio' as LocalBackendAuthType,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    'local-llama-cpp' as LocalBackendAuthType,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    'local-vllm' as LocalBackendAuthType,
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    'local-sglang' as LocalBackendAuthType,
  ];
}

export interface DiscoveredLocalBackend {
  authType: LocalBackendAuthType;
  backend: LocalBackendName;
  baseUrl: string;
  models: LocalModel[];
  gemma4Models: LocalModel[];
  gemma4Metadata: LocalModelMetadata[];
}

export interface LocalBackendDiscoveryResult {
  backends: DiscoveredLocalBackend[];
  preferredBackend?: DiscoveredLocalBackend;
}

export interface DiscoverLocalBackendsOptions {
  authTypes?: LocalBackendAuthType[];
  baseUrls?: Partial<Record<LocalBackendName, string>>;
  timeoutMs?: number;
}

export class LocalModelDiscoveryService {
  constructor(private readonly localModelService = new LocalModelService()) {}

  async discoverBackends(
    options: DiscoverLocalBackendsOptions = {},
  ): Promise<LocalBackendDiscoveryResult> {
    const authTypes = options.authTypes ?? getLocalBackendDiscoveryOrder();
    const timeoutMs = options.timeoutMs ?? DEFAULT_DISCOVERY_TIMEOUT_MS;

    const results = await Promise.allSettled(
      authTypes.map((authType) =>
        this.discoverBackend(
          authType,
          options.baseUrls?.[getLocalBackendName(authType)],
          timeoutMs,
        ),
      ),
    );

    const backends = results
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<
          DiscoveredLocalBackend | undefined
        > => result.status === 'fulfilled',
      )
      .map((result) => result.value)
      .filter((result): result is DiscoveredLocalBackend => Boolean(result));

    return {
      backends,
      preferredBackend: choosePreferredBackend(backends),
    };
  }

  private async discoverBackend(
    authType: LocalBackendAuthType,
    configuredDefaultBaseUrl: string | undefined,
    timeoutMs: number,
  ): Promise<DiscoveredLocalBackend | undefined> {
    const baseUrl = resolveLocalBackendBaseUrl(
      authType,
      undefined,
      configuredDefaultBaseUrl,
    );

    const models = await withTimeout(
      this.localModelService.discoverModels(authType, baseUrl),
      timeoutMs,
      `${getLocalBackendName(authType)} discovery timed out after ${timeoutMs}ms`,
    );

    const gemma4Models = this.localModelService.filterGemma4Models(models);
    if (gemma4Models.length === 0) {
      return undefined;
    }

    const gemma4Metadata = await this.fetchMetadata(
      getLocalBackendName(authType),
      baseUrl,
      gemma4Models,
    );

    return {
      authType,
      backend: getLocalBackendName(authType),
      baseUrl,
      models,
      gemma4Models,
      gemma4Metadata,
    };
  }

  private async fetchMetadata(
    backend: LocalBackendName,
    baseUrl: string,
    models: LocalModel[],
  ): Promise<LocalModelMetadata[]> {
    return Promise.all(
      models.map((model) => this.fetchModelMetadata(backend, baseUrl, model)),
    );
  }

  private async fetchModelMetadata(
    backend: LocalBackendName,
    baseUrl: string,
    model: LocalModel,
  ): Promise<LocalModelMetadata> {
    const defaults = resolveGemma4Defaults(model.id);
    let ollamaDetail: Record<string, unknown> = {};
    if (backend === 'ollama') {
      try {
        ollamaDetail = await this.fetchOllamaModelShow(baseUrl, model.id);
      } catch {
        // fall through to defaults
      }
    }

    return {
      id: model.id,
      displayName: defaults.displayName || model.id,
      backendId: backend,
      contextLength: defaults.contextLength || 131072,
      supportsVision: defaults.supportsVision ?? true,
      supportsAudio: defaults.supportsAudio ?? false,
      supportsReasoning: defaults.supportsReasoning ?? true,
      supportsToolUse: defaults.supportsToolUse ?? true,
      thinkingConfig: {
        nativeThinking: defaults.thinkingConfig?.nativeThinking ?? true,
        implementation:
          defaults.thinkingConfig?.implementation || 'native-token',
        maxThinkingTokens: defaults.thinkingConfig?.maxThinkingTokens || 16384,
        visibleReasoningInOutput:
          defaults.thinkingConfig?.visibleReasoningInOutput ?? true,
      },
      paramSize:
        this.extractString(ollamaDetail['model_info'], 'totalParams') ||
        defaults.paramSize ||
        'Unknown',
      quantization:
        this.extractString(ollamaDetail['details'], 'quantization_level') ||
        defaults.quantization ||
        'Unknown',
      isLoaded: defaults.isLoaded ?? true,
    };
  }

  private async fetchOllamaModelShow(
    baseUrl: string,
    modelId: string,
  ): Promise<Record<string, unknown>> {
    const ollamaBase = baseUrl.replace(/\/v1\/?$/, '');
    const response = await this.localModelService.fetch(
      `${ollamaBase}/api/show`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ name: modelId }),
      },
    );
    if (!response.ok) {
      throw new Error(`Ollama /api/show failed: ${response.status}`);
    }
    const json: unknown = await response.json();
    if (typeof json !== 'object' || json === null) {
      return {};
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    return json as Record<string, unknown>;
  }

  async tuneBackendModels(
    backend: DiscoveredLocalBackend,
  ): Promise<Map<string, ModelTuningSettings>> {
    const tunings = new Map<string, ModelTuningSettings>();
    for (const meta of backend.gemma4Metadata) {
      tunings.set(meta.id, tuneModelFromMetadata(meta));
    }
    return tunings;
  }

  private extractString(obj: unknown, key: string): string | undefined {
    if (!obj || typeof obj !== 'object') return undefined;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    const record = obj as Record<string, unknown>;
    const value = record[key];
    return typeof value === 'string' ? value : undefined;
  }
}

function choosePreferredBackend(
  backends: DiscoveredLocalBackend[],
): DiscoveredLocalBackend | undefined {
  if (backends.length === 0) {
    return undefined;
  }

  const orderIndex = new Map(
    getLocalBackendDiscoveryOrder().map((authType, index) => [authType, index]),
  );

  return [...backends].sort((left, right) => {
    if (left.gemma4Models.length !== right.gemma4Models.length) {
      return right.gemma4Models.length - left.gemma4Models.length;
    }

    return (
      (orderIndex.get(left.authType) ?? Number.MAX_SAFE_INTEGER) -
      (orderIndex.get(right.authType) ?? Number.MAX_SAFE_INTEGER)
    );
  })[0];
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
