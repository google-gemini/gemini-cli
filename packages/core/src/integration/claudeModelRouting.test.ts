/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  CLAUDE_OPUS_5_MODEL,
  CLAUDE_SONNET_5_MODEL,
  VERTEX_AI_MODEL_MAPPINGS,
  CCPA_AI_MODEL_MAPPINGS,
  isClaudeModel,
} from '../config/models.js';
import { getAuthTypeFromEnv, AuthType } from '../core/contentGenerator.js';

describe('Claude Model Routing & Fidelity Integration Test', () => {
  it('should identify Claude models via isClaudeModel', () => {
    expect(isClaudeModel(CLAUDE_OPUS_5_MODEL)).toBe(true);
    expect(isClaudeModel(CLAUDE_SONNET_5_MODEL)).toBe(true);
    expect(isClaudeModel('claude-3-5-sonnet')).toBe(true);
    expect(isClaudeModel('gemini-2.5-pro')).toBe(false);
    expect(isClaudeModel(undefined)).toBe(false);
  });

  it('should register Vertex AI targets for Opus 5 and Sonnet 5', () => {
    expect(VERTEX_AI_MODEL_MAPPINGS[CLAUDE_OPUS_5_MODEL]).toBe(
      CLAUDE_OPUS_5_MODEL,
    );
    expect(VERTEX_AI_MODEL_MAPPINGS[CLAUDE_SONNET_5_MODEL]).toBe(
      CLAUDE_SONNET_5_MODEL,
    );
  });

  it('should register CCPA mappings for Opus 5 and Sonnet 5', () => {
    expect(CCPA_AI_MODEL_MAPPINGS[CLAUDE_OPUS_5_MODEL]).toBe(
      CLAUDE_OPUS_5_MODEL,
    );
    expect(CCPA_AI_MODEL_MAPPINGS[CLAUDE_SONNET_5_MODEL]).toBe(
      CLAUDE_SONNET_5_MODEL,
    );
  });

  it('should preserve environment-configured authType without forcing Vertex AI when GOOGLE_GEMINI_BASE_URL is present', () => {
    const originalEnv = { ...process.env };
    delete process.env['GOOGLE_GENAI_USE_VERTEXAI'];
    process.env['GOOGLE_GEMINI_BASE_URL'] = 'http://127.0.0.1:4000';

    const authType = getAuthTypeFromEnv(CLAUDE_OPUS_5_MODEL);
    expect(authType).toBe(AuthType.GATEWAY);

    process.env = originalEnv;
  });
});
