/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * This file contains functions and types for converting Gemini API request/response
 * formats to the OpenTelemetry semantic conventions for generative AI.
 *
 * @see https://github.com/open-telemetry/semantic-conventions/blob/8b4f210f43136e57c1f6f47292eb6d38e3bf30bb/docs/gen-ai/gen-ai-events.md
 */

import { FinishReason } from '@google/genai';
import type {
  Candidate,
  Content,
  ContentUnion,
  Part,
  PartUnion,
} from '@google/genai';

export function toInputMessages(contents: Content[]): InputMessages {
  const messages: ChatMessage[] = [];
  for (const content of contents) {
    messages.push(toChatMessage(content));
  }
  return messages;
}

function isPart(value: unknown): value is Part {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !('parts' in value)
  );
}

function toPart(part: PartUnion): Part {
  if (typeof part === 'string') {
    return { text: part };
  }
  return part;
}

function toContent(content: ContentUnion): Content | undefined {
  if (typeof content === 'string') {
    // 1. It's a string
    return {
      parts: [toPart(content)],
    };
  } else if (Array.isArray(content)) {
    // 2. It's an array of parts (PartUnion[])
    return {
      parts: content.map(toPart),
    };
  } else if ('parts' in content) {
    // 3. It's a Content object
    return content;
  } else if (isPart(content)) {
    // 4. It's a single Part object (asserted with type guard)
    return {
      parts: [content],
    };
  } else {
    // 5. Handle any other unexpected case
    return undefined;
  }
}

export function toSystemInstruction(
  systemInstruction?: ContentUnion,
): SystemInstruction | undefined {
  const parts: AnyPart[] = [];
  if (systemInstruction) {
    const content = toContent(systemInstruction);
    if (content && content.parts) {
      for (const part of content.parts) {
        parts.push(toOTelPart(part));
      }
    }
  }
  return parts;
}

export function toOutputMessages(candidates?: Candidate[]): OutputMessages {
  const messages: OutputMessage[] = [];
  if (candidates) {
    for (const candidate of candidates) {
      messages.push({
        finish_reason: toOTelFinishReason(candidate.finishReason),
        ...toChatMessage(candidate.content),
      });
    }
  }
  return messages;
}

export function toFinishReasons(candidates?: Candidate[]): OTelFinishReason[] {
  const reasons: OTelFinishReason[] = [];
  if (candidates) {
    for (const candidate of candidates) {
      reasons.push(toOTelFinishReason(candidate.finishReason));
    }
  }
  return reasons;
}

export function toOutputType(requested_mime?: string): string | undefined {
  switch (requested_mime) {
    // explicitly support the known good values of responseMimeType
    case 'text/plain':
      return OTelOutputType.TEXT;
    case 'application/json':
      return OTelOutputType.JSON;
    default:
      // if none of the well-known values applies, a custom value may be used
      return requested_mime;
  }
}

export function toChatMessage(content?: Content): ChatMessage {
  const message: ChatMessage = {
    role: undefined,
    parts: [],
  };
  if (content && content.parts) {
    message.role = toOTelRole(content.role);
    for (const part of content.parts) {
      message.parts.push(toOTelPart(part));
    }
  }
  return message;
}

export function toOTelPart(part: Part): AnyPart {
  if (part.thought) {
    if (part.text) {
      return new ReasoningPart(part.text);
    } else {
      return new ReasoningPart('');
    }
  } else if (part.text) {
    return new TextPart(part.text);
  } else if (part.functionCall) {
    return new ToolCallRequestPart(
      part.functionCall.name,
      part.functionCall.id,
      JSON.stringify(part.functionCall.args),
    );
  } else if (part.functionResponse) {
    return new ToolCallResponsePart(
      JSON.stringify(part.functionResponse.response),
      part.functionResponse.id,
    );
  } else if (part.executableCode) {
    const { executableCode, ...unexpectedData } = part;
    return new GenericPart('executableCode', {
      code: executableCode.code,
      language: executableCode.language,
      ...unexpectedData,
    });
  } else if (part.codeExecutionResult) {
    const { codeExecutionResult, ...unexpectedData } = part;
    return new GenericPart('codeExecutionResult', {
      outcome: codeExecutionResult.outcome,
      output: codeExecutionResult.output,
      ...unexpectedData,
    });
  }
  // Assuming the above cases capture all the expected parts
  // but adding a fallthrough just in case.
  return new GenericPart('unknown', { ...part });
}

export enum OTelRole {
  SYSTEM = 'system',
  USER = 'user',
  ASSISTANT = 'assistant',
  TOOL = 'tool',
}

export function toOTelRole(role?: string): OTelRole {
  switch (role?.toLowerCase()) {
    case 'system':
      return OTelRole.SYSTEM;
    // Our APIs seem to frequently use 'model'
    case 'model':
      return OTelRole.SYSTEM;
    case 'user':
      return OTelRole.USER;
    case 'assistant':
      return OTelRole.ASSISTANT;
    case 'tool':
      return OTelRole.TOOL;
    default:
      return OTelRole.SYSTEM;
  }
}

export type InputMessages = ChatMessage[];

export enum OTelOutputType {
  IMAGE = 'image',
  JSON = 'json',
  SPEECH = 'speech',
  TEXT = 'text',
}

export enum OTelFinishReason {
  STOP = 'stop',
  LENGTH = 'length',
  CONTENT_FILTER = 'content_filter',
  TOOL_CALL = 'tool_call',
  ERROR = 'error',
}

export function toOTelFinishReason(finishReason?: string): OTelFinishReason {
  switch (finishReason) {
    // we have significantly more finish reasons than the spec
    case FinishReason.FINISH_REASON_UNSPECIFIED:
      return OTelFinishReason.STOP;
    case FinishReason.STOP:
      return OTelFinishReason.STOP;
    case FinishReason.MAX_TOKENS:
      return OTelFinishReason.LENGTH;
    case FinishReason.SAFETY:
      return OTelFinishReason.CONTENT_FILTER;
    case FinishReason.RECITATION:
      return OTelFinishReason.CONTENT_FILTER;
    case FinishReason.LANGUAGE:
      return OTelFinishReason.CONTENT_FILTER;
    case FinishReason.OTHER:
      return OTelFinishReason.STOP;
    case FinishReason.BLOCKLIST:
      return OTelFinishReason.CONTENT_FILTER;
    case FinishReason.PROHIBITED_CONTENT:
      return OTelFinishReason.CONTENT_FILTER;
    case FinishReason.SPII:
      return OTelFinishReason.CONTENT_FILTER;
    case FinishReason.MALFORMED_FUNCTION_CALL:
      return OTelFinishReason.ERROR;
    case FinishReason.IMAGE_SAFETY:
      return OTelFinishReason.CONTENT_FILTER;
    case FinishReason.UNEXPECTED_TOOL_CALL:
      return OTelFinishReason.ERROR;
    default:
      return OTelFinishReason.STOP;
  }
}

export interface OutputMessage extends ChatMessage {
  finish_reason: FinishReason | string;
}

export type OutputMessages = OutputMessage[];

export type AnyPart =
  | TextPart
  | ToolCallRequestPart
  | ToolCallResponsePart
  | ReasoningPart
  | GenericPart;

export type SystemInstruction = AnyPart[];

export interface ChatMessage {
  role: string | undefined;
  parts: AnyPart[];
}

export class TextPart {
  readonly type = 'text';
  content: string;

  constructor(content: string) {
    this.content = content;
  }
}

export class ToolCallRequestPart {
  readonly type = 'tool_call';
  name?: string;
  id?: string;
  arguments?: string;

  constructor(name?: string, id?: string, args?: string) {
    this.name = name;
    this.id = id;
    this.arguments = args;
  }
}

export class ToolCallResponsePart {
  readonly type = 'tool_call_response';
  response?: string;
  id?: string;

  constructor(response?: string, id?: string) {
    this.response = response;
    this.id = id;
  }
}

export class ReasoningPart {
  readonly type = 'reasoning';
  content: string;

  constructor(content: string) {
    this.content = content;
  }
}

export class GenericPart {
  type: string;
  [key: string]: unknown;

  constructor(type: string, data: { [key: string]: unknown }) {
    this.type = type;
    Object.assign(this, data);
  }
}
