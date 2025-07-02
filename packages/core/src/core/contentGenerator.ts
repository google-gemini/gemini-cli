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
import {
  OpenAICompatibleContentGenerator,
  AnthropicContentGenerator
} from './customContentGenerators.js';

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
  LOGIN_WITH_GOOGLE = 'oauth-personal',
  USE_GEMINI = 'gemini-api-key',
  USE_VERTEX_AI = 'vertex-ai',
  USE_OPENAI_COMPATIBLE = 'openai-compatible',
  USE_ANTHROPIC = 'anthropic',
  USE_LOCAL_LLM = 'local-llm',
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
  // New fields for custom endpoints
  baseUrl?: string;
  customHeaders?: Record<string, string>;
  timeout?: number;
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

  // New environment variables for other providers
  const openaiApiKey = process.env.OPENAI_API_KEY;
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  const localLlmApiKey = process.env.LOCAL_LLM_API_KEY;
  const customBaseUrl = process.env.CUSTOM_BASE_URL;
  const customTimeout = process.env.CUSTOM_TIMEOUT;

  // Use runtime model from config if available, otherwise fallback to parameter or default
  const effectiveModel = config?.getModel?.() || model || DEFAULT_GEMINI_MODEL;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
    baseUrl: customBaseUrl,
    timeout: customTimeout ? parseInt(customTimeout, 10) : undefined,
  };

  // if we are using google auth nothing else to validate for now
  if (authType === AuthType.LOGIN_WITH_GOOGLE) {
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

  // Vertex AI
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

  // OpenAI Compatible API (includes OpenAI, local LLMs with OpenAI-compatible endpoints)
  if (authType === AuthType.USE_OPENAI_COMPATIBLE && openaiApiKey) {
    contentGeneratorConfig.apiKey = openaiApiKey;
    contentGeneratorConfig.baseUrl = customBaseUrl || 'https://api.openai.com/v1';
    // Use OpenAI model names instead of Gemini model names
    if (effectiveModel.includes('gemini')) {
      contentGeneratorConfig.model = 'gpt-4o'; // Default to GPT-4o for Gemini models
    } else {
      contentGeneratorConfig.model = effectiveModel; // Use the specified model if it's not a Gemini model
    }
    return contentGeneratorConfig;
  }

  // Anthropic API
  if (authType === AuthType.USE_ANTHROPIC) {
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required for anthropic auth type.');
    }
    contentGeneratorConfig.apiKey = anthropicApiKey;
    contentGeneratorConfig.baseUrl = customBaseUrl || 'https://api.anthropic.com';
    // Use Anthropic model names instead of Gemini model names
    if (effectiveModel.includes('gemini')) {
      contentGeneratorConfig.model = 'claude-3-5-sonnet-20241022'; // Default to Claude 3.5 Sonnet for Gemini models
    } else {
      contentGeneratorConfig.model = effectiveModel;
    }
    return contentGeneratorConfig;
  }

  // Local LLM (custom endpoint)
  if (authType === AuthType.USE_LOCAL_LLM) {
    contentGeneratorConfig.apiKey = localLlmApiKey || 'dummy-key'; // Some local LLMs don't need real API keys
    contentGeneratorConfig.baseUrl = customBaseUrl || 'http://localhost:8080';
    // For local LLMs, use the model name as-is or default to a common one
    if (effectiveModel.includes('gemini')) {
      contentGeneratorConfig.model = 'llama2'; // Default to llama2 for local LLMs
    } else {
      contentGeneratorConfig.model = effectiveModel;
    }
    return contentGeneratorConfig;
  }

  return contentGeneratorConfig;
}

export async function createContentGenerator(
  config: ContentGeneratorConfig,
  sessionId?: string,
): Promise<ContentGenerator> {
  const version = process.env.CLI_VERSION || process.version;
  const httpOptions = {
    headers: {
      'User-Agent': `GeminiCLI/${version} (${process.platform}; ${process.arch})`,
    },
  };
  if (config.authType === AuthType.LOGIN_WITH_GOOGLE) {
    return createCodeAssistContentGenerator(
      httpOptions,
      config.authType,
      sessionId,
    );
  }

  // Google Gemini API and Vertex AI
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

  // OpenAI Compatible APIs (including OpenAI, local LLMs with OpenAI-compatible endpoints)
  if (config.authType === AuthType.USE_OPENAI_COMPATIBLE) {
    return new OpenAICompatibleContentGenerator(config);
  }

  // Anthropic Claude API
  if (config.authType === AuthType.USE_ANTHROPIC) {
    return new AnthropicContentGenerator(config);
  }

  // Local LLM (typically OpenAI-compatible)
  if (config.authType === AuthType.USE_LOCAL_LLM) {
    return new OpenAICompatibleContentGenerator(config);
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
