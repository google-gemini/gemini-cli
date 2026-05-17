/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  resolveGemma4Defaults,
  tuneModelFromMetadata,
} from './localModelMetadata.js';
import type { LocalModelMetadata } from './localModelMetadata.js';

describe('resolveGemma4Defaults', () => {
  it('resolves E2B defaults', () => {
    const result = resolveGemma4Defaults('gemma4:e2b');
    expect(result.displayName).toBe('Gemma 4 E2B');
    expect(result.contextLength).toBe(131072);
    expect(result.supportsVision).toBe(true);
    expect(result.supportsAudio).toBe(true);
    expect(result.paramSize).toBe('5.1B');
  });

  it('resolves E4B defaults', () => {
    const result = resolveGemma4Defaults('gemma4:e4b');
    expect(result.displayName).toBe('Gemma 4 E4B');
    expect(result.paramSize).toBe('8.0B');
    expect(result.supportsAudio).toBe(true);
  });

  it('resolves 26B defaults', () => {
    const result = resolveGemma4Defaults('gemma4:26b');
    expect(result.displayName).toBe('Gemma 4 26B');
    expect(result.contextLength).toBe(262144);
    expect(result.paramSize).toBe('25.2B');
    expect(result.supportsAudio).toBe(false);
  });

  it('resolves 31B defaults', () => {
    const result = resolveGemma4Defaults('gemma4:31b');
    expect(result.displayName).toBe('Gemma 4 31B');
    expect(result.paramSize).toBe('30.7B');
    expect(result.supportsAudio).toBe(false);
  });

  it('returns empty object for unknown model', () => {
    const result = resolveGemma4Defaults('unknown-model');
    expect(result).toEqual({});
  });
});

describe('tuneModelFromMetadata', () => {
  function makeMeta(
    overrides: Partial<LocalModelMetadata> = {},
  ): LocalModelMetadata {
    return {
      id: 'gemma4:26b',
      displayName: 'Gemma 4 26B',
      backendId: 'ollama',
      contextLength: 262144,
      supportsVision: true,
      supportsAudio: false,
      supportsReasoning: true,
      supportsToolUse: true,
      thinkingConfig: {
        nativeThinking: true,
        implementation: 'native-token',
        maxThinkingTokens: 32768,
        visibleReasoningInOutput: true,
      },
      paramSize: '25.2B',
      quantization: 'Q4_K_M',
      isLoaded: true,
      ...overrides,
    };
  }

  it('classifies 25B model as medium profile', () => {
    const result = tuneModelFromMetadata(makeMeta());
    expect(result.profile).toBe('medium');
  });

  it('classifies small model as small profile', () => {
    const result = tuneModelFromMetadata(makeMeta({ paramSize: '5.1B' }));
    expect(result.profile).toBe('small');
  });

  it('classifies 31B model as large profile', () => {
    const result = tuneModelFromMetadata(makeMeta({ paramSize: '30.7B' }));
    expect(result.profile).toBe('large');
  });

  it('classifies 70B model as xl profile', () => {
    const result = tuneModelFromMetadata(makeMeta({ paramSize: '70.0B' }));
    expect(result.profile).toBe('xl');
  });

  it('enables thinking for native thinking models', () => {
    const result = tuneModelFromMetadata(makeMeta());
    expect(result.enableThinking).toBe(true);
    expect(result.thinkingMode).toBe('native-token');
    expect(result.thinkingBudget).toBe(32768);
    expect(result.stripThinkingHistory).toBe(true);
  });

  it('disables thinking for non-native models', () => {
    const result = tuneModelFromMetadata(
      makeMeta({
        thinkingConfig: {
          nativeThinking: false,
          implementation: 'none',
          maxThinkingTokens: 0,
          visibleReasoningInOutput: false,
        },
      }),
    );
    expect(result.enableThinking).toBe(false);
    expect(result.thinkingMode).toBe('none');
    expect(result.thinkingBudget).toBe(0);
    expect(result.stripThinkingHistory).toBe(false);
  });

  it('derives compression threshold from context length', () => {
    const result = tuneModelFromMetadata(makeMeta({ contextLength: 131072 }));
    expect(result.maxContextTokens).toBe(131072);
    expect(result.compressionThreshold).toBe(Math.floor(131072 * 0.75));
    expect(result.tokenWarningThreshold).toBe(Math.floor(131072 * 0.9));
  });

  it('enables tool use and vision from metadata', () => {
    const result = tuneModelFromMetadata(
      makeMeta({ supportsToolUse: true, supportsVision: true }),
    );
    expect(result.enableToolUse).toBe(true);
    expect(result.enableVisionInput).toBe(true);
    expect(result.maxImageResolution).toBe(4096);
  });

  it('disables vision when not supported', () => {
    const result = tuneModelFromMetadata(makeMeta({ supportsVision: false }));
    expect(result.enableVisionInput).toBe(false);
    expect(result.maxImageResolution).toBe(0);
  });

  it('sets batchTools and prefetchContext for small/medium profiles', () => {
    const small = tuneModelFromMetadata(makeMeta({ paramSize: '5.1B' }));
    expect(small.batchTools).toBe(true);
    expect(small.prefetchContext).toBe(true);

    const medium = tuneModelFromMetadata(makeMeta({ paramSize: '25.2B' }));
    expect(medium.batchTools).toBe(true);
    expect(medium.prefetchContext).toBe(true);
  });

  it('disables batchTools for xl profiles', () => {
    const xl = tuneModelFromMetadata(makeMeta({ paramSize: '70.0B' }));
    expect(xl.batchTools).toBe(false);
    expect(xl.prefetchContext).toBe(false);
  });
});
