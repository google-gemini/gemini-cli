/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  GenerateContentResponse,
  GenerateContentParameters,
  ToolConfig,
  FinishReason,
  FunctionCallingConfig,
} from '@google/genai';
import { DEFAULT_GEMINI_FLASH_MODEL } from '../config/models.js';
import { getResponseText } from '../utils/partUtils.js';

/**
 * Decoupled LLM request format - stable across Gemini CLI versions
 */
export interface LLMRequest {
  model: string;
  messages: Array<{
    role: 'user' | 'model' | 'system';
    content: string | Array<{ type: string; [key: string]: unknown }>;
  }>;
  config?: {
    temperature?: number;
    maxOutputTokens?: number;
    topP?: number;
    topK?: number;
    stopSequences?: string[];
    candidateCount?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    [key: string]: unknown;
  };
  toolConfig?: HookToolConfig;
}

/**
 * Decoupled LLM response format - stable across Gemini CLI versions
 */
export interface LLMResponse {
  text?: string;
  candidates: Array<{
    content: {
      role: 'model';
      parts: string[];
    };
    finishReason?: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
    index?: number;
    safetyRatings?: Array<{
      category: string;
      probability: string;
      blocked?: boolean;
    }>;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  };
}

/**
 * Decoupled tool configuration - stable across Gemini CLI versions
 */
export interface HookToolConfig {
  mode?: 'AUTO' | 'ANY' | 'NONE';
  allowedFunctionNames?: string[];
}

/**
 * Base class for hook translators - handles version-specific translation logic
 */
export abstract class HookTranslator {
  abstract toHookLLMRequest(sdkRequest: GenerateContentParameters): LLMRequest;
  abstract fromHookLLMRequest(
    hookRequest: LLMRequest,
    baseRequest?: GenerateContentParameters,
  ): GenerateContentParameters;
  abstract toHookLLMResponse(sdkResponse: GenerateContentResponse): LLMResponse;
  abstract fromHookLLMResponse(
    hookResponse: LLMResponse,
  ): GenerateContentResponse;
  abstract toHookToolConfig(sdkToolConfig: ToolConfig): HookToolConfig;
  abstract fromHookToolConfig(hookToolConfig: HookToolConfig): ToolConfig;
}

/**
 * Type guard to check if a value has a text property
 */
function hasTextProperty(value: unknown): value is { text: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'text' in value &&
    typeof (value as { text: unknown }).text === 'string'
  );
}

/**
 * Type guard to check if content has role and parts properties
 */
function isContentWithParts(
  content: unknown,
): content is { role: string; parts: unknown } {
  return (
    typeof content === 'object' &&
    content !== null &&
    'role' in content &&
    'parts' in content
  );
}

/**
 * Helper to safely extract generation config from SDK request
 * The SDK uses a config field that contains generation parameters
 */
function extractGenerationConfig(request: GenerateContentParameters):
  | {
      temperature?: number;
      maxOutputTokens?: number;
      topP?: number;
      topK?: number;
    }
  | undefined {
  // Access the config field which contains generation settings
  // Use type assertion after checking the field exists
  if (request.config && typeof request.config === 'object') {
    const config = request.config as {
      temperature?: number;
      maxOutputTokens?: number;
      topP?: number;
      topK?: number;
    };
    return {
      temperature: config.temperature,
      maxOutputTokens: config.maxOutputTokens,
      topP: config.topP,
      topK: config.topK,
    };
  }

  return undefined;
}

/**
 * Hook translator for GenAI SDK v1.x
 * Handles translation between GenAI SDK types and stable Hook API types
 */
export class HookTranslatorGenAIv1 extends HookTranslator {
  /**
   * Convert genai SDK GenerateContentParameters to stable LLMRequest
   *
   * Note: This implementation intentionally extracts only text content from parts.
   * Non-text parts (images, function calls, etc.) are filtered out in v1 to provide
   * a simplified, stable interface for hooks. This allows hooks to focus on text
   * manipulation without needing to handle complex multimodal content.
   * Future versions may expose additional content types if needed.
   */
  toHookLLMRequest(sdkRequest: GenerateContentParameters): LLMRequest {
    const messages: LLMRequest['messages'] = [];

    // Convert contents to messages format (simplified)
    if (sdkRequest.contents) {
      const contents = Array.isArray(sdkRequest.contents)
        ? sdkRequest.contents
        : [sdkRequest.contents];

      for (const content of contents) {
        if (typeof content === 'string') {
          messages.push({
            role: 'user',
            content,
          });
        } else if (isContentWithParts(content)) {
          const role =
            content.role === 'model'
              ? ('model' as const)
              : content.role === 'system'
                ? ('system' as const)
                : ('user' as const);

          const parts = Array.isArray(content.parts)
            ? content.parts
            : [content.parts];

          // Extract only text parts - intentionally filtering out non-text content
          const textContent = parts
            .filter(hasTextProperty)
            .map((part) => part.text)
            .join('');

          // Only add message if there's text content
          if (textContent) {
            messages.push({
              role,
              content: textContent,
            });
          }
        }
      }
    }

    // Safely extract generation config using proper type access
    const config = extractGenerationConfig(sdkRequest);

    return {
      model: sdkRequest.model || DEFAULT_GEMINI_FLASH_MODEL,
      messages,
      config: {
        temperature: config?.temperature,
        maxOutputTokens: config?.maxOutputTokens,
        topP: config?.topP,
        topK: config?.topK,
      },
    };
  }

  /**
   * Convert stable LLMRequest to genai SDK GenerateContentParameters
   */
  fromHookLLMRequest(
    hookRequest: LLMRequest,
    baseRequest?: GenerateContentParameters,
  ): GenerateContentParameters {
    // Convert hook messages back to SDK Content format
    const contents = hookRequest.messages.map((message) => ({
      role: message.role === 'model' ? 'model' : message.role,
      parts: [
        {
          text:
            typeof message.content === 'string'
              ? message.content
              : String(message.content),
        },
      ],
    }));

    // Build the result with proper typing
    const result: GenerateContentParameters = {
      ...baseRequest,
      model: hookRequest.model,
      contents,
    };

    // Add generation config if it exists in the hook request
    if (hookRequest.config) {
      const baseConfig = baseRequest
        ? extractGenerationConfig(baseRequest)
        : undefined;

      result.config = {
        ...baseConfig,
        temperature: hookRequest.config.temperature,
        maxOutputTokens: hookRequest.config.maxOutputTokens,
        topP: hookRequest.config.topP,
        topK: hookRequest.config.topK,
      } as GenerateContentParameters['config'];
    }

    return result;
  }

  /**
   * Convert genai SDK GenerateContentResponse to stable LLMResponse
   */
  toHookLLMResponse(sdkResponse: GenerateContentResponse): LLMResponse {
    return {
      text: getResponseText(sdkResponse) ?? undefined,
      candidates: (sdkResponse.candidates || []).map((candidate) => {
        // Extract text parts from the candidate
        const textParts =
          candidate.content?.parts
            ?.filter(hasTextProperty)
            .map((part) => part.text) || [];

        return {
          content: {
            role: 'model' as const,
            parts: textParts,
          },
          finishReason:
            candidate.finishReason as LLMResponse['candidates'][0]['finishReason'],
          index: candidate.index,
          safetyRatings: candidate.safetyRatings?.map((rating) => ({
            category: String(rating.category || ''),
            probability: String(rating.probability || ''),
          })),
        };
      }),
      usageMetadata: sdkResponse.usageMetadata
        ? {
            promptTokenCount: sdkResponse.usageMetadata.promptTokenCount,
            candidatesTokenCount:
              sdkResponse.usageMetadata.candidatesTokenCount,
            totalTokenCount: sdkResponse.usageMetadata.totalTokenCount,
          }
        : undefined,
    };
  }

  /**
   * Convert stable LLMResponse to genai SDK GenerateContentResponse
   */
  fromHookLLMResponse(hookResponse: LLMResponse): GenerateContentResponse {
    // Build response object with proper structure
    const response: GenerateContentResponse = {
      text: hookResponse.text,
      candidates: hookResponse.candidates.map((candidate) => ({
        content: {
          role: 'model',
          parts: candidate.content.parts.map((part) => ({
            text: part,
          })),
        },
        finishReason: candidate.finishReason as FinishReason,
        index: candidate.index,
        safetyRatings: candidate.safetyRatings,
      })),
      usageMetadata: hookResponse.usageMetadata,
    } as GenerateContentResponse;

    return response;
  }

  /**
   * Convert genai SDK ToolConfig to stable HookToolConfig
   */
  toHookToolConfig(sdkToolConfig: ToolConfig): HookToolConfig {
    return {
      mode: sdkToolConfig.functionCallingConfig?.mode as HookToolConfig['mode'],
      allowedFunctionNames:
        sdkToolConfig.functionCallingConfig?.allowedFunctionNames,
    };
  }

  /**
   * Convert stable HookToolConfig to genai SDK ToolConfig
   */
  fromHookToolConfig(hookToolConfig: HookToolConfig): ToolConfig {
    const functionCallingConfig: FunctionCallingConfig | undefined =
      hookToolConfig.mode || hookToolConfig.allowedFunctionNames
        ? ({
            mode: hookToolConfig.mode,
            allowedFunctionNames: hookToolConfig.allowedFunctionNames,
          } as FunctionCallingConfig)
        : undefined;

    return {
      functionCallingConfig,
    };
  }
}

/**
 * Default translator instance for current GenAI SDK version
 */
export const defaultHookTranslator = new HookTranslatorGenAIv1();
