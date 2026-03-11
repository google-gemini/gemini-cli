/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { GenerateContentResponse } from '@google/genai';
import type { FakeResponse } from './fakeContentGenerator.js';

export type FakeRequest = { method: 'userText'; text: string };
export type ScriptItem = FakeResponse | FakeRequest;

export function mockGenerateContentStreamText(text: string): FakeResponse {
  return {
    method: 'generateContentStream',
    response: [
      {
        candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
      },
    ] as GenerateContentResponse[],
  };
}

export function mockGenerateContentText(text: string): FakeResponse {
  return {
    method: 'generateContent',
    response: {
      candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
    } as GenerateContentResponse,
  };
}

export function userText(text: string): FakeRequest {
  return { method: 'userText', text };
}

export function isFakeResponse(item: ScriptItem): item is FakeResponse {
  return item.method !== 'userText';
}

export function isFakeRequest(item: ScriptItem): item is FakeRequest {
  return item.method === 'userText';
}

/**
 * Extracts all FakeRequests from a script array and maps them to their string text.
 */
export function extractUserPrompts(script: ScriptItem[]): string[] {
  return script.filter(isFakeRequest).map((req) => req.text);
}

/**
 * Extracts all FakeResponses from a script array.
 */
export function extractFakeResponses(script: ScriptItem[]): FakeResponse[] {
  return script.filter(isFakeResponse);
}
