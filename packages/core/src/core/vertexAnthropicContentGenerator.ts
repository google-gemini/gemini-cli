/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import {
  FinishReason,
  GenerateContentResponse,
  ThinkingLevel,
  type Content,
  type CountTokensParameters,
  type CountTokensResponse,
  type EmbedContentResponse,
  type EmbedContentParameters,
  type FunctionCall,
  type GenerateContentConfig,
  type GenerateContentParameters,
  type GenerateContentResponseUsageMetadata,
  type Part,
  type ThinkingConfig,
  type Tool,
} from '@google/genai';
import { GoogleAuth } from 'google-auth-library';
import { Agent as UndiciAgent, ProxyAgent, type Dispatcher } from 'undici';
import { toContents } from '../code_assist/converter.js';
import type { LlmRole } from '../telemetry/llmRole.js';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';
import type { ContentGenerator } from './contentGenerator.js';

const CLOUD_PLATFORM_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';
const ANTHROPIC_VERTEX_VERSION = 'vertex-2023-10-16';
const ANTHROPIC_TOOL_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;
const ANTHROPIC_TOOL_NAME_MAX_LENGTH = 128;
const CLAUDE_THINKING_SIGNATURE_PREFIX = 'claude_thinking:';
const DEFAULT_CLAUDE_MAX_OUTPUT_TOKENS = 8192;
const CLAUDE_MAX_OUTPUT_TOKENS_128K = 128_000;

export function isClaudeVertexModel(model: string): boolean {
  const modelId = normalizeClaudeModelId(model);
  return modelId.startsWith('claude-');
}

type FetchInit = RequestInit & { dispatcher?: Dispatcher };
type FetchFn = (input: string | URL, init?: FetchInit) => Promise<Response>;

const defaultFetch: FetchFn = (input, init) => fetch(input, init);

interface GoogleAuthClientLike {
  getRequestHeaders(
    url?: string | URL,
  ): Promise<Headers | Record<string, string>>;
}

interface GoogleAuthLike {
  getClient(): Promise<GoogleAuthClientLike>;
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

interface AnthropicThinkingBlock {
  type: 'thinking';
  thinking: string;
  signature?: string;
}

interface AnthropicRedactedThinkingBlock {
  type: 'redacted_thinking';
  data: string;
}

type AnthropicThinkingLikeBlock =
  | AnthropicThinkingBlock
  | AnthropicRedactedThinkingBlock;

interface AnthropicMediaBlock {
  type: 'image' | 'document';
  source: {
    type: 'base64';
    media_type: string;
    data: string;
  };
}

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

interface AnthropicToolResultBlock {
  type: 'tool_result';
  tool_use_id: string;
  content: string;
  is_error?: boolean;
}

type AnthropicContentBlock =
  | AnthropicTextBlock
  | AnthropicThinkingBlock
  | AnthropicRedactedThinkingBlock
  | AnthropicMediaBlock
  | AnthropicToolUseBlock
  | AnthropicToolResultBlock;

interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: AnthropicContentBlock[];
}

interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: unknown;
}

interface AnthropicMessageRequest {
  anthropic_version: typeof ANTHROPIC_VERTEX_VERSION;
  messages: AnthropicMessage[];
  model?: string;
  system?: string;
  max_tokens?: number;
  temperature?: number;
  stop_sequences?: string[];
  tools?: AnthropicTool[];
  tool_choice?: unknown;
  stream?: boolean;
  thinking?:
    | {
        type: 'adaptive';
        display?: 'summarized' | 'omitted';
      }
    | {
        type: 'enabled';
        budget_tokens: number;
        display?: 'summarized' | 'omitted';
      };
  output_config?: {
    effort?: AnthropicEffort;
  };
}

type AnthropicEffort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

interface AnthropicUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
}

interface AnthropicMessageResponse {
  id?: string;
  model?: string;
  content?: AnthropicContentBlock[];
  stop_reason?: string | null;
  usage?: AnthropicUsage;
}

type AnthropicStreamEvent =
  | {
      type: 'message_start';
      message?: AnthropicMessageResponse;
    }
  | {
      type: 'content_block_start';
      index?: number;
      content_block?: AnthropicContentBlock;
    }
  | {
      type: 'content_block_delta';
      index?: number;
      delta?: {
        type?: string;
        text?: string;
        partial_json?: string;
        thinking?: string;
        signature?: string;
      };
    }
  | {
      type: 'content_block_stop';
      index?: number;
    }
  | {
      type: 'message_delta';
      delta?: {
        stop_reason?: string | null;
      };
      usage?: AnthropicUsage;
    }
  | {
      type: 'message_stop' | 'ping';
    };

type AnthropicStreamPayload = AnthropicStreamEvent | AnthropicMessageResponse;

export interface VertexAnthropicContentGeneratorOptions {
  projectId?: string;
  location?: string;
  baseUrl?: string;
  headers?: Record<string, string>;
  proxy?: string;
  auth?: GoogleAuthLike;
  fetchFn?: FetchFn;
}

interface ActiveToolUse {
  id: string;
  name: string;
  inputJson: string;
  thinkingSignature?: string;
}

class ToolNameMapper {
  private readonly originalToAnthropic = new Map<string, string>();
  private readonly anthropicToOriginal = new Map<string, string>();

  constructor(tools?: GenerateContentConfig['tools']) {
    const names = this.collectToolNames(tools);
    names.sort(
      (a, b) =>
        Number(!isAnthropicToolName(a)) - Number(!isAnthropicToolName(b)),
    );
    for (const name of names) {
      this.register(name);
    }
  }

  toAnthropicName(name: string | undefined): string {
    return this.register(name?.trim() || 'unknown_tool');
  }

  toGeminiName(name: string): string {
    return this.anthropicToOriginal.get(name) ?? name;
  }

  private collectToolNames(tools?: GenerateContentConfig['tools']): string[] {
    if (!Array.isArray(tools)) {
      return [];
    }

    const names = new Set<string>();
    for (const tool of tools) {
      if (!isFunctionDeclarationTool(tool)) {
        continue;
      }
      for (const declaration of tool.functionDeclarations ?? []) {
        if (declaration.name) {
          names.add(declaration.name);
        }
      }
    }
    return [...names];
  }

  private register(originalName: string): string {
    const existing = this.originalToAnthropic.get(originalName);
    if (existing) {
      return existing;
    }

    const baseName = sanitizeAnthropicToolName(originalName);
    let anthropicName = baseName;
    const existingOriginal = this.anthropicToOriginal.get(anthropicName);
    if (existingOriginal && existingOriginal !== originalName) {
      anthropicName = appendToolNameHash(baseName, originalName);
    }

    this.originalToAnthropic.set(originalName, anthropicName);
    this.anthropicToOriginal.set(anthropicName, originalName);
    return anthropicName;
  }
}

export class VertexAnthropicContentGenerator implements ContentGenerator {
  private readonly auth: GoogleAuthLike;
  private readonly location: string;
  private readonly baseUrl?: string;
  private readonly baseHeaders: Record<string, string>;
  private readonly dispatcher: Dispatcher;
  private readonly fetchFn: FetchFn;
  private readonly explicitProjectId?: string;

  constructor(options: VertexAnthropicContentGeneratorOptions = {}) {
    this.explicitProjectId =
      options.projectId ||
      process.env['GOOGLE_CLOUD_PROJECT'] ||
      process.env['GOOGLE_CLOUD_PROJECT_ID'] ||
      undefined;
    this.location =
      options.location || process.env['GOOGLE_CLOUD_LOCATION'] || 'global';
    this.baseUrl = options.baseUrl;
    this.baseHeaders = options.headers ?? {};
    this.auth =
      options.auth ??
      new GoogleAuth({
        scopes: [CLOUD_PLATFORM_SCOPE],
        projectId: this.explicitProjectId,
      });

    const dispatcherOptions = {
      headersTimeout: 60000,
      bodyTimeout: 0,
    };
    this.dispatcher = options.proxy
      ? new ProxyAgent({ uri: options.proxy.trim(), ...dispatcherOptions })
      : new UndiciAgent(dispatcherOptions);

    this.fetchFn = options.fetchFn ?? defaultFetch;
  }

  async generateContent(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<GenerateContentResponse> {
    const toolNameMapper = new ToolNameMapper(request.config?.tools);
    const body = this.toAnthropicRequest(request, toolNameMapper);
    const response = await this.postJson(
      this.buildModelUrl(request.model, 'rawPredict'),
      body,
      request.config?.abortSignal,
    );
    const json = await readJson(response);
    return this.anthropicMessageToResponse(
      toAnthropicMessageResponse(json),
      request.model,
      toolNameMapper,
    );
  }

  async generateContentStream(
    request: GenerateContentParameters,
    _userPromptId: string,
    _role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const toolNameMapper = new ToolNameMapper(request.config?.tools);
    const body = this.toAnthropicRequest(request, toolNameMapper);
    body.stream = true;
    const response = await this.postJson(
      this.buildModelUrl(request.model, 'streamRawPredict'),
      body,
      request.config?.abortSignal,
    );
    return this.streamAnthropicResponse(
      response,
      request.model,
      toolNameMapper,
    );
  }

  async countTokens(
    request: CountTokensParameters,
  ): Promise<CountTokensResponse> {
    try {
      const toolNameMapper = new ToolNameMapper(request.config?.tools);
      const body: AnthropicMessageRequest = {
        ...this.toAnthropicRequest(
          {
            model: request.model,
            contents: request.contents,
            config: request.config,
          },
          toolNameMapper,
        ),
        model: normalizeClaudeModelId(request.model),
      };
      delete body.max_tokens;

      const response = await this.postJson(
        this.buildModelUrl('count-tokens', 'rawPredict'),
        body,
        undefined,
      );
      const json = await readJson(response);
      return {
        totalTokens:
          tokenCountFromResponse(json) ?? this.estimateTokens(request),
      };
    } catch {
      return { totalTokens: this.estimateTokens(request) };
    }
  }

  async embedContent(
    _request: EmbedContentParameters,
  ): Promise<EmbedContentResponse> {
    throw new Error(
      'Claude models on Vertex AI do not support embeddings. Use a Gemini embedding model for embedContent requests.',
    );
  }

  private async postJson(
    url: string,
    body: AnthropicMessageRequest,
    signal: AbortSignal | undefined,
  ): Promise<Response> {
    const authHeaders = await this.getAuthHeaders(url);
    const response = await this.fetchFn(url, {
      method: 'POST',
      headers: {
        ...this.baseHeaders,
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal,
      dispatcher: this.dispatcher,
    });

    if (!response.ok) {
      throw await this.toApiError(response);
    }

    return response;
  }

  private async getAuthHeaders(url: string): Promise<Record<string, string>> {
    const client = await this.auth.getClient();
    const headers = await client.getRequestHeaders(url);
    return headersToRecord(headers);
  }

  private async toApiError(response: Response): Promise<Error> {
    const body = await response.text().catch(() => '');
    const message = body
      ? `Claude Vertex AI request failed: ${response.status} ${response.statusText}: ${body}`
      : `Claude Vertex AI request failed: ${response.status} ${response.statusText}`;
    const error = new Error(message);
    Object.assign(error, { status: response.status });
    return error;
  }

  private buildServiceBaseUrl(): string {
    if (this.baseUrl) {
      const trimmed = this.baseUrl.replace(/\/+$/, '');
      return /\/v\d+(beta\d+)?$/.test(trimmed) ? trimmed : `${trimmed}/v1`;
    }

    if (this.location === 'global') {
      return 'https://aiplatform.googleapis.com/v1';
    }
    if (this.location === 'us' || this.location === 'eu') {
      return `https://aiplatform.${this.location}.rep.googleapis.com/v1`;
    }
    return `https://${this.location}-aiplatform.googleapis.com/v1`;
  }

  private buildModelUrl(
    model: string,
    method: 'rawPredict' | 'streamRawPredict',
  ) {
    const modelId = encodeURIComponent(normalizeClaudeModelId(model));
    return `${this.buildServiceBaseUrl()}/projects/${this.getProjectIdSyncPlaceholder()}/locations/${this.location}/publishers/anthropic/models/${modelId}:${method}`;
  }

  private getProjectIdSyncPlaceholder(): string {
    if (!this.explicitProjectId) {
      throw new Error(
        'GOOGLE_CLOUD_PROJECT or GOOGLE_CLOUD_PROJECT_ID is required for Claude models on Vertex AI.',
      );
    }
    return encodeURIComponent(this.explicitProjectId);
  }

  private toAnthropicRequest(
    request: Pick<GenerateContentParameters, 'model' | 'contents' | 'config'>,
    toolNameMapper: ToolNameMapper,
  ): AnthropicMessageRequest {
    const config = request.config;
    const body: AnthropicMessageRequest = {
      anthropic_version: ANTHROPIC_VERTEX_VERSION,
      messages: mergeAdjacentMessages(
        toContents(request.contents).map((content) =>
          contentToAnthropicMessage(content, toolNameMapper),
        ),
      ),
      max_tokens:
        config?.maxOutputTokens ?? defaultMaxOutputTokens(request.model),
    };

    const system = contentUnionText(config?.systemInstruction);
    if (system) {
      body.system = system;
    }
    if (
      config?.temperature !== undefined &&
      !omitsSamplingParameters(request.model)
    ) {
      body.temperature = config.temperature;
    }
    if (config?.stopSequences?.length) {
      body.stop_sequences = config.stopSequences;
    }

    const thinking = toAnthropicThinking(request.model, config);
    if (thinking?.thinking) {
      body.thinking = thinking.thinking;
    }
    if (thinking?.output_config) {
      body.output_config = thinking.output_config;
    }

    const tools = toAnthropicTools(config?.tools, toolNameMapper);
    if (tools.length > 0) {
      body.tools = tools;
      body.tool_choice = toAnthropicToolChoice(
        config,
        toolNameMapper,
        body.thinking !== undefined,
      );
    }

    if (body.thinking?.type === 'enabled') {
      const thinkingBudget = body.thinking.budget_tokens;
      body.max_tokens = Math.max(body.max_tokens ?? 0, thinkingBudget + 1024);
    }

    return body;
  }

  private anthropicMessageToResponse(
    message: AnthropicMessageResponse,
    fallbackModel: string,
    toolNameMapper: ToolNameMapper,
  ): GenerateContentResponse {
    return createGeminiResponse({
      parts: anthropicBlocksToGeminiParts(
        message.content ?? [],
        toolNameMapper,
      ),
      finishReason: mapAnthropicStopReason(message.stop_reason),
      usage: message.usage,
      responseId: message.id,
      modelVersion: message.model ?? fallbackModel,
    });
  }

  private async *streamAnthropicResponse(
    response: Response,
    fallbackModel: string,
    toolNameMapper: ToolNameMapper,
  ): AsyncGenerator<GenerateContentResponse> {
    if (!response.body) {
      throw new Error(
        'Claude Vertex AI streaming response did not include a body.',
      );
    }

    const activeTools = new Map<number, ActiveToolUse>();
    const activeThinking = new Map<number, AnthropicThinkingLikeBlock>();
    let pendingThinkingBlocks: AnthropicThinkingLikeBlock[] = [];
    let messageId: string | undefined;
    let modelVersion: string | undefined;
    let inputTokens: number | undefined;
    let lastUsage: AnthropicUsage | undefined;

    for await (const event of parseSse(response.body)) {
      if (isAnthropicMessageResponse(event)) {
        yield this.anthropicMessageToResponse(
          event,
          fallbackModel,
          toolNameMapper,
        );
        continue;
      }

      if (event.type === 'message_start') {
        messageId = event.message?.id;
        modelVersion = event.message?.model;
        inputTokens = event.message?.usage?.input_tokens;
        continue;
      }

      if (event.type === 'content_block_start') {
        const block = event.content_block;
        if (
          event.index !== undefined &&
          (block?.type === 'thinking' || block?.type === 'redacted_thinking')
        ) {
          activeThinking.set(event.index, { ...block });
          if (block.type === 'thinking' && block.thinking) {
            yield createGeminiResponse({
              parts: [{ text: block.thinking, thought: true }],
              responseId: messageId,
              modelVersion: modelVersion ?? fallbackModel,
            });
          }
          continue;
        }

        if (event.index !== undefined && block?.type === 'tool_use') {
          const thinkingSignature = encodeClaudeThinkingBlocks(
            pendingThinkingBlocks,
          );
          pendingThinkingBlocks = [];
          activeTools.set(event.index, {
            id: block.id,
            name: toolNameMapper.toGeminiName(block.name),
            inputJson: isEmptyObject(block.input)
              ? ''
              : JSON.stringify(block.input ?? {}),
            thinkingSignature,
          });
          continue;
        }

        if (block?.type === 'text' && block.text) {
          yield createGeminiResponse({
            parts: [{ text: block.text }],
            responseId: messageId,
            modelVersion: modelVersion ?? fallbackModel,
          });
        }
        continue;
      }

      if (event.type === 'content_block_delta') {
        const activeThought =
          event.index === undefined
            ? undefined
            : activeThinking.get(event.index);
        if (activeThought?.type === 'thinking' && event.delta?.thinking) {
          activeThought.thinking += event.delta.thinking;
          yield createGeminiResponse({
            parts: [{ text: event.delta.thinking, thought: true }],
            responseId: messageId,
            modelVersion: modelVersion ?? fallbackModel,
          });
          continue;
        }
        if (activeThought?.type === 'thinking' && event.delta?.signature) {
          activeThought.signature = event.delta.signature;
          continue;
        }

        const activeTool =
          event.index === undefined ? undefined : activeTools.get(event.index);
        if (activeTool && event.delta?.partial_json) {
          activeTool.inputJson += event.delta.partial_json;
          continue;
        }

        if (event.delta?.text) {
          yield createGeminiResponse({
            parts: [{ text: event.delta.text }],
            responseId: messageId,
            modelVersion: modelVersion ?? fallbackModel,
          });
        }
        continue;
      }

      if (event.type === 'content_block_stop') {
        const activeThought =
          event.index === undefined
            ? undefined
            : activeThinking.get(event.index);
        if (activeThought) {
          activeThinking.delete(event.index!);
          pendingThinkingBlocks.push(activeThought);
          continue;
        }

        const activeTool =
          event.index === undefined ? undefined : activeTools.get(event.index);
        if (!activeTool) {
          continue;
        }
        activeTools.delete(event.index!);
        yield createGeminiResponse({
          parts: [
            createFunctionCallPart(
              activeTool.id,
              activeTool.name,
              parseJsonObject(activeTool.inputJson),
              activeTool.thinkingSignature,
            ),
          ],
          responseId: messageId,
          modelVersion: modelVersion ?? fallbackModel,
        });
        continue;
      }

      if (event.type === 'message_delta') {
        lastUsage = {
          ...lastUsage,
          input_tokens: inputTokens,
          ...event.usage,
        };
        if (event.delta?.stop_reason) {
          yield createGeminiResponse({
            parts: [],
            finishReason: mapAnthropicStopReason(event.delta.stop_reason),
            usage: lastUsage,
            responseId: messageId,
            modelVersion: modelVersion ?? fallbackModel,
          });
        }
      }
    }
  }

  private estimateTokens(request: CountTokensParameters): number {
    const contents = toContents(request.contents);
    let total = 0;
    for (const content of contents) {
      total += estimateTokenCountSync(content.parts ?? []);
    }
    if (request.config) {
      total += Math.floor(JSON.stringify(request.config).length / 4);
    }
    return total;
  }
}

export class VertexAiContentGeneratorRouter implements ContentGenerator {
  constructor(
    private readonly geminiGenerator: ContentGenerator,
    private readonly claudeGenerator: ContentGenerator,
  ) {}

  get userTier() {
    return this.geminiGenerator.userTier;
  }

  get userTierName() {
    return this.geminiGenerator.userTierName;
  }

  get paidTier() {
    return this.geminiGenerator.paidTier;
  }

  generateContent(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<GenerateContentResponse> {
    return this.generatorForModel(request.model).generateContent(
      request,
      userPromptId,
      role,
    );
  }

  generateContentStream(
    request: GenerateContentParameters,
    userPromptId: string,
    role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    return this.generatorForModel(request.model).generateContentStream(
      request,
      userPromptId,
      role,
    );
  }

  countTokens(request: CountTokensParameters): Promise<CountTokensResponse> {
    return this.generatorForModel(request.model).countTokens(request);
  }

  embedContent(request: EmbedContentParameters): Promise<EmbedContentResponse> {
    return this.generatorForModel(request.model).embedContent(request);
  }

  private generatorForModel(model: string): ContentGenerator {
    return isClaudeVertexModel(model)
      ? this.claudeGenerator
      : this.geminiGenerator;
  }
}

async function readJson(response: Response): Promise<unknown> {
  const value: unknown = await response.json();
  return value;
}

function toAnthropicMessageResponse(value: unknown): AnthropicMessageResponse {
  if (!isRecord(value)) {
    return {};
  }

  const stopReason = value['stop_reason'];
  return {
    id: stringField(value, 'id'),
    model: stringField(value, 'model'),
    stop_reason:
      typeof stopReason === 'string' || stopReason === null
        ? stopReason
        : undefined,
    usage: toAnthropicUsage(value['usage']),
    content: Array.isArray(value['content'])
      ? value['content'].filter(isAnthropicContentBlock)
      : undefined,
  };
}

function toAnthropicUsage(value: unknown): AnthropicUsage | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    input_tokens: numberField(value, 'input_tokens'),
    output_tokens: numberField(value, 'output_tokens'),
    cache_creation_input_tokens: numberField(
      value,
      'cache_creation_input_tokens',
    ),
    cache_read_input_tokens: numberField(value, 'cache_read_input_tokens'),
  };
}

function tokenCountFromResponse(value: unknown): number | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const direct =
    numberField(value, 'input_tokens') ??
    numberField(value, 'total_tokens') ??
    numberField(value, 'token_count');
  if (direct !== undefined) {
    return direct;
  }

  const usage = value['usage'];
  if (!isRecord(usage)) {
    return undefined;
  }
  return (
    numberField(usage, 'input_tokens') ?? numberField(usage, 'total_tokens')
  );
}

function normalizeClaudeModelId(model: string): string {
  const trimmed = model.trim();
  const match = trimmed.match(/(?:^|\/)models\/([^/]+)$/);
  return match ? decodeURIComponent(match[1]) : trimmed;
}

function isAnthropicToolName(name: string): boolean {
  return ANTHROPIC_TOOL_NAME_PATTERN.test(name);
}

function sanitizeAnthropicToolName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'tool';
  if (sanitized.length <= ANTHROPIC_TOOL_NAME_MAX_LENGTH) {
    return sanitized;
  }
  return appendToolNameHash(sanitized, name);
}

function appendToolNameHash(baseName: string, hashSource: string): string {
  const suffix = `_${createHash('sha256').update(hashSource).digest('hex').slice(0, 8)}`;
  return `${baseName.slice(
    0,
    ANTHROPIC_TOOL_NAME_MAX_LENGTH - suffix.length,
  )}${suffix}`;
}

function encodeClaudeThinkingBlocks(
  blocks: AnthropicThinkingLikeBlock[],
): string | undefined {
  const preservedBlocks = blocks.filter(isPreservableThinkingBlock);
  if (preservedBlocks.length === 0) {
    return undefined;
  }

  return `${CLAUDE_THINKING_SIGNATURE_PREFIX}${Buffer.from(
    JSON.stringify(preservedBlocks),
    'utf8',
  ).toString('base64url')}`;
}

function decodeClaudeThinkingBlocks(
  thoughtSignature: string | undefined,
): AnthropicThinkingLikeBlock[] {
  if (!thoughtSignature?.startsWith(CLAUDE_THINKING_SIGNATURE_PREFIX)) {
    return [];
  }

  try {
    const encoded = thoughtSignature.slice(
      CLAUDE_THINKING_SIGNATURE_PREFIX.length,
    );
    const parsed = JSON.parse(
      Buffer.from(encoded, 'base64url').toString('utf8'),
    ) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isAnthropicThinkingLikeBlock);
  } catch {
    return [];
  }
}

function headersToRecord(headers: Headers | Record<string, string>) {
  const result: Record<string, string> = {};
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      result[key] = value;
    });
    return result;
  }

  for (const [key, value] of Object.entries(headers)) {
    result[key] = String(value);
  }
  return result;
}

function contentToAnthropicMessage(
  content: Content,
  toolNameMapper: ToolNameMapper,
): AnthropicMessage {
  const role = content.role === 'model' ? 'assistant' : 'user';
  const blocks = (content.parts ?? []).flatMap((part) =>
    partToAnthropicBlocks(part, role, toolNameMapper),
  );
  return {
    role,
    content: blocks.length > 0 ? blocks : [{ type: 'text', text: ' ' }],
  };
}

function partToAnthropicBlocks(
  part: Part,
  role: AnthropicMessage['role'],
  toolNameMapper: ToolNameMapper,
): AnthropicContentBlock[] {
  if (part.text !== undefined) {
    return [{ type: 'text', text: part.text }];
  }

  if (part.inlineData?.data && part.inlineData.mimeType) {
    if (part.inlineData.mimeType.startsWith('image/')) {
      return [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: part.inlineData.mimeType,
            data: part.inlineData.data,
          },
        },
      ];
    }
    if (part.inlineData.mimeType === 'application/pdf') {
      return [
        {
          type: 'document',
          source: {
            type: 'base64',
            media_type: part.inlineData.mimeType,
            data: part.inlineData.data,
          },
        },
      ];
    }
    return [
      {
        type: 'text',
        text: `[Unsupported inlineData MIME type for Claude on Vertex AI: ${part.inlineData.mimeType}]`,
      },
    ];
  }

  if (part.fileData) {
    throw new Error(
      'fileData URL inputs are not supported for Claude on Vertex AI. Use inlineData instead.',
    );
  }

  if (part.functionCall) {
    if (role !== 'assistant') {
      return [];
    }
    return [
      ...decodeClaudeThinkingBlocks(
        (part as { thoughtSignature?: string }).thoughtSignature,
      ),
      {
        type: 'tool_use',
        id: part.functionCall.id ?? makeToolUseId(part.functionCall),
        name: toolNameMapper.toAnthropicName(part.functionCall.name),
        input: part.functionCall.args ?? {},
      },
    ];
  }

  if (part.functionResponse) {
    const response = part.functionResponse.response ?? {};
    return [
      {
        type: 'tool_result',
        tool_use_id:
          part.functionResponse.id ??
          `${part.functionResponse.name ?? 'unknown_tool'}_result`,
        content: functionResponseContent(response),
        is_error: response['error'] !== undefined ? true : undefined,
      },
    ];
  }

  return [];
}

function mergeAdjacentMessages(
  messages: AnthropicMessage[],
): AnthropicMessage[] {
  const merged: AnthropicMessage[] = [];
  for (const message of messages) {
    const previous = merged[merged.length - 1];
    if (previous?.role === message.role) {
      previous.content.push(...message.content);
    } else {
      merged.push({ role: message.role, content: [...message.content] });
    }
  }
  return merged;
}

function contentUnionText(content: GenerateContentConfig['systemInstruction']) {
  if (!content) {
    return undefined;
  }
  return toContents(content)
    .flatMap((item) => item.parts ?? [])
    .map((part) => part.text)
    .filter((text): text is string => text !== undefined && text !== '')
    .join('\n');
}

function toAnthropicTools(
  tools?: GenerateContentConfig['tools'],
  toolNameMapper?: ToolNameMapper,
): AnthropicTool[] {
  if (!Array.isArray(tools)) {
    return [];
  }
  return tools.flatMap((tool) => {
    if (!isFunctionDeclarationTool(tool)) {
      return [];
    }
    return (tool.functionDeclarations ?? [])
      .filter((fn) => fn.name)
      .map((fn) => ({
        name: toolNameMapper?.toAnthropicName(fn.name) ?? fn.name!,
        description: fn.description,
        input_schema: toJsonSchema(fn.parametersJsonSchema ?? fn.parameters),
      }));
  });
}

function isFunctionDeclarationTool(tool: unknown): tool is Tool {
  return isRecord(tool) && Array.isArray(tool['functionDeclarations']);
}

function toAnthropicThinking(
  model: string,
  config: GenerateContentConfig | undefined,
): Pick<AnthropicMessageRequest, 'thinking' | 'output_config'> | undefined {
  const thinkingConfig = config?.thinkingConfig;
  if (!thinkingConfig || thinkingConfig.thinkingBudget === 0) {
    return undefined;
  }

  const thinkingRequested =
    thinkingConfig.includeThoughts === true ||
    (thinkingConfig.thinkingBudget !== undefined &&
      thinkingConfig.thinkingBudget !== 0) ||
    (thinkingConfig.thinkingLevel !== undefined &&
      thinkingConfig.thinkingLevel !==
        ThinkingLevel.THINKING_LEVEL_UNSPECIFIED);

  if (!thinkingRequested) {
    return undefined;
  }

  const display =
    thinkingConfig.includeThoughts === true ? 'summarized' : undefined;

  if (supportsAdaptiveThinking(model)) {
    return {
      thinking: {
        type: 'adaptive',
        ...(display ? { display } : {}),
      },
      output_config: toAnthropicOutputConfig(thinkingConfig.thinkingLevel),
    };
  }

  const thinkingBudget = thinkingConfig.thinkingBudget;
  if (thinkingBudget === undefined || thinkingBudget <= 0) {
    return undefined;
  }

  return {
    thinking: {
      type: 'enabled',
      budget_tokens: thinkingBudget,
      ...(display ? { display } : {}),
    },
  };
}

function toAnthropicOutputConfig(
  thinkingLevel: ThinkingConfig['thinkingLevel'],
): AnthropicMessageRequest['output_config'] | undefined {
  if (thinkingLevel === ThinkingLevel.LOW) {
    return { effort: 'low' };
  }
  if (thinkingLevel === ThinkingLevel.HIGH) {
    return { effort: 'high' };
  }
  return undefined;
}

function supportsAdaptiveThinking(model: string): boolean {
  const modelId = normalizeClaudeModelId(model);
  return (
    modelId === 'claude-opus-4-8' ||
    modelId === 'claude-opus-4-7' ||
    modelId === 'claude-opus-4-6' ||
    modelId === 'claude-sonnet-4-6' ||
    modelId === 'claude-mythos-preview'
  );
}

function defaultMaxOutputTokens(model: string): number {
  const modelId = normalizeClaudeModelId(model).toLowerCase();
  if (
    modelId.includes('claude-opus-4-8') ||
    modelId.includes('claude-opus-4-7') ||
    modelId.includes('claude-opus-4-6')
  ) {
    return CLAUDE_MAX_OUTPUT_TOKENS_128K;
  }
  if (modelId.includes('claude-opus-4-5')) {
    return 64_000;
  }
  if (modelId.includes('claude-opus-4')) {
    return 32_000;
  }
  return DEFAULT_CLAUDE_MAX_OUTPUT_TOKENS;
}

function omitsSamplingParameters(model: string): boolean {
  const modelId = normalizeClaudeModelId(model);
  return modelId === 'claude-opus-4-8' || modelId === 'claude-opus-4-7';
}

function toAnthropicToolChoice(
  config: GenerateContentConfig | undefined,
  toolNameMapper: ToolNameMapper,
  thinkingEnabled: boolean,
): unknown {
  const functionCallingConfig = config?.toolConfig?.functionCallingConfig;
  const mode = functionCallingConfig?.mode;
  if (mode === 'NONE') {
    return { type: 'none' };
  }
  if (thinkingEnabled) {
    return { type: 'auto' };
  }
  if (mode === 'ANY') {
    const allowedNames = functionCallingConfig?.allowedFunctionNames ?? [];
    if (allowedNames.length === 1) {
      return {
        type: 'tool',
        name: toolNameMapper.toAnthropicName(allowedNames[0]),
      };
    }
    return { type: 'any' };
  }
  return { type: 'auto' };
}

function toJsonSchema(schema: unknown): unknown {
  return toAnthropicInputSchema(normalizeJsonSchema(schema, schema, new Set()));
}

function normalizeJsonSchema(
  schema: unknown,
  root: unknown,
  resolvingRefs: Set<string>,
): unknown {
  if (typeof schema === 'boolean') {
    return schema;
  }
  if (!isRecord(schema)) {
    return {};
  }

  const ref = stringField(schema, '$ref');
  if (ref?.startsWith('#/') && !resolvingRefs.has(ref)) {
    const target = resolveJsonPointer(root, ref);
    if (target !== undefined) {
      resolvingRefs.add(ref);
      const normalizedTarget = normalizeJsonSchema(target, root, resolvingRefs);
      resolvingRefs.delete(ref);

      const siblings = Object.fromEntries(
        Object.entries(schema).filter(
          ([key]) =>
            key !== '$ref' &&
            key !== '$schema' &&
            key !== '$defs' &&
            key !== 'definitions',
        ),
      );
      if (Object.keys(siblings).length === 0) {
        return normalizedTarget;
      }
      if (isRecord(normalizedTarget)) {
        return normalizeJsonSchema(
          { ...normalizedTarget, ...siblings },
          root,
          resolvingRefs,
        );
      }
    }
  }

  const nullable = schema['nullable'] === true;
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === '$schema' || key === 'propertyOrdering' || key === 'nullable') {
      continue;
    }
    if (key === 'type') {
      const normalizedType = normalizeJsonSchemaType(value);
      if (normalizedType !== undefined) {
        output[key] = normalizedType;
      }
      continue;
    }
    if (
      key === 'properties' ||
      key === 'patternProperties' ||
      key === '$defs' ||
      key === 'definitions' ||
      key === 'dependentSchemas'
    ) {
      if (isRecord(value)) {
        output[key] = Object.fromEntries(
          Object.entries(value).map(([property, propertySchema]) => [
            property,
            normalizeJsonSchema(propertySchema, root, resolvingRefs),
          ]),
        );
      }
      continue;
    }
    if (
      key === 'items' ||
      key === 'contains' ||
      key === 'additionalProperties' ||
      key === 'unevaluatedProperties' ||
      key === 'propertyNames' ||
      key === 'not' ||
      key === 'if' ||
      key === 'then' ||
      key === 'else'
    ) {
      output[key] =
        typeof value === 'boolean'
          ? value
          : normalizeJsonSchema(value, root, resolvingRefs);
      continue;
    }
    if (key === 'prefixItems') {
      if (Array.isArray(value)) {
        output[key] = value.map((item) =>
          normalizeJsonSchema(item, root, resolvingRefs),
        );
      }
      continue;
    }
    if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
      if (Array.isArray(value) && value.length > 0) {
        output[key] = value.map((item) =>
          normalizeJsonSchema(item, root, resolvingRefs),
        );
      }
      continue;
    }
    if (key === 'required') {
      if (Array.isArray(value)) {
        const required = Array.from(
          new Set(
            value.filter((item): item is string => typeof item === 'string'),
          ),
        );
        if (required.length > 0) {
          output[key] = required;
        }
      }
      continue;
    }
    if (key === 'dependentRequired') {
      if (isRecord(value)) {
        output[key] = Object.fromEntries(
          Object.entries(value)
            .map(([property, dependencies]) => [
              property,
              Array.isArray(dependencies)
                ? Array.from(
                    new Set(
                      dependencies.filter(
                        (item): item is string => typeof item === 'string',
                      ),
                    ),
                  )
                : undefined,
            ])
            .filter(
              (entry): entry is [string, string[]] => entry[1] !== undefined,
            ),
        );
      }
      continue;
    }
    output[key] = value;
  }

  if (nullable) {
    addNullToSchema(output);
  }

  return output;
}

function toAnthropicInputSchema(schema: unknown): unknown {
  if (!isRecord(schema)) {
    return {
      type: 'object',
      properties: {},
      additionalProperties: true,
    };
  }

  const type = schema['type'];
  if (type === undefined) {
    return {
      type: 'object',
      properties: {},
      additionalProperties: true,
      ...schema,
    };
  }
  if (type === 'object' || (Array.isArray(type) && type.includes('object'))) {
    return schema['properties'] === undefined
      ? { ...schema, properties: {} }
      : schema;
  }

  return {
    type: 'object',
    properties: {},
    additionalProperties: true,
  };
}

function normalizeJsonSchemaType(
  value: unknown,
): string | string[] | undefined {
  const validTypes = new Set([
    'array',
    'boolean',
    'integer',
    'null',
    'number',
    'object',
    'string',
  ]);
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    return validTypes.has(normalized) ? normalized : undefined;
  }
  if (Array.isArray(value)) {
    const normalized = Array.from(
      new Set(
        value
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.toLowerCase())
          .filter((item) => validTypes.has(item)),
      ),
    );
    return normalized.length > 0 ? normalized : undefined;
  }
  return undefined;
}

function addNullToSchema(schema: Record<string, unknown>) {
  const type = schema['type'];
  if (typeof type === 'string') {
    schema['type'] = Array.from(new Set([type, 'null']));
    return;
  }
  if (Array.isArray(type)) {
    schema['type'] = Array.from(
      new Set([
        ...type.filter((item): item is string => typeof item === 'string'),
        'null',
      ]),
    );
    return;
  }

  const nonNullable = { ...schema };
  schema['anyOf'] = [nonNullable, { type: 'null' }];
}

function resolveJsonPointer(root: unknown, pointer: string): unknown {
  const segments = pointer
    .slice(2)
    .split('/')
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current = root;
  for (const segment of segments) {
    current = jsonPointerSegmentValue(current, segment);
    if (current === undefined) return undefined;
  }
  return current;
}

function jsonPointerSegmentValue(value: unknown, segment: string): unknown {
  if (Array.isArray(value)) {
    const index = Number(segment);
    return Number.isInteger(index) ? value[index] : undefined;
  }
  return isRecord(value) ? value[segment] : undefined;
}

function anthropicBlockToGeminiPart(
  block: AnthropicContentBlock,
  toolNameMapper: ToolNameMapper,
): Part[] {
  if (block.type === 'text') {
    return block.text ? [{ text: block.text }] : [];
  }
  if (block.type === 'thinking') {
    return block.thinking ? [{ text: block.thinking, thought: true }] : [];
  }
  if (block.type === 'redacted_thinking') {
    return [];
  }
  if (block.type === 'tool_use') {
    return [
      {
        functionCall: {
          id: block.id,
          name: toolNameMapper.toGeminiName(block.name),
          args: parseJsonObject(JSON.stringify(block.input ?? {})),
        },
      },
    ];
  }
  return [];
}

function anthropicBlocksToGeminiParts(
  blocks: AnthropicContentBlock[],
  toolNameMapper: ToolNameMapper,
): Part[] {
  const parts: Part[] = [];
  let pendingThinkingBlocks: AnthropicThinkingLikeBlock[] = [];

  for (const block of blocks) {
    if (block.type === 'thinking' || block.type === 'redacted_thinking') {
      pendingThinkingBlocks.push(block);
      if (block.type === 'thinking' && block.thinking) {
        parts.push({ text: block.thinking, thought: true });
      }
      continue;
    }

    if (block.type === 'tool_use') {
      parts.push(
        createFunctionCallPart(
          block.id,
          toolNameMapper.toGeminiName(block.name),
          parseJsonObject(JSON.stringify(block.input ?? {})),
          encodeClaudeThinkingBlocks(pendingThinkingBlocks),
        ),
      );
      pendingThinkingBlocks = [];
      continue;
    }

    parts.push(...anthropicBlockToGeminiPart(block, toolNameMapper));
  }

  return parts;
}

function createFunctionCallPart(
  id: string,
  name: string,
  args: Record<string, unknown>,
  thinkingSignature?: string,
): Part {
  return {
    functionCall: {
      id,
      name,
      args,
    },
    ...(thinkingSignature ? { thoughtSignature: thinkingSignature } : {}),
  };
}

function createGeminiResponse(args: {
  parts: Part[];
  finishReason?: FinishReason;
  usage?: AnthropicUsage;
  responseId?: string;
  modelVersion?: string;
}): GenerateContentResponse {
  const response = new GenerateContentResponse();
  response.responseId = args.responseId;
  response.modelVersion = args.modelVersion;
  response.candidates = [
    {
      index: 0,
      content: {
        role: 'model',
        parts: args.parts,
      },
      finishReason: args.finishReason,
    },
  ];
  if (args.usage) {
    response.usageMetadata = usageToGeminiUsage(args.usage);
  }
  return response;
}

function usageToGeminiUsage(
  usage: AnthropicUsage,
): GenerateContentResponseUsageMetadata {
  const promptTokenCount =
    (usage.input_tokens ?? 0) +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0);
  const candidatesTokenCount = usage.output_tokens ?? 0;
  return {
    promptTokenCount,
    candidatesTokenCount,
    totalTokenCount: promptTokenCount + candidatesTokenCount,
  };
}

function mapAnthropicStopReason(stopReason?: string | null): FinishReason {
  switch (stopReason) {
    case 'max_tokens':
      return FinishReason.MAX_TOKENS;
    case 'refusal':
      return FinishReason.SAFETY;
    case 'end_turn':
    case 'stop_sequence':
    case 'tool_use':
    default:
      return FinishReason.STOP;
  }
}

async function* parseSse(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<AnthropicStreamPayload> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      buffer = buffer.replace(/\r\n/g, '\n');
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const chunk = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const event = parseSseChunk(chunk);
        if (event) {
          yield event;
        }
        boundary = buffer.indexOf('\n\n');
      }
    }

    buffer += decoder.decode();
    const event = parseSseChunk(buffer);
    if (event) {
      yield event;
    }
  } finally {
    reader.releaseLock();
  }
}

function parseSseChunk(chunk: string): AnthropicStreamPayload | undefined {
  const dataLines = chunk
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart());
  const data = (dataLines.length > 0 ? dataLines.join('\n') : chunk).trim();

  if (!data || data === '[DONE]') {
    return undefined;
  }
  const parsed = JSON.parse(data) as unknown;
  if (isAnthropicStreamEvent(parsed)) {
    return parsed;
  }
  return isAnthropicMessageResponse(parsed)
    ? toAnthropicMessageResponse(parsed)
    : undefined;
}

function isAnthropicStreamEvent(value: unknown): value is AnthropicStreamEvent {
  if (!isRecord(value)) {
    return false;
  }
  switch (stringField(value, 'type')) {
    case 'message_start':
    case 'content_block_start':
    case 'content_block_delta':
    case 'content_block_stop':
    case 'message_delta':
    case 'message_stop':
    case 'ping':
      return true;
    default:
      return false;
  }
}

function isAnthropicMessageResponse(
  value: unknown,
): value is AnthropicMessageResponse {
  return isRecord(value) && Array.isArray(value['content']);
}

function isAnthropicContentBlock(
  value: unknown,
): value is AnthropicContentBlock {
  if (!isRecord(value)) {
    return false;
  }

  const type = stringField(value, 'type');
  if (!type) {
    return false;
  }

  switch (type) {
    case 'text':
      return stringField(value, 'text') !== undefined;
    case 'thinking':
      return stringField(value, 'thinking') !== undefined;
    case 'redacted_thinking':
      return stringField(value, 'data') !== undefined;
    case 'image':
    case 'document':
      return isRecord(value['source']);
    case 'tool_use':
      return (
        stringField(value, 'id') !== undefined &&
        stringField(value, 'name') !== undefined
      );
    case 'tool_result':
      return (
        stringField(value, 'tool_use_id') !== undefined &&
        stringField(value, 'content') !== undefined
      );
    default:
      return false;
  }
}

function isAnthropicThinkingLikeBlock(
  value: unknown,
): value is AnthropicThinkingLikeBlock {
  if (!isRecord(value)) {
    return false;
  }

  if (value['type'] === 'redacted_thinking') {
    return stringField(value, 'data') !== undefined;
  }
  if (value['type'] === 'thinking') {
    const signature = value['signature'];
    return (
      stringField(value, 'thinking') !== undefined &&
      (signature === undefined || stringField(value, 'signature') !== undefined)
    );
  }
  return false;
}

function isPreservableThinkingBlock(
  block: AnthropicThinkingLikeBlock,
): boolean {
  if (block.type === 'redacted_thinking') {
    return block.data !== '';
  }
  return block.signature !== undefined && block.signature !== '';
}

function parseJsonObject(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function makeToolUseId(functionCall: FunctionCall): string {
  return `toolu_${functionCall.name ?? 'unknown_tool'}_${
    JSON.stringify(functionCall.args ?? {}).length
  }`;
}

function functionResponseContent(response: Record<string, unknown>): string {
  const output = response['output'];
  if (typeof output === 'string') {
    return output;
  }
  return JSON.stringify(response);
}

function isEmptyObject(value: unknown): boolean {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === 0
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function numberField(
  value: Record<string, unknown>,
  key: string,
): number | undefined {
  const field = value[key];
  return typeof field === 'number' ? field : undefined;
}

function stringField(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const field = value[key];
  return typeof field === 'string' ? field : undefined;
}
