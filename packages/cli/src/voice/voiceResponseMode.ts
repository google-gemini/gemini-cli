/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const VOICE_FRIENDLY_INSTRUCTION =
  'You are in a voice conversation. Respond concisely in short, spoken sentences. Do not use markdown, especially tables or code blocks.';

export interface VoicePrompt {
  system: string;
  user: string;
}

/**
 * Creates a voice-mode prompt using structured fields.
 *
 * User input is intentionally separated from system instructions to prevent
 * prompt injection vulnerabilities. Never concatenate untrusted user text
 * directly with system prompts.
 */
export function createVoicePrompt(text: string): VoicePrompt {
  return {
    system: VOICE_FRIENDLY_INSTRUCTION,
    user: text.trim(),
  };
}
