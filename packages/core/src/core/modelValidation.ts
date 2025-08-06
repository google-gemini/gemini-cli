/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { setGlobalDispatcher, ProxyAgent } from 'undici';
import { Config } from '../config/config.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';

export interface ModelValidationResult {
  effectiveModel: string;
  logs: string[];
}

let availableModels: string[] | null = null;

async function listModels(apiKey: string, proxy?: string): Promise<string[]> {
  if (availableModels) {
    return availableModels;
  }

  if (proxy) {
    setGlobalDispatcher(new ProxyAgent(proxy));
  }

  const endpoint = 'https://generativelanguage.googleapis.com/v1beta/models';
  try {
    const response = await fetch(endpoint, {
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = (await response.json()) as { models: Array<{ name: string }> };
    availableModels = data.models.map((m) => m.name.replace('models/', ''));
    return availableModels;
  } catch (_error) {
    return [];
  }
}

export async function validateModel(
  config: Config,
): Promise<ModelValidationResult> {
  const logs: string[] = [];
  const preferredModel = config.getModel();
  const apiKey = config.getContentGeneratorConfig()?.apiKey;

  if (!apiKey) {
    // Cannot validate without an API key.
    return { effectiveModel: preferredModel, logs };
  }

  const models = await listModels(apiKey, config.getProxy());

  if (models.length === 0) {
    logs.push(
      'Could not retrieve list of available models. Using configured model.',
    );
    return { effectiveModel: preferredModel, logs };
  }

  if (models.includes(preferredModel)) {
    logs.push(`Using model ${preferredModel}`);
    return { effectiveModel: preferredModel, logs };
  }

  logs.push(
    `Configured model "${preferredModel}" is not available.`,
    `Defaulting to ${DEFAULT_GEMINI_MODEL}.`,
  );

  return {
    effectiveModel: DEFAULT_GEMINI_MODEL,
    logs,
  };
}
