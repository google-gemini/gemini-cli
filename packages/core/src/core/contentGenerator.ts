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
  GoogleGenAIOptions,
} from '@google/genai';
import { createCodeAssistContentGenerator } from '../code_assist/codeAssist.js';
import { DEFAULT_GEMINI_MODEL } from '../config/models.js';
import { getEffectiveModel } from './modelCheck.js';
import { AuthSettings } from '../config/config.js';

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
}

export type ContentGeneratorConfig = {
  model: string;
  authType?: AuthType;
  auth?: AuthSettings;
};

export async function createContentGeneratorConfig(
  model: string | undefined,
  authType: AuthType | undefined,
  config?: {
    getModel?: () => string;
    getAuth?: () => AuthSettings | undefined;
  },
): Promise<ContentGeneratorConfig> {
  // Use runtime model from config if available, otherwise fallback to parameter or default
  const effectiveModel = config?.getModel?.() || model || DEFAULT_GEMINI_MODEL;

  const contentGeneratorConfig: ContentGeneratorConfig = {
    model: effectiveModel,
    authType,
  };

  // if we are using google auth nothing else to validate for now
  if (authType === AuthType.LOGIN_WITH_GOOGLE) {
    return contentGeneratorConfig;
  }

  const auth = config?.getAuth?.();
  const geminiApiKey = auth?.gemini?.apiKey || process.env.GEMINI_API_KEY;
  if (authType === AuthType.USE_GEMINI && !!geminiApiKey) {
    contentGeneratorConfig.auth = { gemini: { apiKey: geminiApiKey } };
    contentGeneratorConfig.model = await getEffectiveModel(
      geminiApiKey,
      contentGeneratorConfig.model,
    );
    return contentGeneratorConfig;
  }

  const googleApiKey = auth?.vertex?.apiKey || process.env.GOOGLE_API_KEY;
  if (authType === AuthType.USE_VERTEX_AI && !!googleApiKey) {
    contentGeneratorConfig.auth = { vertex: { apiKey: googleApiKey } };
    contentGeneratorConfig.model = await getEffectiveModel(
      googleApiKey,
      contentGeneratorConfig.model,
    );
    return contentGeneratorConfig;
  }

  const googleCloudProject =
    auth?.vertex?.project || process.env.GOOGLE_CLOUD_PROJECT;
  const googleCloudLocation =
    auth?.vertex?.location || process.env.GOOGLE_CLOUD_LOCATION;
  if (
    authType === AuthType.USE_VERTEX_AI &&
    !!googleCloudProject &&
    !!googleCloudLocation
  ) {
    contentGeneratorConfig.auth = {
      vertex: {
        project: googleCloudProject,
        location: googleCloudLocation,
      },
    };

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

  if (config.authType === AuthType.LOGIN_WITH_GOOGLE) {
    return createCodeAssistContentGenerator(httpOptions, config.authType);
  }

  const options: GoogleGenAIOptions = { httpOptions };
  if (config.authType === AuthType.USE_GEMINI) {
    options.apiKey = config.auth?.gemini?.apiKey;
    const googleGenAI = new GoogleGenAI(options);
    return googleGenAI.models;
  }

  if (config.authType === AuthType.USE_VERTEX_AI) {
    options.vertexai = true;
    if (config.auth?.vertex?.apiKey) {
      options.apiKey = config.auth?.vertex?.apiKey;
    } else {
      options.project = config.auth?.vertex?.project;
      options.location = config.auth?.vertex?.location;
    }
    const googleGenAI = new GoogleGenAI(options);
    return googleGenAI.models;
  }

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
