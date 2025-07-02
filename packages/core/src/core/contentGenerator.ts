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
 * Interface abstracting the core functionalities for generating content and counting tokens.
 */
/**
 * ContentGenerator 业务流程分析
 * 
 * 核心业务流程：
 * 1. 内容生成流程 (generateContent)
 * 2. 流式内容生成流程 (generateContentStream) 
 * 3. Token计数流程 (countTokens)
 * 4. 内容嵌入流程 (embedContent)
 * 
 * 时序图：
 * 
 * Client                    ContentGenerator              AI Service
 *   │                           │                           │
 *   │ generateContent()         │                           │
 *   │ ─────────────────────────>│                           │
 *   │                           │ validateRequest()         │
 *   │                           │ ─────────────────────────>│
 *   │                           │                           │
 *   │                           │ processContent()          │
 *   │                           │ ─────────────────────────>│
 *   │                           │                           │
 *   │                           │ AI Response               │
 *   │                           │ <─────────────────────────│
 *   │                           │                           │
 *   │                           │ transformResponse()       │
 *   │                           │ ─────────────────────────>│
 *   │                           │                           │
 *   │ GenerateContentResponse   │                           │
 *   │ <─────────────────────────│                           │
 *   │                           │                           │
 * 
 * 流式处理时序图：
 * 
 * Client                    ContentGenerator              AI Service
 *   │                           │                           │
 *   │ generateContentStream()   │                           │
 *   │ ─────────────────────────>│                           │
 *   │                           │ startStream()             │
 *   │                           │ ─────────────────────────>│
 *   │                           │                           │
 *   │                           │ Stream Chunk 1            │
 *   │                           │ <─────────────────────────│
 *   │                           │                           │
 *   │ Stream Response 1         │                           │
 *   │ <─────────────────────────│                           │
 *   │                           │                           │
 *   │                           │ Stream Chunk 2            │
 *   │                           │ <─────────────────────────│
 *   │                           │                           │
 *   │ Stream Response 2         │                           │
 *   │                           │                           │
 *   │                           │ Stream End                │
 *   │                           │ <─────────────────────────│
 *   │                           │                           │
 *   │ Stream Complete           │                           │
 *   │ <─────────────────────────│                           │
 * 
 * 架构组件图：
 * 
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    ContentGenerator                        │
 * ├─────────────────────────────────────────────────────────────┤
 * │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
 * │  │ generateContent │  │generateContent  │  │ countTokens  │ │
 * │  │                 │  │Stream           │  │              │ │
 * │  └─────────────────┘  └─────────────────┘  └──────────────┘ │
 * │                                                             │
 * │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
 * │  │ embedContent    │  │ AuthType        │  │ Config       │ │
 * │  │                 │  │ Management      │  │ Management   │ │
 * │  └─────────────────┘  └─────────────────┘  └──────────────┘ │
 * └─────────────────────────────────────────────────────────────┘
 *                              │
 *                              ▼
 * ┌─────────────────────────────────────────────────────────────┐
 * │                    AI Service Layer                        │
 * ├─────────────────────────────────────────────────────────────┤
 * │  ┌─────────────────┐  ┌─────────────────┐  ┌──────────────┐ │
 * │  │ Gemini API      │  │ Vertex AI       │  │ Code Assist  │ │
 * │  │                 │  │                 │  │              │ │
 * │  └─────────────────┘  └─────────────────┘  └──────────────┘ │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * 数据流图：
 * 
 * Input Request
 *      │
 *      ▼
 * ┌─────────────┐
 * │ Validation  │ ──> 参数验证和模型检查
 * └─────────────┘
 *      │
 *      ▼
 * ┌─────────────┐
 * │ Auth Check  │ ──> 认证类型验证
 * └─────────────┘
 *      │
 *      ▼
 * ┌─────────────┐
 * │ Model Route │ ──> 根据配置路由到对应AI服务
 * └─────────────┘
 *      │
 *      ▼
 * ┌─────────────┐
 * │ AI Process  │ ──> AI服务处理
 * └─────────────┘
 *      │
 *      ▼
 * ┌─────────────┐
 * │ Transform   │ ──> 响应格式转换
 * └─────────────┘
 *      │
 *      ▼
 * Output Response
 * 
 * 错误处理流程：
 * 
 * ┌─────────────────┐
 * │ Error Occurs    │
 * └─────────────────┘
 *         │
 *         ▼
 * ┌─────────────────┐
 * │ Error Type      │
 * │ Classification  │
 * └─────────────────┘
 *         │
 *         ▼
 * ┌─────────────────┐
 * │ Retry Logic     │ ──> 重试机制
 * └─────────────────┘
 *         │
 *         ▼
 * ┌─────────────────┐
 * │ Error Response  │ ──> 错误响应
 * └─────────────────┘
 * 
 * 配置管理流程：
 * 
 * ┌─────────────────┐
 * │ Model Config    │
 * └─────────────────┘
 *         │
 *         ▼
 * ┌─────────────────┐
 * │ Auth Config     │
 * └─────────────────┘
 *         │
 *         ▼
 * ┌─────────────────┐
 * │ Service Config  │
 * └─────────────────┘
 *         │
 *         ▼
 * ┌─────────────────┐
 * │ Generator       │
 * │ Creation        │
 * └─────────────────┘
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
}

export type ContentGeneratorConfig = {
  model: string;
  apiKey?: string;
  vertexai?: boolean;
  authType?: AuthType | undefined;
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

  throw new Error(
    `Error creating contentGenerator: Unsupported authType: ${config.authType}`,
  );
}
