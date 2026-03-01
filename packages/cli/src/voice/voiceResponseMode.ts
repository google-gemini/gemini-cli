/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const VOICE_FRIENDLY_INSTRUCTION =
  'You are in a voice conversation. Respond concisely in short, spoken sentences. Do not use markdown, especially tables or code blocks.';

export function createVoicePrompt(text: string): string {
  return `${VOICE_FRIENDLY_INSTRUCTION}\n\nUser request:\n${text}`;
}
