/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Content } from '@google/genai';
import type { BaseLlmClient } from '../core/baseLlmClient.js';
import { getResponseText } from '../utils/partUtils.js';

export const SESSION_NAME_SUFFIX_LENGTH = 5;
const SESSION_NAME_BASE_MAX_LENGTH = 60;
const SESSION_NAME_TIMEOUT_MS = 4000;

const SESSION_NAME_PROMPT = `Generate a short session name based on the user's FIRST request.

Rules:
- 3 to 8 words max
- Focus on user's goal
- No punctuation
- No quotes

First user request:
{request}

Session name:`;

function leftPad(value: number): string {
  return String(value).padStart(2, '0');
}

export function getDefaultSessionNameBase(date: Date = new Date()): string {
  return `session-${date.getUTCFullYear()}${leftPad(date.getUTCMonth() + 1)}${leftPad(date.getUTCDate())}-${leftPad(date.getUTCHours())}${leftPad(date.getUTCMinutes())}${leftPad(date.getUTCSeconds())}`;
}

export function normalizeSessionNameBase(input: string): string {
  const normalized = input
    .normalize('NFKD')
    .replace(/[^\x00-\x7F]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, SESSION_NAME_BASE_MAX_LENGTH)
    .replace(/-+$/g, '');

  return normalized;
}

export function normalizeSessionNameSuffix(input: string): string {
  const alphanumeric = input.toLowerCase().replace(/[^a-z0-9]/g, '');

  if (alphanumeric.length === 0) {
    return '00000';
  }

  if (alphanumeric.length >= SESSION_NAME_SUFFIX_LENGTH) {
    return alphanumeric.slice(0, SESSION_NAME_SUFFIX_LENGTH);
  }

  return alphanumeric.padEnd(SESSION_NAME_SUFFIX_LENGTH, '0');
}

export function getSessionNameSuffix(sessionId: string): string {
  return normalizeSessionNameSuffix(sessionId);
}

export function ensureSessionNameBase(base: string | undefined): string {
  const normalized = normalizeSessionNameBase(base ?? '');
  if (normalized.length > 0) {
    return normalized;
  }
  return getDefaultSessionNameBase();
}

export function buildSessionName(base: string, suffix: string): string {
  return `${ensureSessionNameBase(base)}-${normalizeSessionNameSuffix(suffix)}`;
}

export interface GenerateSessionNameOptions {
  baseLlmClient: BaseLlmClient;
  firstUserRequest: string;
  timeoutMs?: number;
}

export async function generateSessionNameBase({
  baseLlmClient,
  firstUserRequest,
  timeoutMs = SESSION_NAME_TIMEOUT_MS,
}: GenerateSessionNameOptions): Promise<string | null> {
  const trimmedRequest = firstUserRequest.trim();
  if (!trimmedRequest) {
    return null;
  }

  const prompt = SESSION_NAME_PROMPT.replace('{request}', trimmedRequest);
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);

  try {
    const contents: Content[] = [
      {
        role: 'user',
        parts: [{ text: prompt }],
      },
    ];

    const response = await baseLlmClient.generateContent({
      modelConfigKey: { model: 'session-name-default' },
      contents,
      abortSignal: abortController.signal,
      promptId: 'session-name-generation',
    });

    const generated = getResponseText(response);
    if (!generated) {
      return null;
    }

    const normalized = normalizeSessionNameBase(generated);
    return normalized.length > 0 ? normalized : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

