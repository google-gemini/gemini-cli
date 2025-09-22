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
} from '@google/genai';

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
}

/**
 * Decoupled LLM response format - stable across Gemini CLI versions
 */
export interface LLMResponse {
  text?: string;
  candidates: Array<{
    content: {
      role: 'model';
      parts: Array<{ text?: string; [key: string]: unknown }>;
    };
    finishReason?: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER';
    index?: number;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
  }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
    cachedContentTokenCount?: number;
  };
  promptFeedback?: {
    blockReason?: string;
    safetyRatings?: Array<{
      category: string;
      probability: string;
    }>;
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
 * Hook translator for GenAI SDK v1.x
 * Handles translation between GenAI SDK types and stable Hook API types
 */
export class HookTranslatorGenAIv1 extends HookTranslator {
  /**
   * Convert genai SDK GenerateContentParameters to stable LLMRequest
   */
  toHookLLMRequest(sdkRequest: GenerateContentParameters): LLMRequest {
    const messages: LLMRequest['messages'] = [];

    // Convert contents to messages format (simplified)
    if (sdkRequest.contents) {
      try {
        const contents = Array.isArray(sdkRequest.contents)
          ? sdkRequest.contents
          : [sdkRequest.contents];
        for (const content of contents) {
          if (typeof content === 'string') {
            messages.push({
              role: 'user',
              content,
            });
          } else if (
            content &&
            typeof content === 'object' &&
            'role' in content &&
            'parts' in content
          ) {
            const role =
              content.role === 'model'
                ? 'model'
                : (content.role as 'user' | 'system');
            const parts = Array.isArray(content.parts)
              ? content.parts
              : [content.parts];
            const textContent = parts
              .filter(
                (part) => part && typeof part === 'object' && 'text' in part,
              )
              .map((part) => (part as { text: string }).text)
              .join('');

            messages.push({
              role,
              content: textContent,
            });
          }
        }
      } catch (_error) {
        // Fallback for any conversion issues
        messages.push({
          role: 'user',
          content: '[Content conversion error]',
        });
      }
    }

    return {
      model: sdkRequest.model || 'gemini-1.5-flash',
      messages,
      config: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        temperature: (sdkRequest as any).generationConfig?.temperature,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        maxOutputTokens: (sdkRequest as any).generationConfig?.maxOutputTokens,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        topP: (sdkRequest as any).generationConfig?.topP,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        topK: (sdkRequest as any).generationConfig?.topK,
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
    // Simplified conversion back to SDK format
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

    const result = {
      ...baseRequest,
      model: hookRequest.model,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contents: contents as any,
    };

    // Add generation config if it exists in the hook request
    if (hookRequest.config) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (result as any).generationConfig = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ...((baseRequest as any)?.generationConfig || {}),
        temperature: hookRequest.config.temperature,
        maxOutputTokens: hookRequest.config.maxOutputTokens,
        topP: hookRequest.config.topP,
        topK: hookRequest.config.topK,
      };
    }

    return result;
  }

  /**
   * Convert genai SDK GenerateContentResponse to stable LLMResponse
   */
  toHookLLMResponse(sdkResponse: GenerateContentResponse): LLMResponse {
    return {
      text: sdkResponse.text,
      candidates: (sdkResponse.candidates || []).map((candidate) => ({
        content: {
          role: 'model' as const,
          parts:
            candidate.content?.parts?.map((part) => ({
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              text: (part as any)?.text,
            })) || [],
        },
        finishReason:
          candidate.finishReason as LLMResponse['candidates'][0]['finishReason'],
        index: candidate.index,
        safetyRatings: candidate.safetyRatings?.map((rating) => ({
          category: String(rating.category || ''),
          probability: String(rating.probability || ''),
        })),
      })),
      usageMetadata: sdkResponse.usageMetadata
        ? {
            promptTokenCount: sdkResponse.usageMetadata.promptTokenCount,
            candidatesTokenCount:
              sdkResponse.usageMetadata.candidatesTokenCount,
            totalTokenCount: sdkResponse.usageMetadata.totalTokenCount,
            cachedContentTokenCount:
              sdkResponse.usageMetadata.cachedContentTokenCount,
          }
        : undefined,
      promptFeedback: sdkResponse.promptFeedback
        ? {
            blockReason: String(sdkResponse.promptFeedback.blockReason || ''),
            safetyRatings: sdkResponse.promptFeedback.safetyRatings?.map(
              (rating) => ({
                category: String(rating.category || ''),
                probability: String(rating.probability || ''),
              }),
            ),
          }
        : undefined,
    };
  }

  /**
   * Convert stable LLMResponse to genai SDK GenerateContentResponse
   */
  fromHookLLMResponse(hookResponse: LLMResponse): GenerateContentResponse {
    return {
      text: hookResponse.text,
      candidates: hookResponse.candidates.map((candidate) => ({
        content: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          role: 'model' as any,
          parts: candidate.content.parts.map((part) => ({
            text: part.text,
          })),
        },
        finishReason: candidate.finishReason as FinishReason,
        index: candidate.index,
      })),
      usageMetadata: hookResponse.usageMetadata,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as GenerateContentResponse;
  }

  /**
   * Convert genai SDK ToolConfig to stable HookToolConfig
   */
  toHookToolConfig(sdkToolConfig: ToolConfig): HookToolConfig {
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mode: (sdkToolConfig as any).functionCallingConfig
        ?.mode as HookToolConfig['mode'],
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      allowedFunctionNames: (sdkToolConfig as any).functionCallingConfig
        ?.allowedFunctionNames,
    };
  }

  /**
   * Convert stable HookToolConfig to genai SDK ToolConfig
   */
  fromHookToolConfig(hookToolConfig: HookToolConfig): ToolConfig {
    return {
      functionCallingConfig: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        mode: hookToolConfig.mode as any,
        allowedFunctionNames: hookToolConfig.allowedFunctionNames,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any as ToolConfig;
  }
}

/**
 * Default translator instance for current GenAI SDK version
 */
export const defaultHookTranslator = new HookTranslatorGenAIv1();
