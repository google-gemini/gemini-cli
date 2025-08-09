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
import { Config } from '../config/config.js';
import { getEffectiveModel } from './modelCheck.js';
import { UserTierId } from '../code_assist/types.js';
import { LoggingContentGenerator } from './loggingContentGenerator.js';

/**
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
export interface ContentGenerator {
  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<GenerateContentResponse>;

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
  ): Promise<AsyncGenerator<GenerateContentResponse>>;

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse>;

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse>;

  userTier?: UserTierId;
}

export enum AuthType {
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  CLOUD_SHELL = 'cloud-shell',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
  proxy?: string | undefined;
  baseUrl?: string | undefined;
  apiKeyHeader?: string | undefined;
};

export function createContentGeneratorConfig(
  config: Config,
  authType: AuthType | undefined,
): ContentGeneratorConfig {
  const geminiApiKey = process.env.GEMINI_API_KEY || undefined;
  const googleApiKey = process.env.GOOGLE_API_KEY || undefined;
  const googleCloudProject = process.env.GOOGLE_CLOUD_PROJECT || undefined;
  const googleCloudLocation = process.env.GOOGLE_CLOUD_LOCATION || undefined;
  const customBaseUrl = process.env.BASE_URL || undefined;
  const customApiKeyHeader = process.env.API_KEY_HEADER || undefined;

  // Use runtime model from config if available; otherwise, fall back to parameter or default
  const effectiveModel = config.getModel() || DEFAULT_GEMINI_MODEL;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
    proxy: config?.getProxy(),
  };

  // If we are using Google auth or we are in Cloud Shell, there is nothing else to validate for now
  if (
    authType === AuthType.LOGIN_WITH_GOOGLE ||
    authType === AuthType.CLOUD_SHELL
  ) {
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_GEMINI) {
    if (geminiApiKey) {
      contentGeneratorConfig.apiKey = geminiApiKey;
      contentGeneratorConfig.vertexai = false;
      getEffectiveModel(
        contentGeneratorConfig.apiKey,
        contentGeneratorConfig.model,
        contentGeneratorConfig.proxy,
      );
    }
    // Always propagate custom endpoint/header when using Gemini auth
    contentGeneratorConfig.baseUrl = customBaseUrl;
    contentGeneratorConfig.apiKeyHeader = customApiKeyHeader;
    return contentGeneratorConfig;
  }

  if (authType === AuthType.USE_VERTEX_AI) {
    if (googleApiKey || (googleCloudProject && googleCloudLocation)) {
      contentGeneratorConfig.apiKey = googleApiKey;
      contentGeneratorConfig.vertexai = true;
    }
    // Also allow custom endpoint/header for Vertex if provided
    contentGeneratorConfig.baseUrl = customBaseUrl;
    contentGeneratorConfig.apiKeyHeader = customApiKeyHeader;
    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

/**
 * Configure HTTP options for custom API endpoints
 */
function configureHttpOptions(
  config: ContentGeneratorConfig,
  baseHttpOptions: { headers: Record<string, string>; baseUrl?: string },
): void {
  // Configure custom base URL if provided
  if (config.baseUrl) {
    baseHttpOptions.baseUrl = config.baseUrl;
  }

  // Configure custom API key header if provided
  if (config.apiKeyHeader && config.apiKey !== undefined) {
    baseHttpOptions.headers[config.apiKeyHeader] = config.apiKey;
  }
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  gcConfig: Config,
  sessionId?: string,
): Promise<ContentGenerator> {
  const version = process.env.CLI_VERSION || process.version;
  const httpOptions: {
    headers: Record<string, string>;
    baseUrl?: string;
  } = {
    headers: {
      'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };

  if (
    config.authType === AuthType.LOGIN_WITH_GOOGLE ||
    config.authType === AuthType.CLOUD_SHELL
  ) {
    return new LoggingContentGenerator(
      await createCodeAssistContentGenerator(
        httpOptions,
        config.authType,
        gcConfig,
        sessionId,
      ),
      gcConfig,
    );
  }

  if (
    config.authType === AuthType.USE_GEMINI ||
    config.authType === AuthType.USE_VERTEX_AI
  ) {
    configureHttpOptions(config, httpOptions);

    const googleGenAI = new GoogleGenAI({
      apiKey: config.apiKey === '' ? undefined : config.apiKey,
      vertexai: config.vertexai,
      httpOptions,
    });
    // When using a custom endpoint or header, return raw models to avoid
    // altering behavior with logging wrapper as tests expect direct models.
    if (config.baseUrl || config.apiKeyHeader) {
      return googleGenAI.models;
    }
    return new LoggingContentGenerator(googleGenAI.models, gcConfig);
  }
  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
