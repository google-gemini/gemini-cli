/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { BaseLlmConnection, LlmRequest, LlmResponse } from '@google/adk';
import { Gemini, BaseLlm, isBaseLlm } from '@google/adk';

// TODO: use Gemini CLI model config
const LITE_MODELS = ['gemini-3.1-flash-lite-preview', 'gemini-2.5-flash-lite'];
const FLASH_MODELS = ['gemini-3-flash-preview', 'gemini-2.5-flash'];
const PRO_MODELS = ['gemini-3.1-pro-preview', 'gemini-2.5-pro'];

const SUPPORTED_MODELS: string[] = [
  ...LITE_MODELS,
  ...FLASH_MODELS,
  ...PRO_MODELS,
];

export class AdkDynamicGeminiModel extends BaseLlm {
  supportedModels = SUPPORTED_MODELS;
  private currentModel: BaseLlm;

  constructor({ model, apiKey }: { model: string | BaseLlm; apiKey?: string }) {
    super({ model: 'dynamic' });
    this.currentModel = getCanonicalModel(model, apiKey);
  }

  setModel(model: string | BaseLlm, apiKey?: string) {
    this.currentModel = getCanonicalModel(model, apiKey);
  }

  async *generateContentAsync(
    llmRequest: LlmRequest,
    stream?: boolean,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<LlmResponse, void> {
    yield* this.currentModel.generateContentAsync(
      llmRequest,
      stream,
      abortSignal,
    );
  }

  connect(llmRequest: LlmRequest): Promise<BaseLlmConnection> {
    return this.currentModel.connect(llmRequest);
  }
}

function getCanonicalModel(model: string | BaseLlm, apiKey?: string): BaseLlm {
  if (isBaseLlm(model)) {
    return model;
  }

  switch (model) {
    case 'auto':
    case 'pro':
    case 'auto-gemini-3':
      return new Gemini({ model: 'gemini-3.1-pro-preview', apiKey });
    case 'auto-gemini-2.5':
      return new Gemini({ model: 'gemini-2.5-pro', apiKey });
    case 'flash':
    case 'gemini-3-flash-preview':
      return new Gemini({ model: 'gemini-3-flash-preview', apiKey });
    case 'gemini-2.5-flash':
      return new Gemini({ model: 'gemini-2.5-flash', apiKey });
    case 'gemini-3.1-pro-preview':
      return new Gemini({ model: 'gemini-3.1-pro-preview', apiKey });
    case 'gemini-2.5-pro':
      return new Gemini({ model: 'gemini-2.5-pro', apiKey });
    default:
      throw new Error(`Unknown model: ${model}`);
  }
}
