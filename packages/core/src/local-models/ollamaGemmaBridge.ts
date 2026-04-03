/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Buffer } from 'node:buffer';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Part } from '@google/genai';
import type { Config } from '../config/config.js';
import { estimateTokenCountSync } from '../utils/tokenCalculation.js';
import { debugLogger } from '../utils/debugLogger.js';

type JsonObject = Record<string, unknown>;
type OperationAction =
  | 'generateContent'
  | 'streamGenerateContent'
  | 'countTokens';

type GeminiPart = {
  text?: string;
  inlineData?: {
    mimeType?: string;
    data?: string;
  };
  fileData?: {
    mimeType?: string;
    fileUri?: string;
  };
  functionCall?: {
    name?: string;
    args?: unknown;
  };
  functionResponse?: {
    name?: string;
    response?: unknown;
  };
};

type GeminiContent = {
  role?: string;
  parts?: GeminiPart[];
};

type GeminiGenerateRequest = {
  contents?: GeminiContent[];
  systemInstruction?: GeminiContent;
  generationConfig?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
    seed?: number;
    responseMimeType?: string;
    responseSchema?: unknown;
    responseJsonSchema?: unknown;
    thinkingConfig?: {
      includeThoughts?: boolean;
      thinkingBudget?: number;
      thinkingLevel?: string;
    };
  };
  tools?: Array<{
    functionDeclarations?: Array<{
      name?: string;
      description?: string;
      parameters?: unknown;
      parametersJsonSchema?: unknown;
    }>;
  }>;
  toolConfig?: {
    functionCallingConfig?: {
      mode?: string;
      allowedFunctionNames?: string[];
    };
  };
};

type OllamaMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_name?: string;
  tool_calls?: Array<{
    function: {
      name: string;
      arguments: unknown;
    };
  }>;
  images?: string[];
};

type OllamaChatRequest = {
  model: string;
  messages: OllamaMessage[];
  stream: boolean;
  tools?: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters: unknown;
    };
  }>;
  format?: 'json' | JsonObject;
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    num_predict?: number;
    stop?: string[];
    seed?: number;
  };
  think?: boolean | 'high' | 'medium' | 'low';
};

type OllamaChatChunk = {
  model?: string;
  message?: {
    role?: string;
    content?: string;
    thinking?: string;
    tool_calls?: Array<{
      function?: {
        name?: string;
        arguments?: unknown;
      };
    }>;
  };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
};

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asJsonObject(value: unknown): JsonObject | undefined {
  return isJsonObject(value) ? value : undefined;
}

function getStringValue(record: JsonObject, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function getNumberValue(record: JsonObject, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' ? value : undefined;
}

function getBooleanValue(record: JsonObject, key: string): boolean | undefined {
  const value = record[key];
  return typeof value === 'boolean' ? value : undefined;
}

function getStringArray(value: unknown): string[] | undefined {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === 'string')
  ) {
    return undefined;
  }
  return [...value];
}

function isOperationAction(value: string): value is OperationAction {
  return (
    value === 'generateContent' ||
    value === 'streamGenerateContent' ||
    value === 'countTokens'
  );
}

function toGeminiPart(value: unknown): GeminiPart | undefined {
  const record = asJsonObject(value);
  if (!record) {
    return undefined;
  }

  const inlineDataRecord = asJsonObject(record['inlineData']);
  const fileDataRecord = asJsonObject(record['fileData']);
  const functionCallRecord = asJsonObject(record['functionCall']);
  const functionResponseRecord = asJsonObject(record['functionResponse']);
  const text = getStringValue(record, 'text');
  const inlineMimeType = inlineDataRecord
    ? getStringValue(inlineDataRecord, 'mimeType')
    : undefined;
  const inlineData = inlineDataRecord
    ? getStringValue(inlineDataRecord, 'data')
    : undefined;
  const fileMimeType = fileDataRecord
    ? getStringValue(fileDataRecord, 'mimeType')
    : undefined;
  const fileUri = fileDataRecord
    ? getStringValue(fileDataRecord, 'fileUri')
    : undefined;
  const functionCallName = functionCallRecord
    ? getStringValue(functionCallRecord, 'name')
    : undefined;
  const functionResponseName = functionResponseRecord
    ? getStringValue(functionResponseRecord, 'name')
    : undefined;

  return {
    ...(text ? { text } : {}),
    ...(inlineDataRecord
      ? {
          inlineData: {
            ...(inlineMimeType ? { mimeType: inlineMimeType } : {}),
            ...(inlineData ? { data: inlineData } : {}),
          },
        }
      : {}),
    ...(fileDataRecord
      ? {
          fileData: {
            ...(fileMimeType ? { mimeType: fileMimeType } : {}),
            ...(fileUri ? { fileUri } : {}),
          },
        }
      : {}),
    ...(functionCallRecord
      ? {
          functionCall: {
            ...(functionCallName ? { name: functionCallName } : {}),
            ...('args' in functionCallRecord
              ? { args: functionCallRecord['args'] }
              : {}),
          },
        }
      : {}),
    ...(functionResponseRecord
      ? {
          functionResponse: {
            ...(functionResponseName ? { name: functionResponseName } : {}),
            ...('response' in functionResponseRecord
              ? { response: functionResponseRecord['response'] }
              : {}),
          },
        }
      : {}),
  };
}

function toGeminiContent(value: unknown): GeminiContent | undefined {
  const record = asJsonObject(value);
  if (!record) {
    return undefined;
  }

  const rawParts = Array.isArray(record['parts']) ? record['parts'] : undefined;
  const role = getStringValue(record, 'role');
  return {
    ...(role ? { role } : {}),
    ...(rawParts
      ? {
          parts: rawParts
            .map((part) => toGeminiPart(part))
            .filter((part): part is GeminiPart => part !== undefined),
        }
      : {}),
  };
}

function toGeminiGenerateRequest(value: unknown): GeminiGenerateRequest {
  const record = asJsonObject(value) ?? {};
  const rawContents = Array.isArray(record['contents'])
    ? record['contents']
    : undefined;
  const systemInstruction = toGeminiContent(record['systemInstruction']);
  const generationConfigRecord = asJsonObject(record['generationConfig']);
  const toolConfigRecord = asJsonObject(record['toolConfig']);
  const functionCallingConfigRecord = asJsonObject(
    toolConfigRecord?.['functionCallingConfig'],
  );
  const rawTools = Array.isArray(record['tools']) ? record['tools'] : undefined;
  const stopSequences = generationConfigRecord
    ? getStringArray(generationConfigRecord['stopSequences'])
    : undefined;
  const responseMimeType = generationConfigRecord
    ? getStringValue(generationConfigRecord, 'responseMimeType')
    : undefined;
  const thinkingConfigRecord = asJsonObject(
    generationConfigRecord?.['thinkingConfig'],
  );
  const includeThoughts = thinkingConfigRecord
    ? getBooleanValue(thinkingConfigRecord, 'includeThoughts')
    : undefined;
  const thinkingBudget = thinkingConfigRecord
    ? getNumberValue(thinkingConfigRecord, 'thinkingBudget')
    : undefined;
  const thinkingLevel = thinkingConfigRecord
    ? getStringValue(thinkingConfigRecord, 'thinkingLevel')
    : undefined;
  const functionCallingMode = functionCallingConfigRecord
    ? getStringValue(functionCallingConfigRecord, 'mode')
    : undefined;
  const allowedFunctionNames = functionCallingConfigRecord
    ? getStringArray(functionCallingConfigRecord['allowedFunctionNames'])
    : undefined;

  return {
    ...(rawContents
      ? {
          contents: rawContents
            .map((content) => toGeminiContent(content))
            .filter(
              (content): content is GeminiContent => content !== undefined,
            ),
        }
      : {}),
    ...(systemInstruction ? { systemInstruction } : {}),
    ...(generationConfigRecord
      ? {
          generationConfig: {
            ...(getNumberValue(generationConfigRecord, 'temperature') !==
            undefined
              ? {
                  temperature: getNumberValue(
                    generationConfigRecord,
                    'temperature',
                  ),
                }
              : {}),
            ...(getNumberValue(generationConfigRecord, 'topP') !== undefined
              ? { topP: getNumberValue(generationConfigRecord, 'topP') }
              : {}),
            ...(getNumberValue(generationConfigRecord, 'topK') !== undefined
              ? { topK: getNumberValue(generationConfigRecord, 'topK') }
              : {}),
            ...(getNumberValue(generationConfigRecord, 'maxOutputTokens') !==
            undefined
              ? {
                  maxOutputTokens: getNumberValue(
                    generationConfigRecord,
                    'maxOutputTokens',
                  ),
                }
              : {}),
            ...(stopSequences ? { stopSequences } : {}),
            ...(getNumberValue(generationConfigRecord, 'seed') !== undefined
              ? { seed: getNumberValue(generationConfigRecord, 'seed') }
              : {}),
            ...(responseMimeType ? { responseMimeType } : {}),
            ...('responseSchema' in generationConfigRecord
              ? { responseSchema: generationConfigRecord['responseSchema'] }
              : {}),
            ...('responseJsonSchema' in generationConfigRecord
              ? {
                  responseJsonSchema:
                    generationConfigRecord['responseJsonSchema'],
                }
              : {}),
            ...(thinkingConfigRecord
              ? {
                  thinkingConfig: {
                    ...(includeThoughts !== undefined
                      ? { includeThoughts }
                      : {}),
                    ...(thinkingBudget !== undefined ? { thinkingBudget } : {}),
                    ...(thinkingLevel ? { thinkingLevel } : {}),
                  },
                }
              : {}),
          },
        }
      : {}),
    ...(rawTools
      ? {
          tools: rawTools
            .map((tool) => {
              const toolRecord = asJsonObject(tool);
              if (!toolRecord) {
                return undefined;
              }

              const rawDeclarations = Array.isArray(
                toolRecord['functionDeclarations'],
              )
                ? toolRecord['functionDeclarations']
                : undefined;
              return {
                ...(rawDeclarations
                  ? {
                      functionDeclarations: rawDeclarations
                        .map((declaration) => {
                          const declarationRecord = asJsonObject(declaration);
                          if (!declarationRecord) {
                            return undefined;
                          }

                          const declarationName = getStringValue(
                            declarationRecord,
                            'name',
                          );
                          const declarationDescription = getStringValue(
                            declarationRecord,
                            'description',
                          );
                          return {
                            ...(declarationName
                              ? { name: declarationName }
                              : {}),
                            ...(declarationDescription
                              ? { description: declarationDescription }
                              : {}),
                            ...('parameters' in declarationRecord
                              ? { parameters: declarationRecord['parameters'] }
                              : {}),
                            ...('parametersJsonSchema' in declarationRecord
                              ? {
                                  parametersJsonSchema:
                                    declarationRecord['parametersJsonSchema'],
                                }
                              : {}),
                          };
                        })
                        .filter(
                          (
                            declaration,
                          ): declaration is NonNullable<
                            NonNullable<
                              GeminiGenerateRequest['tools']
                            >[number]['functionDeclarations']
                          >[number] => declaration !== undefined,
                        ),
                    }
                  : {}),
              };
            })
            .filter(
              (
                tool,
              ): tool is NonNullable<GeminiGenerateRequest['tools']>[number] =>
                tool !== undefined,
            ),
        }
      : {}),
    ...(functionCallingConfigRecord
      ? {
          toolConfig: {
            functionCallingConfig: {
              ...(functionCallingMode ? { mode: functionCallingMode } : {}),
              ...(allowedFunctionNames ? { allowedFunctionNames } : {}),
            },
          },
        }
      : {}),
  };
}

function toOllamaChatChunk(value: unknown): OllamaChatChunk {
  const record = asJsonObject(value) ?? {};
  const messageRecord = asJsonObject(record['message']);
  const rawToolCalls = Array.isArray(messageRecord?.['tool_calls'])
    ? messageRecord['tool_calls']
    : undefined;
  const model = getStringValue(record, 'model');
  const messageRole = messageRecord
    ? getStringValue(messageRecord, 'role')
    : undefined;
  const messageContent = messageRecord
    ? getStringValue(messageRecord, 'content')
    : undefined;
  const messageThinking = messageRecord
    ? getStringValue(messageRecord, 'thinking')
    : undefined;
  const doneReason = getStringValue(record, 'done_reason');

  return {
    ...(model ? { model } : {}),
    ...(messageRecord
      ? {
          message: {
            ...(messageRole ? { role: messageRole } : {}),
            ...(messageContent ? { content: messageContent } : {}),
            ...(messageThinking ? { thinking: messageThinking } : {}),
            ...(rawToolCalls
              ? {
                  tool_calls: rawToolCalls
                    .map((toolCall) => {
                      const toolCallRecord = asJsonObject(toolCall);
                      const functionRecord = asJsonObject(
                        toolCallRecord?.['function'],
                      );
                      if (!toolCallRecord) {
                        return undefined;
                      }

                      const functionName = functionRecord
                        ? getStringValue(functionRecord, 'name')
                        : undefined;
                      return {
                        ...(functionRecord
                          ? {
                              function: {
                                ...(functionName ? { name: functionName } : {}),
                                ...('arguments' in functionRecord
                                  ? { arguments: functionRecord['arguments'] }
                                  : {}),
                              },
                            }
                          : {}),
                      };
                    })
                    .filter(
                      (
                        toolCall,
                      ): toolCall is NonNullable<
                        NonNullable<
                          NonNullable<OllamaChatChunk['message']>['tool_calls']
                        >[number]
                      > => toolCall !== undefined,
                    ),
                }
              : {}),
          },
        }
      : {}),
    ...(getBooleanValue(record, 'done') !== undefined
      ? { done: getBooleanValue(record, 'done') }
      : {}),
    ...(doneReason ? { done_reason: doneReason } : {}),
    ...(getNumberValue(record, 'prompt_eval_count') !== undefined
      ? { prompt_eval_count: getNumberValue(record, 'prompt_eval_count') }
      : {}),
    ...(getNumberValue(record, 'eval_count') !== undefined
      ? { eval_count: getNumberValue(record, 'eval_count') }
      : {}),
  };
}

function toServerAddressInfo(server: http.Server): AddressInfo {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Local Gemma bridge did not bind to a TCP port.');
  }
  return address;
}

async function readRequestBody(request: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(
  response: http.ServerResponse,
  statusCode: number,
  body: unknown,
): void {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json');
  response.end(JSON.stringify(body));
}

function sendGeminiError(
  response: http.ServerResponse,
  statusCode: number,
  message: string,
): void {
  sendJson(response, statusCode, {
    error: {
      code: statusCode,
      message,
      status: statusCode >= 500 ? 'UNAVAILABLE' : 'INVALID_ARGUMENT',
    },
  });
}

function getOperation(
  url: URL,
): { modelId: string; action: OperationAction } | null {
  const match = url.pathname.match(
    /^\/(?:v1beta\/)?models\/(.+):(generateContent|streamGenerateContent|countTokens)$/,
  );
  const action = match?.[2];
  if (!match?.[1] || !action || !isOperationAction(action)) {
    return null;
  }

  return {
    modelId: decodeURIComponent(match[1]),
    action,
  };
}

async function maybeReadImagePart(
  part: GeminiPart,
): Promise<string | undefined> {
  const inlineData = part.inlineData;
  if (inlineData?.mimeType?.startsWith('image/') && inlineData.data) {
    return inlineData.data;
  }

  const fileData = part.fileData;
  if (!fileData?.mimeType?.startsWith('image/') || !fileData.fileUri) {
    return undefined;
  }

  const fileUri = fileData.fileUri;
  if (fileUri.startsWith('data:')) {
    const payload = fileUri.slice(fileUri.indexOf(',') + 1);
    return payload || undefined;
  }

  const filePath = fileUri.startsWith('file://')
    ? decodeURIComponent(new URL(fileUri).pathname)
    : fileUri;
  const data = await fs.readFile(filePath);
  return data.toString('base64');
}

function serializeToolResponse(response: unknown, toolName?: string): string {
  if (typeof response === 'string' && response.trim().length > 0) {
    return response;
  }

  const responseRecord = asJsonObject(response);
  if (responseRecord) {
    const output = getStringValue(responseRecord, 'output');
    if (output !== undefined && output.trim().length > 0) {
      return output;
    }
    const content = getStringValue(responseRecord, 'content');
    if (content !== undefined && content.trim().length > 0) {
      return content;
    }

    if (
      Object.keys(responseRecord).length > 0 &&
      Object.entries(responseRecord).every(([key, value]) => {
        if (key !== 'output' && key !== 'content') {
          return false;
        }
        return typeof value === 'string' && value.trim().length === 0;
      })
    ) {
      return `${toolName ?? 'Tool'} completed successfully with no output.`;
    }
  }

  const serialized = JSON.stringify(response ?? {});
  if (serialized && serialized !== '{}' && serialized !== '""') {
    return serialized;
  }

  return `${toolName ?? 'Tool'} completed successfully with no output.`;
}

async function convertGeminiContentToOllamaMessages(
  content: GeminiContent,
): Promise<OllamaMessage[]> {
  const messages: OllamaMessage[] = [];
  const role =
    content.role === 'model'
      ? 'assistant'
      : content.role === 'system'
        ? 'system'
        : 'user';

  const textParts: string[] = [];
  const imageParts: string[] = [];
  const toolCalls: NonNullable<OllamaMessage['tool_calls']> = [];

  const flushStandardMessage = () => {
    if (
      textParts.length === 0 &&
      imageParts.length === 0 &&
      toolCalls.length === 0
    ) {
      return;
    }

    messages.push({
      role,
      content: textParts.join('\n'),
      ...(imageParts.length > 0 ? { images: [...imageParts] } : {}),
      ...(toolCalls.length > 0 ? { tool_calls: [...toolCalls] } : {}),
    });
    textParts.length = 0;
    imageParts.length = 0;
    toolCalls.length = 0;
  };

  for (const part of content.parts ?? []) {
    if (part.functionResponse) {
      flushStandardMessage();
      messages.push({
        role: 'tool',
        tool_name: part.functionResponse.name ?? 'unknown_tool',
        content: serializeToolResponse(
          part.functionResponse.response,
          part.functionResponse.name,
        ),
      });
      continue;
    }

    if (part.functionCall) {
      toolCalls.push({
        function: {
          name: part.functionCall.name ?? 'unknown_tool',
          arguments: part.functionCall.args ?? {},
        },
      });
      continue;
    }

    if (typeof part.text === 'string' && part.text.length > 0) {
      textParts.push(part.text);
      continue;
    }

    const image = await maybeReadImagePart(part);
    if (image) {
      imageParts.push(image);
    }
  }

  flushStandardMessage();
  return messages;
}

async function convertGeminiContentsToOllamaMessages(
  request: GeminiGenerateRequest,
): Promise<OllamaMessage[]> {
  const messages: OllamaMessage[] = [];

  if (request.systemInstruction) {
    messages.push(
      ...(await convertGeminiContentToOllamaMessages({
        ...request.systemInstruction,
        role: 'system',
      })),
    );
  }

  for (const content of request.contents ?? []) {
    messages.push(...(await convertGeminiContentToOllamaMessages(content)));
  }

  return messages;
}

function convertGeminiToolsToOllama(
  request: GeminiGenerateRequest,
): OllamaChatRequest['tools'] {
  const functionCallingConfig = request.toolConfig?.functionCallingConfig;
  if (functionCallingConfig?.mode === 'NONE') {
    return undefined;
  }

  const allowedFunctionNames = new Set(
    functionCallingConfig?.allowedFunctionNames ?? [],
  );

  const declarations = (request.tools ?? [])
    .flatMap((tool) => tool.functionDeclarations ?? [])
    .filter((declaration) => {
      if (!declaration?.name) {
        return false;
      }
      if (allowedFunctionNames.size === 0) {
        return true;
      }
      return allowedFunctionNames.has(declaration.name);
    });

  if (declarations.length === 0) {
    return undefined;
  }

  return declarations.map((declaration) => ({
    type: 'function',
    function: {
      name: declaration.name ?? 'unknown_tool',
      description: declaration.description,
      parameters: declaration.parametersJsonSchema ??
        declaration.parameters ?? {
          type: 'object',
          properties: {},
        },
    },
  }));
}

function buildOllamaChatRequest(
  modelId: string,
  request: GeminiGenerateRequest,
  messages: OllamaMessage[],
  stream: boolean,
): OllamaChatRequest {
  const generationConfig = request.generationConfig;

  let format: OllamaChatRequest['format'];
  if (
    generationConfig?.responseMimeType === 'application/json' &&
    generationConfig.responseJsonSchema === undefined &&
    generationConfig.responseSchema === undefined
  ) {
    format = 'json';
  } else if (isJsonObject(generationConfig?.responseJsonSchema)) {
    format = generationConfig.responseJsonSchema;
  } else if (isJsonObject(generationConfig?.responseSchema)) {
    format = generationConfig.responseSchema;
  }

  const options = {
    temperature: generationConfig?.temperature,
    top_p: generationConfig?.topP,
    top_k: generationConfig?.topK,
    num_predict: generationConfig?.maxOutputTokens,
    stop: generationConfig?.stopSequences,
    seed: generationConfig?.seed,
  };
  const think = resolveOllamaThinkingMode(request);

  return {
    model: modelId,
    messages,
    stream,
    ...(convertGeminiToolsToOllama(request)
      ? { tools: convertGeminiToolsToOllama(request) }
      : {}),
    ...(format ? { format } : {}),
    ...(Object.values(options).some((value) => value !== undefined)
      ? { options }
      : {}),
    ...(think !== undefined ? { think } : {}),
  };
}

function resolveOllamaThinkingMode(
  request: GeminiGenerateRequest,
): OllamaChatRequest['think'] {
  const thinkingConfig = request.generationConfig?.thinkingConfig;
  if (!thinkingConfig) {
    return false;
  }

  if (thinkingConfig.thinkingBudget === 0) {
    return false;
  }

  switch (thinkingConfig.thinkingLevel?.toUpperCase()) {
    case 'HIGH':
      return 'high';
    case 'MEDIUM':
      return 'medium';
    case 'LOW':
      return 'low';
    default:
      break;
  }

  if (thinkingConfig.includeThoughts === false) {
    return false;
  }

  if (thinkingConfig.includeThoughts === true) {
    return true;
  }

  if (
    thinkingConfig.thinkingBudget !== undefined &&
    thinkingConfig.thinkingBudget > 0
  ) {
    return true;
  }

  return false;
}

function logOllamaBridgeRequest(
  modelId: string,
  request: GeminiGenerateRequest,
  stream: boolean,
  think: OllamaChatRequest['think'],
): void {
  const messageCount = (request.contents ?? []).length;
  const partCount =
    (request.systemInstruction?.parts?.length ?? 0) +
    (request.contents ?? []).reduce(
      (total, content) => total + (content.parts?.length ?? 0),
      0,
    );
  const systemTokens = estimateGeminiPartTokens(
    request.systemInstruction?.parts,
  );
  const historyTokens = (request.contents ?? []).reduce(
    (total, content) => total + estimateGeminiPartTokens(content.parts),
    0,
  );
  const toolTokens = estimateGeminiToolTokens(request);
  const allowedFunctionNames =
    request.toolConfig?.functionCallingConfig?.allowedFunctionNames;
  debugLogger.debug(
    `[local-gemma] ${stream ? 'stream' : 'generate'} model=${modelId} think=${String(
      think,
    )} messages=${messageCount} parts=${partCount} est_tokens=${estimateGeminiRequestTokens(
      request,
    )} system_tokens=${systemTokens} history_tokens=${historyTokens} tool_tokens=${toolTokens} allowed_functions=${
      allowedFunctionNames?.join(',') ?? 'any'
    }`,
  );
}

function logOllamaBridgeChunk(modelId: string, chunk: OllamaChatChunk): void {
  const contentPreview = (chunk.message?.content ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const thinkingPreview = (chunk.message?.thinking ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
  const toolNames = (chunk.message?.tool_calls ?? [])
    .map((toolCall) => toolCall.function?.name ?? 'unknown_tool')
    .join(',');

  debugLogger.debug(
    `[local-gemma] chunk model=${modelId} done=${String(chunk.done ?? false)} content_chars=${
      chunk.message?.content?.length ?? 0
    } thinking_chars=${chunk.message?.thinking?.length ?? 0} tool_calls=${
      chunk.message?.tool_calls?.length ?? 0
    } tool_names=${toolNames || 'none'} content_preview=${JSON.stringify(
      contentPreview,
    )} thinking_preview=${JSON.stringify(thinkingPreview)}`,
  );
}

function logOllamaBridgeResponse(
  modelId: string,
  payload: OllamaChatChunk,
  stream: boolean,
): void {
  const responseRecord = asJsonObject(payload as unknown);
  const totalDuration = getNumberValue(responseRecord ?? {}, 'total_duration');
  const loadDuration = getNumberValue(responseRecord ?? {}, 'load_duration');
  const promptEvalDuration = getNumberValue(
    responseRecord ?? {},
    'prompt_eval_duration',
  );
  const evalDuration = getNumberValue(responseRecord ?? {}, 'eval_duration');
  const thinkingLength = payload.message?.thinking?.length ?? 0;
  const contentLength = payload.message?.content?.length ?? 0;
  debugLogger.debug(
    `[local-gemma] ${stream ? 'stream' : 'generate'} done model=${modelId} prompt_tokens=${payload.prompt_eval_count ?? 0} output_tokens=${payload.eval_count ?? 0} content_chars=${contentLength} thinking_chars=${thinkingLength} total_ms=${
      totalDuration ? Math.round(totalDuration / 1_000_000) : 0
    } load_ms=${loadDuration ? Math.round(loadDuration / 1_000_000) : 0} prompt_eval_ms=${
      promptEvalDuration ? Math.round(promptEvalDuration / 1_000_000) : 0
    } eval_ms=${evalDuration ? Math.round(evalDuration / 1_000_000) : 0}`,
  );
}

function mapFinishReason(doneReason?: string): string | undefined {
  switch (doneReason) {
    case 'stop':
      return 'STOP';
    case 'length':
      return 'MAX_TOKENS';
    default:
      return doneReason ? 'STOP' : undefined;
  }
}

function buildGeminiResponseFromOllama(
  modelId: string,
  chunk: OllamaChatChunk,
): Record<string, unknown> {
  const parts: Array<Record<string, unknown>> = [];
  if (chunk.message?.thinking) {
    parts.push({
      text: chunk.message.thinking,
      thought: true,
    });
  }
  if (chunk.message?.content) {
    parts.push({ text: chunk.message.content });
  }
  for (const toolCall of chunk.message?.tool_calls ?? []) {
    parts.push({
      functionCall: {
        name: toolCall.function?.name ?? 'unknown_tool',
        args: toolCall.function?.arguments ?? {},
      },
    });
  }

  return {
    candidates: [
      {
        content: {
          role: 'model',
          parts,
        },
        ...(chunk.done
          ? { finishReason: mapFinishReason(chunk.done_reason) }
          : {}),
      },
    ],
    ...(chunk.done
      ? {
          usageMetadata: {
            promptTokenCount: chunk.prompt_eval_count ?? 0,
            candidatesTokenCount: chunk.eval_count ?? 0,
            totalTokenCount:
              (chunk.prompt_eval_count ?? 0) + (chunk.eval_count ?? 0),
          },
        }
      : {}),
    modelVersion: modelId,
  };
}

function estimateGeminiRequestTokens(request: GeminiGenerateRequest): number {
  const parts: GeminiPart[] = [];
  if (request.systemInstruction?.parts) {
    parts.push(...request.systemInstruction.parts);
  }
  for (const content of request.contents ?? []) {
    parts.push(...(content.parts ?? []));
  }

  const convertedParts: Part[] = parts.map((part) => ({
    ...(part.text ? { text: part.text } : {}),
    ...(part.functionCall
      ? {
          functionCall: {
            name: part.functionCall.name,
            args: asJsonObject(part.functionCall.args) ?? {},
          },
        }
      : {}),
    ...(part.functionResponse
      ? {
          functionResponse: {
            name: part.functionResponse.name,
            response: asJsonObject(part.functionResponse.response) ?? {
              output: serializeToolResponse(
                part.functionResponse.response,
                part.functionResponse.name,
              ),
            },
          },
        }
      : {}),
    ...(part.inlineData ? { inlineData: part.inlineData } : {}),
    ...(part.fileData ? { fileData: part.fileData } : {}),
  }));

  return estimateTokenCountSync(convertedParts);
}

function splitBufferedThinking(
  buffer: string,
  force: boolean,
): { emitted?: string; remaining: string } {
  if (!buffer) {
    return { remaining: '' };
  }

  if (force) {
    return { emitted: buffer, remaining: '' };
  }

  let splitIndex = -1;
  const doubleNewlineIndex = buffer.lastIndexOf('\n\n');
  if (doubleNewlineIndex >= 24) {
    splitIndex = doubleNewlineIndex + 2;
  }

  if (splitIndex === -1 && buffer.length >= 120) {
    const sentenceBreaks = [...buffer.matchAll(/[.!?](?:\s|$)/g)];
    const lastSentenceBreak = sentenceBreaks.at(-1);
    if (
      lastSentenceBreak?.index !== undefined &&
      lastSentenceBreak.index >= 48
    ) {
      splitIndex = lastSentenceBreak.index + lastSentenceBreak[0].length;
    }
  }

  if (splitIndex === -1 && buffer.length >= 120) {
    const whitespaceIndex = Math.max(
      buffer.lastIndexOf(' '),
      buffer.lastIndexOf('\n'),
      buffer.lastIndexOf('\t'),
    );
    if (whitespaceIndex >= 48) {
      splitIndex = whitespaceIndex + 1;
    }
  }

  if (splitIndex === -1) {
    return { remaining: buffer };
  }

  return {
    emitted: buffer.slice(0, splitIndex),
    remaining: buffer.slice(splitIndex),
  };
}

function withoutThinking(chunk: OllamaChatChunk): OllamaChatChunk {
  if (!chunk.message?.thinking) {
    return chunk;
  }

  return {
    ...chunk,
    message: {
      ...chunk.message,
      thinking: undefined,
    },
  };
}

function estimateGeminiPartTokens(parts: GeminiPart[] | undefined): number {
  if (!parts || parts.length === 0) {
    return 0;
  }

  return estimateGeminiRequestTokens({
    contents: [{ role: 'user', parts }],
  });
}

function estimateGeminiToolTokens(request: GeminiGenerateRequest): number {
  if (!request.tools || request.tools.length === 0) {
    return 0;
  }

  return Math.floor(JSON.stringify(request.tools).length / 4);
}

async function* readJsonLines(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<OllamaChatChunk> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    let newlineIndex = buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) {
        yield toOllamaChatChunk(JSON.parse(line));
      }
      newlineIndex = buffer.indexOf('\n');
    }
  }

  const finalLine = buffer.trim();
  if (finalLine) {
    yield toOllamaChatChunk(JSON.parse(finalLine));
  }
}

export class OllamaGemmaBridgeManager {
  private bridgeBaseUrl?: string;
  private startPromise?: Promise<string>;

  constructor(private readonly config: Config) {}

  async assertOllamaAvailable(): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);
    try {
      const response = await fetch(
        `${this.config.getOllamaGemmaSettings().ollamaBaseUrl}/api/version`,
        { signal: controller.signal },
      );
      if (!response.ok) {
        throw new Error(
          `Ollama responded with status ${response.status} ${response.statusText}.`,
        );
      }
    } catch (error) {
      throw new Error(
        `Local Gemma model selected, but Ollama is unavailable at ${this.config.getOllamaGemmaSettings().ollamaBaseUrl}. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async ensureStarted(): Promise<string> {
    if (this.bridgeBaseUrl) {
      return this.bridgeBaseUrl;
    }
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = (async () => {
      const { bridgeHost, bridgePort } = this.config.getOllamaGemmaSettings();
      const server = http.createServer((request, response) => {
        void this.handleRequest(request, response);
      });

      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(bridgePort, bridgeHost, () => resolve());
      });

      server.unref();
      const address = toServerAddressInfo(server);
      this.bridgeBaseUrl = `http://${bridgeHost}:${address.port}`;
      return this.bridgeBaseUrl;
    })();

    return this.startPromise;
  }

  private async handleRequest(
    request: http.IncomingMessage,
    response: http.ServerResponse,
  ): Promise<void> {
    if (request.method !== 'POST' || !request.url) {
      sendGeminiError(response, 405, 'Only POST requests are supported.');
      return;
    }

    const url = new URL(request.url, 'http://127.0.0.1');
    const operation = getOperation(url);
    if (!operation) {
      sendGeminiError(response, 404, 'Unsupported local Gemma bridge path.');
      return;
    }

    if (!this.config.isLocalGemmaModel(operation.modelId)) {
      sendGeminiError(
        response,
        404,
        `Local Gemma model "${operation.modelId}" is not installed.`,
      );
      return;
    }

    let parsedBody: GeminiGenerateRequest;
    try {
      parsedBody = toGeminiGenerateRequest(
        JSON.parse(await readRequestBody(request)),
      );
    } catch {
      sendGeminiError(response, 400, 'Request body must be valid JSON.');
      return;
    }

    try {
      switch (operation.action) {
        case 'countTokens':
          sendJson(response, 200, {
            totalTokens: estimateGeminiRequestTokens(parsedBody),
          });
          return;
        case 'generateContent':
          await this.handleGenerateContent(
            operation.modelId,
            parsedBody,
            response,
          );
          return;
        case 'streamGenerateContent':
          await this.handleStreamGenerateContent(
            operation.modelId,
            parsedBody,
            response,
          );
          return;
        default:
          sendGeminiError(
            response,
            404,
            'Unsupported local Gemma bridge path.',
          );
          return;
      }
    } catch (error) {
      sendGeminiError(
        response,
        502,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  private async handleGenerateContent(
    modelId: string,
    request: GeminiGenerateRequest,
    response: http.ServerResponse,
  ): Promise<void> {
    const messages = await convertGeminiContentsToOllamaMessages(request);
    const ollamaRequest = buildOllamaChatRequest(
      modelId,
      request,
      messages,
      false,
    );
    logOllamaBridgeRequest(modelId, request, false, ollamaRequest.think);
    const upstream = await fetch(
      `${this.config.getOllamaGemmaSettings().ollamaBaseUrl}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ollamaRequest),
      },
    );

    if (!upstream.ok) {
      throw new Error(
        `Ollama request failed with status ${upstream.status} ${upstream.statusText}.`,
      );
    }

    const payload = toOllamaChatChunk(await upstream.json());
    logOllamaBridgeResponse(modelId, payload, false);
    sendJson(response, 200, buildGeminiResponseFromOllama(modelId, payload));
  }

  private async handleStreamGenerateContent(
    modelId: string,
    request: GeminiGenerateRequest,
    response: http.ServerResponse,
  ): Promise<void> {
    const messages = await convertGeminiContentsToOllamaMessages(request);
    const ollamaRequest = buildOllamaChatRequest(
      modelId,
      request,
      messages,
      true,
    );
    logOllamaBridgeRequest(modelId, request, true, ollamaRequest.think);
    const upstream = await fetch(
      `${this.config.getOllamaGemmaSettings().ollamaBaseUrl}/api/chat`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ollamaRequest),
      },
    );

    if (!upstream.ok || !upstream.body) {
      throw new Error(
        `Ollama streaming request failed with status ${upstream.status} ${upstream.statusText}.`,
      );
    }

    response.statusCode = 200;
    response.setHeader('Content-Type', 'text/event-stream');
    response.setHeader('Cache-Control', 'no-cache');
    response.setHeader('Connection', 'keep-alive');

    let lastChunk: OllamaChatChunk | undefined;
    let bufferedThinking = '';
    for await (const chunk of readJsonLines(upstream.body)) {
      lastChunk = chunk;
      if (
        chunk.message?.content ||
        chunk.message?.thinking ||
        (chunk.message?.tool_calls?.length ?? 0) > 0 ||
        chunk.done
      ) {
        logOllamaBridgeChunk(modelId, chunk);
      }

      if (chunk.message?.thinking) {
        bufferedThinking += chunk.message.thinking;
      }

      const shouldForceFlushThinking = Boolean(
        chunk.message?.content ||
          (chunk.message?.tool_calls?.length ?? 0) > 0 ||
          chunk.done,
      );

      while (true) {
        const { emitted, remaining } = splitBufferedThinking(
          bufferedThinking,
          shouldForceFlushThinking,
        );
        bufferedThinking = remaining;

        if (!emitted) {
          break;
        }

        if (emitted.trim().length === 0) {
          continue;
        }

        response.write(
          `data: ${JSON.stringify(
            buildGeminiResponseFromOllama(modelId, {
              model: chunk.model,
              message: {
                role: chunk.message?.role,
                thinking: emitted,
              },
            }),
          )}\n\n`,
        );
      }

      const visibleChunk = withoutThinking(chunk);
      if (
        visibleChunk.message?.content ||
        (visibleChunk.message?.tool_calls?.length ?? 0) > 0 ||
        visibleChunk.done
      ) {
        response.write(
          `data: ${JSON.stringify(
            buildGeminiResponseFromOllama(modelId, visibleChunk),
          )}\n\n`,
        );
      }
    }

    if (lastChunk) {
      logOllamaBridgeResponse(modelId, lastChunk, true);
    }
    response.end();
  }
}
