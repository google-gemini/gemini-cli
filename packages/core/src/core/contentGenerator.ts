/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  CountTokensResponse,
  GenerateContentResponse,
  GenerateContentParameters,
  CountTokensParameters,
  EmbedContentResponse,
  EmbedContentParameters,
  GoogleGenAI,
} from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { getEffectiveModel } from './modelCheck.js';

/**
 * Maps Gemini model names to OpenRouter model IDs
 */
function mapGeminiModelToOpenRouter(model: string): string {
  const modelMap: Record<string, string> = {
    'gemini-2.5-pro': 'google/gemini-2.5-pro',
    'gemini-2.5-flash': 'google/gemini-2.5-flash',
    'gemini-2.5-pro-preview': 'google/gemini-2.5-pro-preview',
    'gemini-2.5-flash-preview': 'google/gemini-2.5-flash-preview',
    'gemini-2.0-flash-thinking-exp': 'google/gemini-2.0-flash-thinking-exp',
    'gemini-2.0-flash-exp': 'google/gemini-2.0-flash-exp',
    'gemini-pro': 'google/gemini-pro',
    'gemini-pro-vision': 'google/gemini-pro-vision',
    'gemini-flash-1.5': 'google/gemini-flash-1.5',
    'gemini-1.5-pro': 'google/gemini-pro-1.5',
    'gemini-1.5-flash': 'google/gemini-flash-1.5',
  };

  return modelMap[model] || `google/${model}`;
}

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE_PERSONAL = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  USE_OPENROUTER = 'openrouter',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
  openRouterBaseUrl?: string;
};

export async function createContentGeneratorConfig(
  model: string | undefined,
  authType: AuthType | undefined,
  config?: { getModel?: () => string },
): Promise<ContentGeneratorConfig> {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const googleApiKey = process.env.GOOGLE_API_KEY;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION;
  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  const openRouterBaseUrl = process.env.OPENROUTER_BASE_URL;

  // Use runtime model from config if available, otherwise fallback to parameter or default
  const effectiveModel = config?.getModel?.() || model || DEFAULT_GEMINI_MODEL;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
  };

  // if we are using google auth nothing else to validate for now
  if (authType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_GEMINI && geminiApiKey) {
    contentGeneratorConfig.apiKey = geminiApiKey;
    contentGeneratorConfig.model = await getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
    );

    return contentGeneratorConfig;
  }

  if (
    authType === AuthType.USE_VERTEX_AI &&
    !!googleApiKey &&
    googleCloudProject &&
    googleCloudLocation
  ) {
    contentGeneratorConfig.apiKey = googleApiKey;
    contentGeneratorConfig.vertexai = true;
    contentGeneratorConfig.model = await getEffectiveModel(
      contentGeneratorConfig.apiKey,
      contentGeneratorConfig.model,
    );

    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_OPENROUTER && openRouterApiKey) {
    contentGeneratorConfig.apiKey = openRouterApiKey;
    contentGeneratorConfig.openRouterBaseUrl =
      openRouterBaseUrl || 'https://openrouter.ai/api/v1';
    // Map Gemini model names to OpenRouter format
    contentGeneratorConfig.model = mapGeminiModelToOpenRouter(
      contentGeneratorConfig.model,
    );

    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
): Promise<ContentGenerator> {
  const version = process.env.CLI_VERSION || process.version;
  const httpOptions = {
    headers: {
      'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };
  if (config.authType === AuthType.LOGIN_WITH_GOOGLE_PERSONAL) {
    return createCodeAssistContentGenerator(httpOptions, config.authType);
  }

  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config.vertexai,
      httpOptions,
    });

    return googleGenAI.models;
  }

  if (config.authType === AuthType.USE_OPENROUTER) {
    const { createOpenRouterContentGenerator } = await import(
      './openRouterContentGenerator.js'
    );
    return createOpenRouterContentGenerator(config, httpOptions);
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
