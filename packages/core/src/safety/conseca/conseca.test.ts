/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ConsecaSafetyChecker } from './conseca.js';
import { SafetyCheckDecision } from '../protocol.js';
import type { SafetyCheckInput } from '../protocol.js';

describe('ConsecaSafetyChecker', () => {
  let checker: ConsecaSafetyChecker;

  beforeEach(() => {
    // Reset instance for testing if possible, or just get the singleton
    checker = ConsecaSafetyChecker.getInstance();
  });

  it('should be a singleton', () => {
    const instance1 = ConsecaSafetyChecker.getInstance();
    const instance2 = ConsecaSafetyChecker.getInstance();
    expect(instance1).toBe(instance2);
  });

  it('should implement InProcessChecker interface', async () => {
    const input: SafetyCheckInput = {
      protocolVersion: '1.0.0',
      toolCall: { name: 'testTool' },
      context: {
        environment: { cwd: '/tmp', workspaces: [] },
      },
    };

    const result = await checker.check(input);
    expect(result).toBeDefined();
    expect(result.decision).toBe(SafetyCheckDecision.ALLOW);
  });

  it('should initialize with null state', () => {
    expect(checker.getCurrentPolicy()).toBeNull();
    expect(checker.getActiveUserPrompt()).toBeNull();
  });
});
