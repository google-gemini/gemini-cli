/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  Content,
  ContentListUnion,
  ContentUnion,
  GenerateContentConfig,
  GenerateContentParameters,
  CountTokensParameters,
  CountTokensResponse,
  GenerationConfigRoutingConfig,
  MediaResolution,
  Candidate,
  ModelSelectionConfig,
  GenerateContentResponsePromptFeedback,
  GenerateContentResponseUsageMetadata,
  Part,
  SafetySetting,
  PartUnion,
  SpeechConfigUnion,
  ThinkingConfig,
  ToolListUnion,
  ToolConfig,
} from '@google/genai';
import { GenerateContentResponse } from '@google/genai';

export interface CAGenerateContentRequest {
  model: string;
  project?: string;
  user_prompt_id?: string;
  request: VertexGenerateContentRequest;
}

interface VertexGenerateContentRequest {
  contents: Content[];
  systemInstruction?: Content;
  cachedContent?: string;
  tools?: ToolListUnion;
  toolConfig?: ToolConfig;
  labels?: Record<string, string>;
  safetySettings?: SafetySetting[];
  generationConfig?: VertexGenerationConfig;
  session_id?: string;
}

interface VertexGenerationConfig {
  temperature?: number;
  topP?: number;
  topK?: number;
  candidateCount?: number;
  maxOutputTokens?: number;
  stopSequences?: string[];
  responseLogprobs?: boolean;
  logprobs?: number;
  presencePenalty?: number;
  frequencyPenalty?: number;
  seed?: number;
  responseMimeType?: string;
  responseJsonSchema?: unknown;
  responseSchema?: unknown;
  routingConfig?: GenerationConfigRoutingConfig;
  modelSelectionConfig?: ModelSelectionConfig;
  responseModalities?: string[];
  mediaResolution?: MediaResolution;
  speechConfig?: SpeechConfigUnion;
  audioTimestamp?: boolean;
  thinkingConfig?: ThinkingConfig;
}

export interface CaGenerateContentResponse {
  response: VertexGenerateContentResponse;
}

interface VertexGenerateContentResponse {
  candidates: Candidate[];
  automaticFunctionCallingHistory?: Content[];
  promptFeedback?: GenerateContentResponsePromptFeedback;
  usageMetadata?: GenerateContentResponseUsageMetadata;
}

export interface CaCountTokenRequest {
  request: VertexCountTokenRequest;
}

interface VertexCountTokenRequest {
  model: string;
  contents: Content[];
}

export interface CaCountTokenResponse {
  totalTokens: number;
}

export function toCountTokenRequest(
  req: CountTokensParameters,
): CaCountTokenRequest {
  return {
    request: {
      model: 'models/' + req.model,
      contents: toContents(req.contents),
    },
  };
}

export function fromCountTokenResponse(
  res: CaCountTokenResponse,
): CountTokensResponse {
  return {
    totalTokens: res.totalTokens,
  };
}

export function toGenerateContentRequest(
  req: GenerateContentParameters,
  userPromptId: string,
  project?: string,
  sessionId?: string,
): CAGenerateContentRequest {
  return {
    model: req.model,
    project,
    user_prompt_id: userPromptId,
    request: toVertexGenerateContentRequest(req, sessionId),
  };
}

export function fromGenerateContentResponse(
  res: CaGenerateContentResponse,
): GenerateContentResponse {
  const inres = res.response;
  const out = new GenerateContentResponse();
  out.candidates = inres.candidates;
  out.automaticFunctionCallingHistory = inres.automaticFunctionCallingHistory;
  out.promptFeedback = inres.promptFeedback;
  out.usageMetadata = inres.usageMetadata;
  return out;
}

function toVertexGenerateContentRequest(
  req: GenerateContentParameters,
  sessionId?: string,
): VertexGenerateContentRequest {
  return {
    contents: toContents(req.contents),
    systemInstruction: maybeToContent(req.config?.systemInstruction),
    cachedContent: req.config?.cachedContent,
    tools: req.config?.tools,
    toolConfig: req.config?.toolConfig,
    labels: req.config?.labels,
    safetySettings: req.config?.safetySettings,
    generationConfig: toVertexGenerationConfig(req.config),
    session_id: sessionId,
  };
}

export function toContents(contents: ContentListUnion): Content[] {
  if (Array.isArray(contents)) {
    // it's a Content[] or a PartsUnion[]
    return contents.map(toContent);
  }
  // it's a Content or a PartsUnion
  return [toContent(contents)];
}

function maybeToContent(content?: ContentUnion): Content | undefined {
  if (!content) {
    return undefined;
  }
  return toContent(content);
}

function toContent(content: ContentUnion): Content {
  if (Array.isArray(content)) {
    // it's a PartsUnion[]
    return {
      role: 'user',
      parts: toParts(content),
    };
  }
  if (typeof content === 'string') {
    // it's a string
    return {
      role: 'user',
      parts: [{ text: content }],
    };
  }
  if ('parts' in content) {
    // it's a Content - process parts to handle thought filtering
    return {
      ...content,
      parts: content.parts
        ? toParts(content.parts.filter((p) => p != null))
        : [],
    };
  }
  // it's a Part
  return {
    role: 'user',
    parts: [toPart(content as Part)],
  };
}

function toParts(parts: PartUnion[]): Part[] {
  return parts.map(toPart);
}

function toPart(part: PartUnion): Part {
  if (typeof part === 'string') {
    // it's a string
    return { text: part };
  }

  // Handle thought parts for CountToken API compatibility
  // The CountToken API expects parts to have certain required "oneof" fields initialized,
  // but thought parts don't conform to this schema and cause API failures
  if ('thought' in part && part.thought) {
    const thoughtText = `[Thought: ${part.thought}]`;

    const newPart = { ...part };
    delete (newPart as Record<string, unknown>)['thought'];

    const hasApiContent =
      'functionCall' in newPart ||
      'functionResponse' in newPart ||
      'inlineData' in newPart ||
      'fileData' in newPart;

    if (hasApiContent) {
      // It's a functionCall or other non-text part. Just strip the thought.
      return newPart;
    }

    // If no other valid API content, this must be a text part.
    // Combine existing text (if any) with the thought, preserving other properties.
    const text = (newPart as { text?: unknown }).text;
    const existingText = text ? String(text) : '';
    const combinedText = existingText
      ? `${existingText}\n${thoughtText}`
      : thoughtText;

    return {
      ...newPart,
      text: combinedText,
    };
  }

  return part;
}

function toVertexGenerationConfig(
  config?: GenerateContentConfig,
): VertexGenerationConfig | undefined {
  if (!config) {
    return undefined;
  }
  return {
    temperature: config.temperature,
    topP: config.topP,
    topK: config.topK,
    candidateCount: config.candidateCount,
    maxOutputTokens: config.maxOutputTokens,
    stopSequences: config.stopSequences,
    responseLogprobs: config.responseLogprobs,
    logprobs: config.logprobs,
    presencePenalty: config.presencePenalty,
    frequencyPenalty: config.frequencyPenalty,
    seed: config.seed,
    responseMimeType: config.responseMimeType,
    responseSchema: config.responseSchema,
    responseJsonSchema: config.responseJsonSchema,
    routingConfig: config.routingConfig,
    modelSelectionConfig: config.modelSelectionConfig,
    responseModalities: config.responseModalities,
    mediaResolution: config.mediaResolution,
    speechConfig: config.speechConfig,
    audioTimestamp: config.audioTimestamp,
    thinkingConfig: config.thinkingConfig,
  };
}
