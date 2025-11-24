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
});
