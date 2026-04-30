/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { translateEvent, type TranslationState } from './event-translator.js';
import { GeminiEventType, type ServerGeminiStreamEvent } from '../core/turn.js';
import type { AgentEvent } from './types.js';

describe('event-translator', () => {
  let state: TranslationState;

  beforeEach(() => {
    state = {
      streamId: 'test-stream',
      model: undefined,
      pendingToolNames: new Map(),
      streamStartEmitted: false,
      eventCounter: 0,
    };
  });

  describe('ModelInfo events', () => {
    it('updates state and emits session_update', () => {
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.ModelInfo,
        value: 'gemini-1.5-pro',
      };
      const result = translateEvent(event, state);
      expect(state.model).toBe('gemini-1.5-pro');
      expect(result).toHaveLength(2);
      expect(result[0].type).toBe('agent_start');
      expect(result[1].type).toBe('session_update');
    });
  });

  describe('Content events', () => {
    it('emits message event', () => {
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.Content,
        value: 'Hello',
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(2);
      expect(result[1].type).toBe('message');
      const msg = result[1] as AgentEvent<'message'>;
      expect(msg.role).toBe('agent');
      expect(msg.content[0]).toEqual({ type: 'text', text: 'Hello' });
    });
  });

  describe('AgentExecutionBlocked events', () => {
    it('emits a non-fatal warning error event', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.AgentExecutionBlocked,
        value: { reason: 'Policy violation' },
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const err = result[0] as AgentEvent<'error'>;
      expect(err.type).toBe('error');
      expect(err.fatal).toBe(false);
      expect(err._meta?.['code']).toBe('AGENT_EXECUTION_BLOCKED');
      expect(err.message).toBe('Policy violation');
    });

    it('uses systemMessage in the final error message when available', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.AgentExecutionBlocked,
        value: {
          reason: 'hook_blocked',
          systemMessage: 'Blocked by policy hook',
        },
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const err = result[0] as AgentEvent<'error'>;
      expect(err.message).toBe('Blocked by policy hook');
    });
  });

  describe('LoopDetected events', () => {
    it('emits a non-fatal warning error event', () => {
      state.streamStartEmitted = true;
      const event: ServerGeminiStreamEvent = {
        type: GeminiEventType.LoopDetected,
      };
      const result = translateEvent(event, state);
      expect(result).toHaveLength(1);
      const err = result[0] as AgentEvent<'error'>;
      expect(err.type).toBe('error');
      expect(err.fatal).toBe(false);
      expect(err._meta?.['code']).toBe('LOOP_DETECTED');
      expect(err.message).toBe('Loop detected, stopping execution');
    });
  });
});
