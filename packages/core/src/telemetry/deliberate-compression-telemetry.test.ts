/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { makeChatCompressionEvent } from './types.js';

describe('Deliberate Compression Telemetry', () => {
  it('should include goal_was_selected in telemetry event', () => {
    const event = makeChatCompressionEvent({
      tokens_before: 50000,
      tokens_after: 20000,
      goal_was_selected: true,
    });

    expect(event.goal_was_selected).toBe(true);
    expect(event.toLogBody()).toContain('(goal-focused)');
  });

  it('should include messages metrics in telemetry event', () => {
    const event = makeChatCompressionEvent({
      tokens_before: 50000,
      tokens_after: 20000,
      messages_preserved: 10,
      messages_compressed: 40,
    });

    expect(event.messages_preserved).toBe(10);
    expect(event.messages_compressed).toBe(40);
  });

  it('should include trigger_reason in telemetry event', () => {
    const event = makeChatCompressionEvent({
      tokens_before: 50000,
      tokens_after: 20000,
      trigger_reason: 'since-last-prompt',
    });

    expect(event.trigger_reason).toBe('since-last-prompt');
  });

  describe('Opt-out Telemetry', () => {
    it('should track when user selects disable', () => {
      const event = makeChatCompressionEvent({
        tokens_before: 50000,
        tokens_after: 20000,
        user_selected_disable: true,
      });

      expect(event.user_selected_disable).toBe(true);
    });

    it('should track when user selects less_frequent', () => {
      const event = makeChatCompressionEvent({
        tokens_before: 50000,
        tokens_after: 20000,
        user_selected_less_frequent: true,
      });

      expect(event.user_selected_less_frequent).toBe(true);
    });

    it('should track frequency multiplier when applied', () => {
      const event = makeChatCompressionEvent({
        tokens_before: 50000,
        tokens_after: 20000,
        user_selected_less_frequent: true,
        frequency_multiplier_applied: 1.5,
      });

      expect(event.frequency_multiplier_applied).toBe(1.5);
    });

    it('should track new thresholds after less_frequent selection', () => {
      const event = makeChatCompressionEvent({
        tokens_before: 50000,
        tokens_after: 20000,
        user_selected_less_frequent: true,
        frequency_multiplier_applied: 1.5,
        new_token_threshold: 60000,
        new_message_threshold: 38,
      });

      expect(event.new_token_threshold).toBe(60000);
      expect(event.new_message_threshold).toBe(38);
    });

    it('should track safety valve status', () => {
      const event = makeChatCompressionEvent({
        tokens_before: 520000,
        tokens_after: 200000,
        was_safety_valve: true,
      });

      expect(event.was_safety_valve).toBe(true);
    });
  });
});
