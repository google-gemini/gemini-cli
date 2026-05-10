/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it } from 'vitest';
import { performMission } from './mission.js';

describe('performMission', () => {
  it('returns error if request is empty', () => {
    const result = performMission('');
    expect(result.type).toBe('message');
    if (result.type === 'message') {
      expect(result.messageType).toBe('error');
      expect(result.content).toContain('Please provide a request');
    }
  });

  it('returns submit_prompt if request is provided', () => {
    const request = 'Refactor the tokenizer';
    const result = performMission(request);
    expect(result.type).toBe('submit_prompt');
    if (result.type === 'submit_prompt') {
      expect(result.content).toContain(request);
      expect(result.content).toContain('mission brief');
      expect(result.content).toContain('Goal');
      expect(result.content).toContain('Safe plan');
      expect(result.content).toContain('Narrow preference');
      expect(result.content).toContain('discover the relevant test file first');
      expect(result.content).toContain('Avoid broad commands');
    }
  });
});
