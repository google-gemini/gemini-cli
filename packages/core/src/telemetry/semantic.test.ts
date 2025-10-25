/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  toChatMessage,
  toInputMessages,
  toSystemInstruction,
  toOutputMessages,
  toFinishReasons,
  OTelFinishReason,
  toOutputType,
  OTelOutputType,
} from './semantic.js';
import {
  Language,
  type Content,
  Outcome,
  type Candidate,
  FinishReason,
} from '@google/genai';

describe('toChatMessage', () => {
  it('should correctly handle text parts', () => {
    const content: Content = {
      role: 'user',
      parts: [{ text: 'Hello' }],
    };
    expect(toChatMessage(content)).toEqual({
      role: 'user',
      parts: [
        {
          type: 'text',
          content: 'Hello',
        },
      ],
    });
  });

  it('should correctly handle function call parts', () => {
    const content: Content = {
      role: 'model',
      parts: [
        {
          functionCall: {
            name: 'test-function',
            args: {
              arg1: 'test-value',
            },
            id: '12345',
          },
          // include field not specified in semantic specification that could be present
          thoughtSignature: '1234',
        },
      ],
    };
    expect(toChatMessage(content)).toEqual({
      role: 'system',
      parts: [
        {
          type: 'tool_call',
          name: 'test-function',
          arguments: '{"arg1":"test-value"}',
          id: '12345',
        },
      ],
    });
  });

  it('should correctly handle function response parts', () => {
    const content: Content = {
      role: 'user',
      parts: [
        {
          functionResponse: {
            name: 'test-function',
            response: {
              result: 'success',
            },
            id: '12345',
          },
          // include field not specified in semantic specification that could be present
          fileData: {
            displayName: 'greatfile',
          },
        },
      ],
    };
    expect(toChatMessage(content)).toEqual({
      role: 'user',
      parts: [
        {
          type: 'tool_call_response',
          response: '{"result":"success"}',
          id: '12345',
        },
      ],
    });
  });

  it('should correctly handle reasoning parts with text', () => {
    const content: Content = {
      role: 'system',
      parts: [{ text: 'Hmm', thought: true }],
    };
    expect(toChatMessage(content)).toEqual({
      role: 'system',
      parts: [
        {
          type: 'reasoning',
          content: 'Hmm',
        },
      ],
    });
  });

  it('should correctly handle reasoning parts without text', () => {
    const content: Content = {
      role: 'system',
      parts: [
        {
          thought: true,
          // include field not specified in semantic specification that could be present
          inlineData: {
            displayName: 'wowdata',
          },
        },
      ],
    };
    expect(toChatMessage(content)).toEqual({
      role: 'system',
      parts: [
        {
          type: 'reasoning',
          content: '',
        },
      ],
    });
  });

  it('should correctly handle text parts that are not reasoning parts', () => {
    const content: Content = {
      role: 'user',
      parts: [{ text: 'what a nice day', thought: false }],
    };
    expect(toChatMessage(content)).toEqual({
      role: 'user',
      parts: [
        {
          type: 'text',
          content: 'what a nice day',
        },
      ],
    });
  });

  it('should correctly handle "generic" parts', () => {
    const content: Content = {
      role: 'model',
      parts: [
        {
          executableCode: {
            code: 'print("foo")',
            language: Language.PYTHON,
          },
        },
        {
          codeExecutionResult: {
            outcome: Outcome.OUTCOME_OK,
            output: 'foo',
          },
          // include field not specified in semantic specification that could be present
          videoMetadata: {
            fps: 5,
          },
        },
      ],
    };
    expect(toChatMessage(content)).toEqual({
      role: 'system',
      parts: [
        {
          type: 'executableCode',
          code: 'print("foo")',
          language: 'PYTHON',
        },
        {
          type: 'codeExecutionResult',
          outcome: 'OUTCOME_OK',
          output: 'foo',
          videoMetadata: {
            fps: 5,
          },
        },
      ],
    });
  });

  it('should correctly handle unknown parts', () => {
    const content: Content = {
      role: 'model',
      parts: [
        {
          fileData: {
            displayName: 'superfile',
          },
        },
      ],
    };
    expect(toChatMessage(content)).toEqual({
      role: 'system',
      parts: [
        {
          type: 'unknown',
          fileData: {
            displayName: 'superfile',
          },
        },
      ],
    });
  });
});

describe('toSystemInstruction', () => {
  it('should correctly handle a string', () => {
    const content = 'Hello';
    expect(toSystemInstruction(content)).toEqual([
      {
        type: 'text',
        content: 'Hello',
      },
    ]);
  });

  it('should correctly handle a Content object with a text part', () => {
    const content: Content = {
      role: 'user',
      parts: [{ text: 'Hello' }],
    };
    expect(toSystemInstruction(content)).toEqual([
      {
        type: 'text',
        content: 'Hello',
      },
    ]);
  });

  it('should correctly handle a Content object with multiple parts', () => {
    const content: Content = {
      role: 'user',
      parts: [{ text: 'Hello' }, { text: 'Hmm', thought: true }],
    };
    expect(toSystemInstruction(content)).toEqual([
      {
        type: 'text',
        content: 'Hello',
      },
      {
        type: 'reasoning',
        content: 'Hmm',
      },
    ]);
  });
});

describe('toInputMessages', () => {
  it('should correctly convert an array of Content objects', () => {
    const contents: Content[] = [
      {
        role: 'user',
        parts: [{ text: 'Hello' }],
      },
      {
        role: 'model',
        parts: [{ text: 'Hi there!' }],
      },
    ];
    expect(toInputMessages(contents)).toEqual([
      {
        role: 'user',
        parts: [
          {
            type: 'text',
            content: 'Hello',
          },
        ],
      },
      {
        role: 'system',
        parts: [
          {
            type: 'text',
            content: 'Hi there!',
          },
        ],
      },
    ]);
  });
});

describe('toOutputMessages', () => {
  it('should correctly convert an array of Candidate objects', () => {
    const candidates: Candidate[] = [
      {
        index: 0,
        finishReason: FinishReason.STOP,
        content: {
          role: 'model',
          parts: [{ text: 'This is the first candidate.' }],
        },
      },
      {
        index: 1,
        finishReason: FinishReason.MAX_TOKENS,
        content: {
          role: 'model',
          parts: [{ text: 'This is the second candidate.' }],
        },
      },
    ];
    expect(toOutputMessages(candidates)).toEqual([
      {
        role: 'system',
        finish_reason: 'stop',
        parts: [
          {
            type: 'text',
            content: 'This is the first candidate.',
          },
        ],
      },
      {
        role: 'system',
        finish_reason: 'length',
        parts: [
          {
            type: 'text',
            content: 'This is the second candidate.',
          },
        ],
      },
    ]);
  });
});

describe('toFinishReasons', () => {
  it('should return an empty array if candidates is undefined', () => {
    expect(toFinishReasons(undefined)).toEqual([]);
  });

  it('should return an empty array if candidates is an empty array', () => {
    expect(toFinishReasons([])).toEqual([]);
  });

  it('should correctly convert a single candidate', () => {
    const candidates: Candidate[] = [
      {
        index: 0,
        finishReason: FinishReason.STOP,
        content: {
          role: 'model',
          parts: [{ text: 'This is the first candidate.' }],
        },
      },
    ];
    expect(toFinishReasons(candidates)).toEqual([OTelFinishReason.STOP]);
  });

  it('should correctly convert multiple candidates', () => {
    const candidates: Candidate[] = [
      {
        index: 0,
        finishReason: FinishReason.STOP,
        content: {
          role: 'model',
          parts: [{ text: 'This is the first candidate.' }],
        },
      },
      {
        index: 1,
        finishReason: FinishReason.MAX_TOKENS,
        content: {
          role: 'model',
          parts: [{ text: 'This is the second candidate.' }],
        },
      },
      {
        index: 2,
        finishReason: FinishReason.SAFETY,
        content: {
          role: 'model',
          parts: [{ text: 'This is the third candidate.' }],
        },
      },
    ];
    expect(toFinishReasons(candidates)).toEqual([
      OTelFinishReason.STOP,
      OTelFinishReason.LENGTH,
      OTelFinishReason.CONTENT_FILTER,
    ]);
  });
});

describe('toOutputType', () => {
  it('should return TEXT for text/plain', () => {
    expect(toOutputType('text/plain')).toBe(OTelOutputType.TEXT);
  });

  it('should return JSON for application/json', () => {
    expect(toOutputType('application/json')).toBe(OTelOutputType.JSON);
  });

  it('should return the custom mime type for other strings', () => {
    expect(toOutputType('application/vnd.custom-type')).toBe(
      'application/vnd.custom-type',
    );
  });

  it('should return undefined for undefined input', () => {
    expect(toOutputType(undefined)).toBeUndefined();
  });
});
