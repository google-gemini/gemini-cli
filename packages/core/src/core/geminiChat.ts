/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// DISCLAIMER: This is a copied version of https://github.com/googleapis/js-genai/blob/main/src/chats.ts with the intention of working around a key bug
// where function responses are not treated as "valid" responses: https://b.corp.google.com/issues/420354090

import {
  createUserContent,
  FinishReason,
  FunctionCallingConfigMode,
  GenerateContentResponse,
  ThinkingLevel,
  type Content,
  type Part,
  type Tool,
  type PartListUnion,
  type GenerateContentConfig,
  type GenerateContentParameters,
} from '@google/genai';
import { toParts } from '../code_assist/converter.js';
import {
  retryWithBackoff,
  isRetryableError,
  getRetryErrorType,
} from '../utils/retry.js';
import type { ValidationRequiredError } from '../utils/googleQuotaErrors.js';
import { resolveModel, supportsModernFeatures } from '../config/models.js';
import { hasCycleInSchema } from '../tools/tools.js';
import type { StructuredError } from './turn.js';
import type { CompletedToolCall } from '../scheduler/types.js';
import {
  logContentRetry,
  logContentRetryFailure,
  logNetworkRetryAttempt,
} from '../telemetry/loggers.js';
import {
  ChatRecordingService,
  type ResumedSessionData,
} from '../services/chatRecordingService.js';
import {
  ContentRetryEvent,
  ContentRetryFailureEvent,
  NetworkRetryAttemptEvent,
  type LlmRole,
} from '../telemetry/types.js';
import { handleFallback } from '../fallback/handler.js';
import { isFunctionResponse } from '../utils/messageInspectors.js';
import { partListUnionToString } from './geminiRequest.js';
import type { ModelConfigKey } from '../services/modelConfigService.js';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';
import {
  applyModelSelection,
  createAvailabilityContextProvider,
} from '../availability/policyHelpers.js';
import { coreEvents } from '../utils/events.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { getResponseText } from '../utils/partUtils.js';
import { debugLogger } from '../utils/debugLogger.js';

export enum StreamEventType {
  /** A regular content chunk from the API. */
  CHUNK = 'chunk',
  /** A signal that a retry is about to happen. The UI should discard any partial
   * content from the attempt that just failed. */
  RETRY = 'retry',
  /** A signal that the agent execution has been stopped by a hook. */
  AGENT_EXECUTION_STOPPED = 'agent_execution_stopped',
  /** A signal that the agent execution has been blocked by a hook. */
  AGENT_EXECUTION_BLOCKED = 'agent_execution_blocked',
}

export type StreamEvent =
  | { type: StreamEventType.CHUNK; value: GenerateContentResponse }
  | { type: StreamEventType.RETRY }
  | { type: StreamEventType.AGENT_EXECUTION_STOPPED; reason: string }
  | { type: StreamEventType.AGENT_EXECUTION_BLOCKED; reason: string };

/**
 * Options for retrying mid-stream errors (e.g. invalid content or API disconnects).
 */
interface MidStreamRetryOptions {
  /** Total number of attempts to make (1 initial + N retries). */
  maxAttempts: number;
  /** The base delay in milliseconds for backoff. */
  initialDelayMs: number;
  /** Whether to use exponential backoff instead of linear. */
  useExponentialBackoff: boolean;
}

const MID_STREAM_RETRY_OPTIONS: MidStreamRetryOptions = {
  maxAttempts: 4, // 1 initial call + 3 retries mid-stream
  initialDelayMs: 1000,
  useExponentialBackoff: true,
};

export const SYNTHETIC_THOUGHT_SIGNATURE = 'skip_thought_signature_validator';
const LOCAL_GEMMA_VISIBLE_RESPONSE_RETRY_INSTRUCTION =
  'Retry rule: respond with visible text or a tool call in this turn. Do not emit thoughts only.';
function getLocalGemmaSuggestedFilePathRetryInstruction(
  suggestedFilePath: string,
): string {
  return `Retry rule: call write_file now using \`${suggestedFilePath}\` as file_path. Do not emit thoughts only. Do not answer with text only.`;
}
const LOCAL_GEMMA_TOOL_FOLLOW_UP_INSTRUCTION =
  'Tool follow-up rule: after a tool result, either call the next tool immediately or give the final answer. Do not restate the plan.';
const LOCAL_GEMMA_DIRECT_REPLY_INSTRUCTION =
  'Reply directly to the current user message. Do not announce session initialization, readiness, or your role.';
const LOCAL_GEMMA_FILE_CREATION_INSTRUCTION =
  'File-creation rule: if the user asked you to create a new file or script, call write_file now with the full contents and target path. If only a directory is given, choose a short sensible filename yourself. write_file can create parent directories for the target path.';
const LOCAL_GEMMA_STRUCTURED_TOOL_ARGS_INSTRUCTION =
  'Tool fallback rule: do not answer in prose and do not emit thoughts. Return only a JSON object containing the arguments for the required tool.';

type LocalGemmaStructuredToolRetry = {
  functionName: string;
  schema: Record<string, unknown>;
  suggestedFilePath?: string;
};

function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRecordStringValue(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function getFirstRecordStringValue(
  record: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const value = getRecordStringValue(record, key);
    if (value !== undefined) {
      return value;
    }
  }
  return undefined;
}

function getSingleRequiredFunctionName(
  request: GenerateContentParameters,
): string | undefined {
  const allowedFunctionNames =
    request.config?.toolConfig?.functionCallingConfig?.allowedFunctionNames;

  if (allowedFunctionNames?.length !== 1) {
    return undefined;
  }

  return allowedFunctionNames[0];
}

function findToolSchema(
  tools: Tool[] | undefined,
  functionName: string,
): Record<string, unknown> | undefined {
  for (const tool of tools ?? []) {
    for (const declaration of tool.functionDeclarations ?? []) {
      if (declaration?.name !== functionName) {
        continue;
      }

      const schema = declaration.parametersJsonSchema ?? declaration.parameters;
      if (isJsonRecord(schema)) {
        return schema;
      }
    }
  }

  return undefined;
}

function getLocalGemmaStructuredToolRetry(
  tools: Tool[] | undefined,
  contents: readonly Content[],
): LocalGemmaStructuredToolRetry | undefined {
  const isToolFollowUpTurn =
    contents.length > 0 && isFunctionResponse(contents[contents.length - 1]);
  const preferredFunctionNames = getLocalGemmaPreferredFunctionNames(
    contents,
    isToolFollowUpTurn,
  );

  if (!preferredFunctionNames || preferredFunctionNames.length !== 1) {
    return undefined;
  }

  const functionName = preferredFunctionNames[0];
  const schema = findToolSchema(tools, functionName);
  if (!schema) {
    return undefined;
  }

  return {
    functionName,
    schema,
    suggestedFilePath: getSuggestedLocalGemmaFilePath(contents),
  };
}

function extractJsonObjectCandidate(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return trimmed;
  }

  let normalized = trimmed;
  if (normalized.startsWith('```')) {
    normalized = normalized.replace(/^```[a-zA-Z0-9_-]*\s*/, '');
    normalized = normalized.replace(/\s*```$/, '');
  }

  const firstBrace = normalized.indexOf('{');
  const lastBrace = normalized.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return normalized.slice(firstBrace, lastBrace + 1);
  }

  return normalized;
}

function parseStructuredToolArgsText(text: string): Record<string, unknown> {
  const jsonCandidate = extractJsonObjectCandidate(text);
  const parsed = JSON.parse(jsonCandidate) as unknown;

  if (!isJsonRecord(parsed)) {
    throw new Error('Structured tool retry must return a JSON object.');
  }

  return parsed;
}

function unwrapStructuredToolArgsRecord(
  parsedArgs: Record<string, unknown>,
): Record<string, unknown> {
  const nestedArgumentKeys = [
    'arguments',
    'args',
    'parameters',
    'params',
    'input',
  ];

  for (const key of nestedArgumentKeys) {
    const nestedValue = parsedArgs[key];
    if (isJsonRecord(nestedValue)) {
      return unwrapStructuredToolArgsRecord(nestedValue);
    }
  }

  return parsedArgs;
}

function getJsonSchemaPropertyNames(
  schema: Record<string, unknown>,
): Set<string> | undefined {
  const properties = schema['properties'];
  if (!isJsonRecord(properties)) {
    return undefined;
  }

  return new Set(Object.keys(properties));
}

function createSyntheticToolCallResponse(
  response: GenerateContentResponse,
  functionName: string,
  args: Record<string, unknown>,
): GenerateContentResponse {
  const syntheticResponse = new GenerateContentResponse();
  syntheticResponse.candidates = [
    {
      content: {
        role: 'model',
        parts: [
          {
            functionCall: {
              name: functionName,
              args,
            },
          },
        ],
      },
      finishReason: FinishReason.STOP,
    },
  ];
  syntheticResponse.usageMetadata = response.usageMetadata;
  syntheticResponse.modelVersion = response.modelVersion;
  return syntheticResponse;
}

function normalizeStructuredToolArgs(
  retry: LocalGemmaStructuredToolRetry,
  parsedArgs: Record<string, unknown>,
): Record<string, unknown> {
  const unwrappedArgs = unwrapStructuredToolArgsRecord(parsedArgs);

  if (retry.functionName !== 'write_file') {
    return unwrappedArgs;
  }

  const normalizedArgs = { ...unwrappedArgs };
  const normalizedFilePath = getFirstRecordStringValue(unwrappedArgs, [
    'file_path',
    'filepath',
    'path',
    'file',
    'filename',
    'fileName',
    'output_path',
    'script_path',
  ]);
  const normalizedContent = getFirstRecordStringValue(unwrappedArgs, [
    'content',
    'contents',
    'file_content',
    'fileContents',
    'script_content',
    'script',
    'body',
    'text',
    'code',
  ]);

  if (normalizedFilePath !== undefined) {
    normalizedArgs['file_path'] = normalizedFilePath;
  }
  if (normalizedContent !== undefined) {
    normalizedArgs['content'] = normalizedContent;
  }
  if (
    retry.suggestedFilePath &&
    getRecordStringValue(normalizedArgs, 'file_path') === undefined
  ) {
    normalizedArgs['file_path'] = retry.suggestedFilePath;
  }

  const allowedPropertyNames = getJsonSchemaPropertyNames(retry.schema);
  if (!allowedPropertyNames) {
    return normalizedArgs;
  }

  return Object.fromEntries(
    Object.entries(normalizedArgs).filter(([key]) =>
      allowedPropertyNames.has(key),
    ),
  );
}

function getStructuredToolRetryInstruction(
  retry: LocalGemmaStructuredToolRetry,
): string {
  const pathHint = retry.suggestedFilePath
    ? ` Use this exact file_path: \`${retry.suggestedFilePath}\`.`
    : '';

  return `${LOCAL_GEMMA_STRUCTURED_TOOL_ARGS_INSTRUCTION} Return only JSON arguments for \`${retry.functionName}\`.${pathHint}`;
}

/**
 * Returns true if the response is valid, false otherwise.
 */
function isValidResponse(response: GenerateContentResponse): boolean {
  if (response.candidates === undefined || response.candidates.length === 0) {
    return false;
  }
  const content = response.candidates[0]?.content;
  if (content === undefined) {
    return false;
  }
  return isValidContent(content);
}

export function isValidNonThoughtTextPart(part: Part): boolean {
  return (
    typeof part.text === 'string' &&
    !part.thought &&
    // Technically, the model should never generate parts that have text and
    //  any of these but we don't trust them so check anyways.
    !part.functionCall &&
    !part.functionResponse &&
    !part.inlineData &&
    !part.fileData
  );
}

function getLatestPlainUserText(
  contents: readonly Content[],
): string | undefined {
  for (let index = contents.length - 1; index >= 0; index -= 1) {
    const content = contents[index];
    if (!content || isFunctionResponse(content) || content.role !== 'user') {
      continue;
    }
    const text = (content.parts ?? [])
      .filter((part) => typeof part.text === 'string' && !part.thought)
      .map((part) => part.text)
      .join(' ')
      .trim();
    if (text) {
      return text;
    }
  }

  return undefined;
}

function shouldUseLowThinkingForLocalGemmaUserTurn(
  contents: readonly Content[],
): boolean {
  const latestUserText = getLatestPlainUserText(contents);
  if (!latestUserText) {
    return false;
  }

  const normalized = latestUserText.toLowerCase();
  if (estimateTokenCountSync([{ text: latestUserText }]) > 48) {
    return false;
  }

  const codingSignals =
    /\b(file|script|code|edit|write|read|run|build|test|fix|implement|debug|grep|search|folder|directory|command|terminal|shell|tool|function|class|npm|node|python|bash|zsh|git|json|yaml|ts|tsx|js|jsx)\b|[./\\]|`/;

  return !codingSignals.test(normalized);
}

function isSimpleLocalGemmaFileCreationRequest(
  contents: readonly Content[],
): boolean {
  const latestUserText = getLatestPlainUserText(contents);
  if (!latestUserText) {
    return false;
  }

  const normalized = latestUserText.toLowerCase();
  const createVerb = /\b(create|make|write|add|put|save|generate|build)\b/.test(
    normalized,
  );
  const fileNoun =
    /\b(file|script|module|component|config|json|yaml|yml|toml|ts|tsx|js|jsx|py|sh|bash|zsh)\b/.test(
      normalized,
    );

  return createVerb && fileNoun;
}

function getMostRecentFunctionCall(
  contents: readonly Content[],
): Part['functionCall'] | undefined {
  for (let index = contents.length - 1; index >= 0; index -= 1) {
    const content = contents[index];
    if (!content || content.role !== 'model') {
      continue;
    }

    for (
      let partIndex = (content.parts?.length ?? 0) - 1;
      partIndex >= 0;
      partIndex -= 1
    ) {
      const part = content.parts?.[partIndex];
      if (part?.functionCall) {
        return part.functionCall;
      }
    }
  }

  return undefined;
}

function getLocalGemmaPreferredFunctionNames(
  contents: readonly Content[],
  isToolFollowUpTurn: boolean,
): string[] | undefined {
  if (!isSimpleLocalGemmaFileCreationRequest(contents)) {
    return undefined;
  }

  if (isToolFollowUpTurn) {
    const lastFunctionCall = getMostRecentFunctionCall(contents);
    if (lastFunctionCall?.name === 'run_shell_command') {
      return ['write_file'];
    }
  }

  if (getMostRecentFunctionCall(contents)?.name === 'write_file') {
    return ['write_file'];
  }

  return ['write_file'];
}

function getSuggestedLocalGemmaFilePath(
  contents: readonly Content[],
): string | undefined {
  const latestUserText = getLatestPlainUserText(contents);
  if (!latestUserText || !isSimpleLocalGemmaFileCreationRequest(contents)) {
    return undefined;
  }

  const normalized = latestUserText.toLowerCase();
  const directoryMatch =
    normalized.match(
      /\b(?:in|into|under|inside|at)\s+(?:a\s+)?([./\w-]+)\s+(?:folder|directory)\b/,
    ) ?? normalized.match(/\b(\.\w[\w./-]*)\b/);
  const directory = directoryMatch?.[1]?.replace(/\/+$/, '');

  const extension = /\bpython|\.py\b/.test(normalized)
    ? '.py'
    : /\btypescript|tsx\b|\.ts\b/.test(normalized)
      ? '.ts'
      : /\bjavascript|node\b|\.js\b/.test(normalized)
        ? '.js'
        : /\bjson\b/.test(normalized)
          ? '.json'
          : /\byaml|yml\b/.test(normalized)
            ? '.yml'
            : '.sh';

  let baseName = 'new_file';
  if (
    /\bmachine info|system info\b/.test(normalized) ||
    (/\bmachine\b/.test(normalized) && /\binfo\b/.test(normalized))
  ) {
    baseName = 'machine_info';
  } else {
    const words = normalized
      .replace(/[^a-z0-9./_\-\s]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .filter(
        (word) =>
          !new Set([
            'a',
            'all',
            'and',
            'can',
            'create',
            'current',
            'directory',
            'exactly',
            'file',
            'folder',
            'for',
            'info',
            'into',
            'it',
            'just',
            'make',
            'me',
            'now',
            'of',
            'please',
            'print',
            'prints',
            'put',
            'returns',
            'script',
            'small',
            'text',
            'that',
            'the',
            'this',
            'use',
            'with',
            'write',
            'you',
          ]).has(word) &&
          !word.startsWith('.') &&
          !word.includes('/'),
      )
      .slice(0, 3);

    if (words.length > 0) {
      baseName = words.join('_');
    }
  }

  if (!directory) {
    return `${baseName}${extension}`;
  }

  return `${directory}/${baseName}${extension}`;
}

function appendTextToLatestUserContent(
  contents: readonly Content[],
  extraText: string,
): Content[] {
  const updatedContents = [...contents];

  for (let index = updatedContents.length - 1; index >= 0; index -= 1) {
    const content = updatedContents[index];
    if (!content || content.role !== 'user' || isFunctionResponse(content)) {
      continue;
    }

    updatedContents[index] = {
      ...content,
      parts: [...(content.parts ?? []), { text: extraText }],
    };
    return updatedContents;
  }

  return updatedContents;
}

function isValidContent(content: Content): boolean {
  if (content.parts === undefined || content.parts.length === 0) {
    return false;
  }
  for (const part of content.parts) {
    if (part === undefined || Object.keys(part).length === 0) {
      return false;
    }
    if (!part.thought && part.text !== undefined && part.text === '') {
      return false;
    }
  }
  return true;
}

/**
 * Validates the history contains the correct roles.
 *
 * @throws Error if the history does not start with a user turn.
 * @throws Error if the history contains an invalid role.
 */
function validateHistory(history: Content[]) {
  for (const content of history) {
    if (content.role !== 'user' && content.role !== 'model') {
      throw new Error(`Role must be user or model, but got ${content.role}.`);
    }
  }
}

/**
 * Extracts the curated (valid) history from a comprehensive history.
 *
 * @remarks
 * The model may sometimes generate invalid or empty contents(e.g., due to safety
 * filters or recitation). Extracting valid turns from the history
 * ensures that subsequent requests could be accepted by the model.
 */
function extractCuratedHistory(comprehensiveHistory: Content[]): Content[] {
  if (comprehensiveHistory === undefined || comprehensiveHistory.length === 0) {
    return [];
  }
  const curatedHistory: Content[] = [];
  const length = comprehensiveHistory.length;
  let i = 0;
  while (i < length) {
    if (comprehensiveHistory[i].role === 'user') {
      curatedHistory.push(comprehensiveHistory[i]);
      i++;
    } else {
      const modelOutput: Content[] = [];
      let isValid = true;
      while (i < length && comprehensiveHistory[i].role === 'model') {
        modelOutput.push(comprehensiveHistory[i]);
        if (isValid && !isValidContent(comprehensiveHistory[i])) {
          isValid = false;
        }
        i++;
      }
      if (isValid) {
        curatedHistory.push(...modelOutput);
      }
    }
  }
  return curatedHistory;
}

/**
 * Custom error to signal that a stream completed with invalid content,
 * which should trigger a retry.
 */
export class InvalidStreamError extends Error {
  readonly type:
    | 'NO_FINISH_REASON'
    | 'NO_RESPONSE_TEXT'
    | 'MALFORMED_FUNCTION_CALL'
    | 'UNEXPECTED_TOOL_CALL';

  constructor(
    message: string,
    type:
      | 'NO_FINISH_REASON'
      | 'NO_RESPONSE_TEXT'
      | 'MALFORMED_FUNCTION_CALL'
      | 'UNEXPECTED_TOOL_CALL',
  ) {
    super(message);
    this.name = 'InvalidStreamError';
    this.type = type;
  }
}

/**
 * Custom error to signal that agent execution has been stopped.
 */
export class AgentExecutionStoppedError extends Error {
  constructor(public reason: string) {
    super(reason);
    this.name = 'AgentExecutionStoppedError';
  }
}

/**
 * Custom error to signal that agent execution has been blocked.
 */
export class AgentExecutionBlockedError extends Error {
  constructor(
    public reason: string,
    public syntheticResponse?: GenerateContentResponse,
  ) {
    super(reason);
    this.name = 'AgentExecutionBlockedError';
  }
}

/**
 * Chat session that enables sending messages to the model with previous
 * conversation context.
 *
 * @remarks
 * The session maintains all the turns between user and model.
 */
export class GeminiChat {
  // A promise to represent the current state of the message being sent to the
  // model.
  private sendPromise: Promise<void> = Promise.resolve();
  private readonly chatRecordingService: ChatRecordingService;
  private lastPromptTokenCount: number;

  constructor(
    private readonly context: AgentLoopContext,
    private systemInstruction: string = '',
    private tools: Tool[] = [],
    private history: Content[] = [],
    resumedSessionData?: ResumedSessionData,
    private readonly onModelChanged?: (modelId: string) => Promise<Tool[]>,
    kind: 'main' | 'subagent' = 'main',
  ) {
    validateHistory(history);
    this.chatRecordingService = new ChatRecordingService(context);
    this.chatRecordingService.initialize(resumedSessionData, kind);
    this.lastPromptTokenCount = estimateTokenCountSync(
      this.history.flatMap((c) => c.parts || []),
    );
  }

  setSystemInstruction(sysInstr: string) {
    this.systemInstruction = sysInstr;
  }

  /**
   * Sends a message to the model and returns the response in chunks.
   *
   * @remarks
   * This method will wait for the previous message to be processed before
   * sending the next message.
   *
   * @see {@link Chat#sendMessage} for non-streaming method.
   * @param modelConfigKey - The key for the model config.
   * @param message - The list of messages to send.
   * @param prompt_id - The ID of the prompt.
   * @param signal - An abort signal for this message.
   * @param displayContent - An optional user-friendly version of the message to record.
   * @return The model's response.
   *
   * @example
   * ```ts
   * const chat = ai.chats.create({model: 'gemini-2.0-flash'});
   * const response = await chat.sendMessageStream({
   * message: 'Why is the sky blue?'
   * });
   * for await (const chunk of response) {
   * console.log(chunk.text);
   * }
   * ```
   */
  async sendMessageStream(
    modelConfigKey: ModelConfigKey,
    message: PartListUnion,
    prompt_id: string,
    signal: AbortSignal,
    role: LlmRole,
    displayContent?: PartListUnion,
  ): Promise<AsyncGenerator<StreamEvent>> {
    await this.sendPromise;

    let streamDoneResolver: () => void;
    const streamDonePromise = new Promise<void>((resolve) => {
      streamDoneResolver = resolve;
    });
    this.sendPromise = streamDonePromise;

    const userContent = createUserContent(message);
    const { model } =
      this.context.config.modelConfigService.getResolvedConfig(modelConfigKey);

    // Record user input - capture complete message with all parts (text, files, images, etc.)
    // but skip recording function responses (tool call results) as they should be stored in tool call records
    if (!isFunctionResponse(userContent)) {
      const userMessageParts = userContent.parts || [];
      const userMessageContent = partListUnionToString(userMessageParts);

      let finalDisplayContent: Part[] | undefined = undefined;
      if (displayContent !== undefined) {
        const displayParts = toParts(
          Array.isArray(displayContent) ? displayContent : [displayContent],
        );
        const displayContentString = partListUnionToString(displayParts);
        if (displayContentString !== userMessageContent) {
          finalDisplayContent = displayParts;
        }
      }

      this.chatRecordingService.recordMessage({
        model,
        type: 'user',
        content: userMessageParts,
        displayContent: finalDisplayContent,
      });
    }

    // Add user content to history ONCE before any attempts.
    this.history.push(userContent);
    const requestContents = this.getHistory(true);

    const streamWithRetries = async function* (
      this: GeminiChat,
    ): AsyncGenerator<StreamEvent, void, void> {
      let retryLocalGemmaWithoutThinking = false;
      let retryLocalGemmaWithSuggestedFilePath: string | undefined;
      let retryLocalGemmaStructuredToolCall:
        | LocalGemmaStructuredToolRetry
        | undefined;
      let lastAttemptUsedVisibleResponseRetry = false;
      let lastAttemptUsedSuggestedFilePathRetry = false;
      let lastAttemptUsedStructuredToolRetry = false;
      let lastAttemptWasLocalGemma = false;

      try {
        const maxAttempts = this.context.config.getMaxAttempts();

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          let isConnectionPhase = true;
          try {
            if (attempt > 0) {
              yield { type: StreamEventType.RETRY };
            }

            // If this is a retry, update the key with the new context.
            const currentConfigKey =
              attempt > 0
                ? { ...modelConfigKey, isRetry: true }
                : modelConfigKey;
            lastAttemptUsedVisibleResponseRetry =
              retryLocalGemmaWithoutThinking;
            lastAttemptUsedSuggestedFilePathRetry =
              retryLocalGemmaWithSuggestedFilePath !== undefined;
            lastAttemptUsedStructuredToolRetry =
              retryLocalGemmaStructuredToolCall !== undefined;

            isConnectionPhase = true;
            const stream = await this.makeApiCallAndProcessStream(
              currentConfigKey,
              requestContents,
              prompt_id,
              signal,
              role,
              {
                forceVisibleResponseRetry: lastAttemptUsedVisibleResponseRetry,
                forceSuggestedFilePathRetry:
                  retryLocalGemmaWithSuggestedFilePath,
                forceStructuredToolArgsRetry: retryLocalGemmaStructuredToolCall,
                onResolvedModel: (resolvedModel) => {
                  lastAttemptWasLocalGemma =
                    this.context.config.canUseModelWithoutAuth(resolvedModel);
                },
              },
            );
            isConnectionPhase = false;
            for await (const chunk of stream) {
              yield { type: StreamEventType.CHUNK, value: chunk };
            }

            return;
          } catch (error) {
            if (error instanceof AgentExecutionStoppedError) {
              yield {
                type: StreamEventType.AGENT_EXECUTION_STOPPED,
                reason: error.reason,
              };
              return; // Stop the generator
            }

            if (error instanceof AgentExecutionBlockedError) {
              yield {
                type: StreamEventType.AGENT_EXECUTION_BLOCKED,
                reason: error.reason,
              };
              if (error.syntheticResponse) {
                yield {
                  type: StreamEventType.CHUNK,
                  value: error.syntheticResponse,
                };
              }
              return; // Stop the generator
            }

            if (isConnectionPhase) {
              // Connection phase errors have already been retried by retryWithBackoff.
              // If they bubble up here, they are exhausted or fatal.
              throw error;
            }

            // Check if the error is retryable (e.g., transient SSL errors
            // like ERR_SSL_SSLV3_ALERT_BAD_RECORD_MAC or ApiError)
            const isRetryable = isRetryableError(
              error,
              this.context.config.getRetryFetchErrors(),
            );

            const isContentError = error instanceof InvalidStreamError;
            const errorType = isContentError
              ? error.type
              : getRetryErrorType(error);
            const shouldRetryLocalGemmaWithoutThinking =
              isContentError &&
              error.type === 'NO_RESPONSE_TEXT' &&
              lastAttemptWasLocalGemma;
            const suggestedLocalGemmaFilePath =
              getSuggestedLocalGemmaFilePath(requestContents);
            const structuredToolRetry = getLocalGemmaStructuredToolRetry(
              this.tools,
              requestContents,
            );

            if (shouldRetryLocalGemmaWithoutThinking) {
              if (structuredToolRetry && !lastAttemptUsedStructuredToolRetry) {
                retryLocalGemmaStructuredToolCall = structuredToolRetry;
                retryLocalGemmaWithoutThinking = false;
                retryLocalGemmaWithSuggestedFilePath = undefined;
              } else if (lastAttemptUsedVisibleResponseRetry) {
                if (
                  lastAttemptUsedSuggestedFilePathRetry ||
                  !suggestedLocalGemmaFilePath
                ) {
                  throw error;
                }
                retryLocalGemmaStructuredToolCall = undefined;
                retryLocalGemmaWithSuggestedFilePath =
                  suggestedLocalGemmaFilePath;
              } else {
                retryLocalGemmaStructuredToolCall = undefined;
                retryLocalGemmaWithoutThinking = true;
                retryLocalGemmaWithSuggestedFilePath = undefined;
              }
            } else {
              retryLocalGemmaStructuredToolCall = undefined;
              retryLocalGemmaWithSuggestedFilePath = undefined;
            }

            if (shouldRetryLocalGemmaWithoutThinking) {
              if (
                lastAttemptUsedStructuredToolRetry ||
                (lastAttemptUsedVisibleResponseRetry &&
                  lastAttemptUsedSuggestedFilePathRetry)
              ) {
                throw error;
              }
            }

            if (isContentError || (isRetryable && !signal.aborted)) {
              // The issue requests exactly 3 retries (4 attempts) for API errors during stream iteration.
              // Regardless of the global maxAttempts (e.g. 10), we only want to retry these mid-stream API errors
              // up to 3 times before finally throwing the error to the user.
              const maxMidStreamAttempts = MID_STREAM_RETRY_OPTIONS.maxAttempts;

              if (
                attempt < maxAttempts - 1 &&
                attempt < maxMidStreamAttempts - 1
              ) {
                const delayMs = MID_STREAM_RETRY_OPTIONS.useExponentialBackoff
                  ? MID_STREAM_RETRY_OPTIONS.initialDelayMs *
                    Math.pow(2, attempt)
                  : MID_STREAM_RETRY_OPTIONS.initialDelayMs * (attempt + 1);

                if (isContentError) {
                  logContentRetry(
                    this.context.config,
                    new ContentRetryEvent(attempt, errorType, delayMs, model),
                  );
                } else {
                  logNetworkRetryAttempt(
                    this.context.config,
                    new NetworkRetryAttemptEvent(
                      attempt + 1,
                      maxAttempts,
                      errorType,
                      delayMs,
                      model,
                    ),
                  );
                }
                coreEvents.emitRetryAttempt({
                  attempt: attempt + 1,
                  maxAttempts: Math.min(maxAttempts, maxMidStreamAttempts),
                  delayMs,
                  error: errorType,
                  model,
                });
                await new Promise((res) => setTimeout(res, delayMs));
                continue;
              }
            }

            // If we've aborted, we throw without logging a failure.
            if (signal.aborted) {
              throw error;
            }

            logContentRetryFailure(
              this.context.config,
              new ContentRetryFailureEvent(attempt + 1, errorType, model),
            );

            throw error;
          }
        }
      } finally {
        streamDoneResolver!();
      }
    };

    return streamWithRetries.call(this);
  }

  private async makeApiCallAndProcessStream(
    modelConfigKey: ModelConfigKey,
    requestContents: readonly Content[],
    prompt_id: string,
    abortSignal: AbortSignal,
    role: LlmRole,
    retryBehavior?: {
      forceVisibleResponseRetry?: boolean;
      forceSuggestedFilePathRetry?: string;
      forceStructuredToolArgsRetry?: LocalGemmaStructuredToolRetry;
      onResolvedModel?: (modelId: string) => void;
    },
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const contentsForPreviewModel =
      this.ensureActiveLoopHasThoughtSignatures(requestContents);

    // Track final request parameters for AfterModel hooks
    const {
      model: availabilityFinalModel,
      config: newAvailabilityConfig,
      maxAttempts: availabilityMaxAttempts,
    } = applyModelSelection(this.context.config, modelConfigKey);

    let lastModelToUse = availabilityFinalModel;
    let currentGenerateContentConfig: GenerateContentConfig =
      newAvailabilityConfig;
    let lastConfig: GenerateContentConfig = currentGenerateContentConfig;
    let lastContentsToUse: Content[] = [...requestContents];

    const getAvailabilityContext = createAvailabilityContextProvider(
      this.context.config,
      () => lastModelToUse,
    );
    // Track initial active model to detect fallback changes
    const initialActiveModel = this.context.config.getActiveModel();

    const apiCall = async () => {
      const useGemini3_1 =
        (await this.context.config.getGemini31Launched?.()) ?? false;
      const useGemini3_1FlashLite =
        (await this.context.config.getGemini31FlashLiteLaunched?.()) ?? false;
      const hasAccessToPreview =
        this.context.config.getHasAccessToPreviewModel?.() ?? true;

      // Default to the last used model (which respects arguments/availability selection)
      let modelToUse = resolveModel(
        lastModelToUse,
        useGemini3_1,
        useGemini3_1FlashLite,
        false,
        hasAccessToPreview,
        this.context.config,
      );

      // If the active model has changed (e.g. due to a fallback updating the config),
      // we switch to the new active model.
      if (this.context.config.getActiveModel() !== initialActiveModel) {
        modelToUse = resolveModel(
          this.context.config.getActiveModel(),
          useGemini3_1,
          useGemini3_1FlashLite,
          false,
          hasAccessToPreview,
          this.context.config,
        );
      }

      if (modelToUse !== lastModelToUse) {
        const { generateContentConfig: newConfig } =
          this.context.config.modelConfigService.getResolvedConfig({
            ...modelConfigKey,
            model: modelToUse,
          });
        currentGenerateContentConfig = newConfig;
      }

      lastModelToUse = modelToUse;
      retryBehavior?.onResolvedModel?.(modelToUse);
      const config: GenerateContentConfig = {
        ...currentGenerateContentConfig,
        // TODO(12622): Ensure we don't overrwrite these when they are
        // passed via config.
        systemInstruction: this.systemInstruction,
        tools: this.tools,
        abortSignal,
      };

      if (
        retryBehavior?.forceVisibleResponseRetry &&
        this.context.config.canUseModelWithoutAuth(modelToUse)
      ) {
        config.thinkingConfig = {
          ...config.thinkingConfig,
          includeThoughts: false,
          thinkingBudget: 0,
        };
        config.systemInstruction = config.systemInstruction
          ? `${config.systemInstruction}\n\n${LOCAL_GEMMA_VISIBLE_RESPONSE_RETRY_INSTRUCTION}`
          : LOCAL_GEMMA_VISIBLE_RESPONSE_RETRY_INSTRUCTION;
      }

      if (
        retryBehavior?.forceSuggestedFilePathRetry &&
        this.context.config.canUseModelWithoutAuth(modelToUse)
      ) {
        config.thinkingConfig = {
          ...config.thinkingConfig,
          includeThoughts: false,
          thinkingBudget: 0,
        };
        const retryInstruction = getLocalGemmaSuggestedFilePathRetryInstruction(
          retryBehavior.forceSuggestedFilePathRetry,
        );
        config.systemInstruction = config.systemInstruction
          ? `${config.systemInstruction}\n\n${retryInstruction}`
          : retryInstruction;
      }

      let contentsToUse: Content[] = supportsModernFeatures(modelToUse)
        ? [...contentsForPreviewModel]
        : [...requestContents];
      const isToolFollowUpTurn =
        contentsToUse.length > 0 &&
        isFunctionResponse(contentsToUse[contentsToUse.length - 1]);
      const preferredLocalGemmaFunctionNames =
        this.context.config.canUseModelWithoutAuth(modelToUse)
          ? getLocalGemmaPreferredFunctionNames(
              contentsToUse,
              isToolFollowUpTurn,
            )
          : undefined;
      const suggestedLocalGemmaFilePath = preferredLocalGemmaFunctionNames
        ? getSuggestedLocalGemmaFilePath(contentsToUse)
        : undefined;

      if (
        preferredLocalGemmaFunctionNames &&
        suggestedLocalGemmaFilePath &&
        !isToolFollowUpTurn
      ) {
        contentsToUse = appendTextToLatestUserContent(
          contentsToUse,
          `Use this exact file path: ${suggestedLocalGemmaFilePath}. Call write_file in this turn.`,
        );
      }

      if (preferredLocalGemmaFunctionNames) {
        config.toolConfig = {
          functionCallingConfig: {
            mode: FunctionCallingConfigMode.ANY,
            allowedFunctionNames: preferredLocalGemmaFunctionNames,
          },
        };
        config.thinkingConfig = {
          ...config.thinkingConfig,
          includeThoughts: true,
          thinkingLevel: ThinkingLevel.LOW,
        };
        config.systemInstruction = config.systemInstruction
          ? `${config.systemInstruction}\n\n${LOCAL_GEMMA_FILE_CREATION_INSTRUCTION}${
              suggestedLocalGemmaFilePath
                ? ` If you need a filename here, use \`${suggestedLocalGemmaFilePath}\`.`
                : ''
            }`
          : `${LOCAL_GEMMA_FILE_CREATION_INSTRUCTION}${
              suggestedLocalGemmaFilePath
                ? ` If you need a filename here, use \`${suggestedLocalGemmaFilePath}\`.`
                : ''
            }`;
      }

      if (
        this.context.config.canUseModelWithoutAuth(modelToUse) &&
        isToolFollowUpTurn
      ) {
        config.thinkingConfig = {
          ...config.thinkingConfig,
          includeThoughts: true,
          thinkingLevel: ThinkingLevel.LOW,
        };
        config.systemInstruction = config.systemInstruction
          ? `${config.systemInstruction}\n\n${LOCAL_GEMMA_TOOL_FOLLOW_UP_INSTRUCTION}`
          : LOCAL_GEMMA_TOOL_FOLLOW_UP_INSTRUCTION;
      } else if (
        this.context.config.canUseModelWithoutAuth(modelToUse) &&
        shouldUseLowThinkingForLocalGemmaUserTurn(contentsToUse)
      ) {
        config.thinkingConfig = {
          ...config.thinkingConfig,
          includeThoughts: true,
          thinkingLevel: ThinkingLevel.LOW,
        };
        config.systemInstruction = config.systemInstruction
          ? `${config.systemInstruction}\n\n${LOCAL_GEMMA_DIRECT_REPLY_INSTRUCTION}`
          : LOCAL_GEMMA_DIRECT_REPLY_INSTRUCTION;
      }

      const hookSystem = this.context.config.getHookSystem();
      if (hookSystem) {
        const beforeModelResult = await hookSystem.fireBeforeModelEvent({
          model: modelToUse,
          config,
          contents: contentsToUse,
        });

        if (beforeModelResult.stopped) {
          throw new AgentExecutionStoppedError(
            beforeModelResult.reason || 'Agent execution stopped by hook',
          );
        }

        if (beforeModelResult.blocked) {
          const syntheticResponse = beforeModelResult.syntheticResponse;

          for (const candidate of syntheticResponse?.candidates ?? []) {
            if (!candidate.finishReason) {
              candidate.finishReason = FinishReason.STOP;
            }
          }

          throw new AgentExecutionBlockedError(
            beforeModelResult.reason || 'Model call blocked by hook',
            syntheticResponse,
          );
        }

        if (beforeModelResult.modifiedConfig) {
          Object.assign(config, beforeModelResult.modifiedConfig);
        }
        if (
          beforeModelResult.modifiedContents &&
          Array.isArray(beforeModelResult.modifiedContents)
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          contentsToUse = beforeModelResult.modifiedContents as Content[];
        }

        const toolSelectionResult =
          await hookSystem.fireBeforeToolSelectionEvent({
            model: modelToUse,
            config,
            contents: contentsToUse,
          });

        if (toolSelectionResult.toolConfig) {
          config.toolConfig = toolSelectionResult.toolConfig;
        }
        if (
          toolSelectionResult.tools &&
          Array.isArray(toolSelectionResult.tools)
        ) {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          config.tools = toolSelectionResult.tools as Tool[];
        }
      }

      if (this.onModelChanged) {
        this.tools = await this.onModelChanged(modelToUse);
      }

      // Track final request parameters for AfterModel hooks
      lastModelToUse = modelToUse;
      lastConfig = config;
      lastContentsToUse = contentsToUse;

      if (
        retryBehavior?.forceStructuredToolArgsRetry &&
        this.context.config.canUseModelWithoutAuth(modelToUse)
      ) {
        return this.createStructuredToolRetryStream(
          modelToUse,
          contentsToUse,
          config,
          retryBehavior.forceStructuredToolArgsRetry,
          prompt_id,
          role,
        );
      }

      return this.context.config.getContentGenerator().generateContentStream(
        {
          model: modelToUse,
          contents: contentsToUse,
          config,
        },
        prompt_id,
        role,
      );
    };

    const onPersistent429Callback = async (
      authType?: string,
      error?: unknown,
    ) => handleFallback(this.context.config, lastModelToUse, authType, error);

    const onValidationRequiredCallback = async (
      validationError: ValidationRequiredError,
    ) => {
      const handler = this.context.config.getValidationHandler();
      if (typeof handler !== 'function') {
        // No handler registered, re-throw to show default error message
        throw validationError;
      }
      return handler(
        validationError.validationLink,
        validationError.validationDescription,
        validationError.learnMoreUrl,
      );
    };

    const streamResponse = await retryWithBackoff(apiCall, {
      onPersistent429: onPersistent429Callback,
      onValidationRequired: onValidationRequiredCallback,
      authType: this.context.config.getContentGeneratorConfig()?.authType,
      retryFetchErrors: this.context.config.getRetryFetchErrors(),
      signal: abortSignal,
      maxAttempts:
        availabilityMaxAttempts ?? this.context.config.getMaxAttempts(),
      getAvailabilityContext,
      onRetry: (attempt, error, delayMs) => {
        coreEvents.emitRetryAttempt({
          attempt,
          maxAttempts:
            availabilityMaxAttempts ?? this.context.config.getMaxAttempts(),
          delayMs,
          error: error instanceof Error ? error.message : String(error),
          model: lastModelToUse,
        });
      },
    });

    // Store the original request for AfterModel hooks
    const originalRequest: GenerateContentParameters = {
      model: lastModelToUse,
      config: lastConfig,
      contents: lastContentsToUse,
    };

    return this.processStreamResponse(
      lastModelToUse,
      streamResponse,
      originalRequest,
    );
  }

  private async createStructuredToolRetryStream(
    model: string,
    contents: Content[],
    config: GenerateContentConfig,
    retry: LocalGemmaStructuredToolRetry,
    promptId: string,
    role: LlmRole,
  ): Promise<AsyncGenerator<GenerateContentResponse>> {
    const instruction = getStructuredToolRetryInstruction(retry);
    const retryContents = appendTextToLatestUserContent(contents, instruction);
    const retryConfig: GenerateContentConfig = {
      ...config,
      tools: undefined,
      toolConfig: undefined,
      responseMimeType: 'application/json',
      responseJsonSchema: retry.schema,
      thinkingConfig: {
        ...config.thinkingConfig,
        includeThoughts: false,
        thinkingBudget: 0,
      },
      systemInstruction: config.systemInstruction
        ? `${config.systemInstruction}\n\n${instruction}`
        : instruction,
    };

    const response = await this.context.config
      .getContentGenerator()
      .generateContent(
        {
          model,
          contents: retryContents,
          config: retryConfig,
        },
        promptId,
        role,
      );

    const responseText = getResponseText(response)?.trim();
    if (!responseText) {
      throw new InvalidStreamError(
        `Local Gemma did not return JSON arguments for required tool "${retry.functionName}".`,
        'NO_RESPONSE_TEXT',
      );
    }

    let parsedArgs: Record<string, unknown>;
    try {
      parsedArgs = parseStructuredToolArgsText(responseText);
    } catch (error) {
      throw new InvalidStreamError(
        `Local Gemma returned invalid JSON arguments for required tool "${retry.functionName}": ${
          error instanceof Error ? error.message : String(error)
        }`,
        'NO_RESPONSE_TEXT',
      );
    }
    parsedArgs = normalizeStructuredToolArgs(retry, parsedArgs);
    debugLogger.debug(
      `[local-gemma] structured-tool-retry function=${retry.functionName} raw_preview=${JSON.stringify(
        responseText.slice(0, 240),
      )} normalized_keys=${Object.keys(parsedArgs).join(',') || 'none'}`,
    );

    return (async function* () {
      yield createSyntheticToolCallResponse(
        response,
        retry.functionName,
        parsedArgs,
      );
    })();
  }

  /**
   * Returns the chat history.
   *
   * @remarks
   * The history is a list of contents alternating between user and model.
   *
   * There are two types of history:
   * - The `curated history` contains only the valid turns between user and
   * model, which will be included in the subsequent requests sent to the model.
   * - The `comprehensive history` contains all turns, including invalid or
   * empty model outputs, providing a complete record of the history.
   *
   * The history is updated after receiving the response from the model,
   * for streaming response, it means receiving the last chunk of the response.
   *
   * The `comprehensive history` is returned by default. To get the `curated
   * history`, set the `curated` parameter to `true`.
   *
   * @param curated - whether to return the curated history or the comprehensive
   * history.
   * @return History contents alternating between user and model for the entire
   * chat session.
   */
  getHistory(curated: boolean = false): readonly Content[] {
    const history = curated
      ? extractCuratedHistory(this.history)
      : this.history;
    return [...history];
  }

  /**
   * Clears the chat history.
   */
  clearHistory(): void {
    this.history = [];
  }

  /**
   * Adds a new entry to the chat history.
   */
  addHistory(content: Content): void {
    this.history.push(content);
  }

  setHistory(history: readonly Content[]): void {
    this.history = [...history];
    this.lastPromptTokenCount = estimateTokenCountSync(
      this.history.flatMap((c) => c.parts || []),
    );
    this.chatRecordingService.updateMessagesFromHistory(history);
  }

  stripThoughtsFromHistory(): void {
    this.history = this.history.map((content) => {
      const newContent = { ...content };
      if (newContent.parts) {
        newContent.parts = newContent.parts.map((part) => {
          if (part && typeof part === 'object' && 'thoughtSignature' in part) {
            const newPart = { ...part };
            delete (newPart as { thoughtSignature?: string }).thoughtSignature;
            return newPart;
          }
          return part;
        });
      }
      return newContent;
    });
  }

  // To ensure our requests validate, the first function call in every model
  // turn within the active loop must have a `thoughtSignature` property.
  // If we do not do this, we will get back 400 errors from the API.
  ensureActiveLoopHasThoughtSignatures(
    requestContents: readonly Content[],
  ): readonly Content[] {
    // First, find the start of the active loop by finding the last user turn
    // with a text message, i.e. that is not a function response.
    let activeLoopStartIndex = -1;
    for (let i = requestContents.length - 1; i >= 0; i--) {
      const content = requestContents[i];
      if (content.role === 'user' && content.parts?.some((part) => part.text)) {
        activeLoopStartIndex = i;
        break;
      }
    }

    if (activeLoopStartIndex === -1) {
      return requestContents;
    }

    // Iterate through every message in the active loop, ensuring that the first
    // function call in each message's list of parts has a valid
    // thoughtSignature property. If it does not we replace the function call
    // with a copy that uses the synthetic thought signature.
    const newContents = requestContents.slice(); // Shallow copy the array
    for (let i = activeLoopStartIndex; i < newContents.length; i++) {
      const content = newContents[i];
      if (content.role === 'model' && content.parts) {
        const newParts = content.parts.slice();
        for (let j = 0; j < newParts.length; j++) {
          const part = newParts[j];
          if (part.functionCall) {
            if (!part.thoughtSignature) {
              newParts[j] = {
                ...part,
                thoughtSignature: SYNTHETIC_THOUGHT_SIGNATURE,
              };
              newContents[i] = {
                ...content,
                parts: newParts,
              };
            }
            break; // Only consider the first function call
          }
        }
      }
    }
    return newContents;
  }

  setTools(tools: Tool[]): void {
    this.tools = tools;
  }

  async maybeIncludeSchemaDepthContext(error: StructuredError): Promise<void> {
    // Check for potentially problematic cyclic tools with cyclic schemas
    // and include a recommendation to remove potentially problematic tools.
    if (
      isSchemaDepthError(error.message) ||
      isInvalidArgumentError(error.message)
    ) {
      const tools = this.context.toolRegistry.getAllTools();
      const cyclicSchemaTools: string[] = [];
      for (const tool of tools) {
        if (
          (tool.schema.parametersJsonSchema &&
            hasCycleInSchema(tool.schema.parametersJsonSchema)) ||
          (tool.schema.parameters && hasCycleInSchema(tool.schema.parameters))
        ) {
          cyclicSchemaTools.push(tool.displayName);
        }
      }
      if (cyclicSchemaTools.length > 0) {
        const extraDetails =
          `\n\nThis error was probably caused by cyclic schema references in one of the following tools, try disabling them with excludeTools:\n\n - ` +
          cyclicSchemaTools.join(`\n - `) +
          `\n`;
        error.message += extraDetails;
      }
    }
  }

  private async *processStreamResponse(
    model: string,
    streamResponse: AsyncGenerator<GenerateContentResponse>,
    originalRequest: GenerateContentParameters,
  ): AsyncGenerator<GenerateContentResponse> {
    const modelResponseParts: Part[] = [];

    let hasToolCall = false;
    let hasThoughts = false;
    let finishReason: FinishReason | undefined;

    for await (const chunk of streamResponse) {
      const candidateWithReason = chunk?.candidates?.find(
        (candidate) => candidate.finishReason,
      );
      if (candidateWithReason) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        finishReason = candidateWithReason.finishReason as FinishReason;
      }

      if (isValidResponse(chunk)) {
        const content = chunk.candidates?.[0]?.content;
        if (content?.parts) {
          if (content.parts.some((part) => part.thought)) {
            // Record thoughts
            hasThoughts = true;
            this.recordThoughtFromContent(content);
          }
          if (content.parts.some((part) => part.functionCall)) {
            hasToolCall = true;
          }

          modelResponseParts.push(
            ...content.parts.filter((part) => !part.thought),
          );
        }
      }

      // Record token usage if this chunk has usageMetadata
      if (chunk.usageMetadata) {
        this.chatRecordingService.recordMessageTokens(chunk.usageMetadata);
        if (chunk.usageMetadata.promptTokenCount !== undefined) {
          this.lastPromptTokenCount = chunk.usageMetadata.promptTokenCount;
        }
      }

      const hookSystem = this.context.config.getHookSystem();
      if (originalRequest && chunk && hookSystem) {
        const hookResult = await hookSystem.fireAfterModelEvent(
          originalRequest,
          chunk,
        );

        if (hookResult.stopped) {
          throw new AgentExecutionStoppedError(
            hookResult.reason || 'Agent execution stopped by hook',
          );
        }

        if (hookResult.blocked) {
          throw new AgentExecutionBlockedError(
            hookResult.reason || 'Agent execution blocked by hook',
            hookResult.response,
          );
        }

        yield hookResult.response;
      } else {
        yield chunk;
      }
    }

    // String thoughts and consolidate text parts.
    const consolidatedParts: Part[] = [];
    for (const part of modelResponseParts) {
      const lastPart = consolidatedParts[consolidatedParts.length - 1];
      if (
        lastPart?.text &&
        isValidNonThoughtTextPart(lastPart) &&
        isValidNonThoughtTextPart(part)
      ) {
        lastPart.text += part.text;
      } else {
        consolidatedParts.push(part);
      }
    }

    const responseText = consolidatedParts
      .filter((part) => part.text)
      .map((part) => part.text)
      .join('')
      .trim();
    const requiredLocalToolCall = this.context.config.canUseModelWithoutAuth(
      model,
    )
      ? getSingleRequiredFunctionName(originalRequest)
      : undefined;

    // Record model response text from the collected parts.
    // Also flush when there are thoughts or a tool call (even with no text)
    // so that BeforeTool hooks always see the latest transcript state.
    if (responseText || hasThoughts || hasToolCall) {
      this.chatRecordingService.recordMessage({
        model,
        type: 'gemini',
        content: responseText,
      });
    }

    // Stream validation logic: A stream is considered successful if:
    // 1. There's a tool call OR
    // 2. A not MALFORMED_FUNCTION_CALL finish reason and a non-mepty resp
    //
    // We throw an error only when there's no tool call AND:
    // - No finish reason, OR
    // - MALFORMED_FUNCTION_CALL finish reason OR
    // - Empty response text (e.g., only thoughts with no actual content)
    if (!hasToolCall) {
      if (!finishReason) {
        throw new InvalidStreamError(
          'Model stream ended without a finish reason.',
          'NO_FINISH_REASON',
        );
      }
      if (finishReason === FinishReason.MALFORMED_FUNCTION_CALL) {
        throw new InvalidStreamError(
          'Model stream ended with malformed function call.',
          'MALFORMED_FUNCTION_CALL',
        );
      }
      if (finishReason === FinishReason.UNEXPECTED_TOOL_CALL) {
        throw new InvalidStreamError(
          'Model stream ended with unexpected tool call.',
          'UNEXPECTED_TOOL_CALL',
        );
      }
      if (requiredLocalToolCall) {
        throw new InvalidStreamError(
          `Model stream ended without required tool call "${requiredLocalToolCall}".`,
          'NO_RESPONSE_TEXT',
        );
      }
      if (!responseText) {
        throw new InvalidStreamError(
          'Model stream ended with empty response text.',
          'NO_RESPONSE_TEXT',
        );
      }
    }

    this.history.push({ role: 'model', parts: consolidatedParts });
  }

  getLastPromptTokenCount(): number {
    return this.lastPromptTokenCount;
  }

  /**
   * Gets the chat recording service instance.
   */
  getChatRecordingService(): ChatRecordingService {
    return this.chatRecordingService;
  }

  /**
   * Records completed tool calls with full metadata.
   * This is called by external components when tool calls complete, before sending responses to Gemini.
   */
  recordCompletedToolCalls(
    model: string,
    toolCalls: CompletedToolCall[],
  ): void {
    const toolCallRecords = toolCalls.map((call) => {
      const resultDisplayRaw = call.response?.resultDisplay;
      const resultDisplay =
        typeof resultDisplayRaw === 'string' ||
        (typeof resultDisplayRaw === 'object' && resultDisplayRaw !== null)
          ? resultDisplayRaw
          : undefined;

      return {
        id: call.request.callId,
        name: call.request.originalRequestName ?? call.request.name,
        args: call.request.originalRequestArgs ?? call.request.args,
        result: call.response?.responseParts || null,
        status: call.status,
        timestamp: new Date().toISOString(),
        resultDisplay,
        description:
          'invocation' in call ? call.invocation?.getDescription() : undefined,
      };
    });

    this.chatRecordingService.recordToolCalls(model, toolCallRecords);
  }

  /**
   * Extracts and records thought from thought content.
   */
  private recordThoughtFromContent(content: Content): void {
    if (!content.parts || content.parts.length === 0) {
      return;
    }

    const thoughtPart = content.parts[0];
    if (thoughtPart.text) {
      // Extract subject and description using the same logic as turn.ts
      const rawText = thoughtPart.text;
      const subjectStringMatches = rawText.match(/\*\*(.*?)\*\*/s);
      const subject = subjectStringMatches
        ? subjectStringMatches[1].trim()
        : '';
      const description = rawText.replace(/\*\*(.*?)\*\*/s, '').trim();

      this.chatRecordingService.recordThought({
        subject,
        description,
      });
    }
  }
}

/** Visible for Testing */
export function isSchemaDepthError(errorMessage: string): boolean {
  return errorMessage.includes('maximum schema depth exceeded');
}

export function isInvalidArgumentError(errorMessage: string): boolean {
  return errorMessage.includes('Request contains an invalid argument');
}
