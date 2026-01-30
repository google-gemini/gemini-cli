/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { restartCommand } from './restartCommand.js';
import type { CommandContext } from './types.js';
import { CommandKind } from './types.js';

describe('restartCommand', () => {
  it('should have correct name and properties', () => {
    expect(restartCommand.name).toBe('restart');
    expect(restartCommand.description).toBe(
      'Restart the CLI and resume the current session',
    );
    expect(restartCommand.kind).toBe(CommandKind.BUILT_IN);
    expect(restartCommand.autoExecute).toBe(true);
  });

  it('should return restart action with sessionId', () => {
    const mockSessionStartTime = new Date('2025-01-01T00:00:00Z');
    const mockContext = {
      session: {
        stats: {
          sessionStartTime: mockSessionStartTime,
          sessionId: 'test-session-123',
        },
        sessionShellAllowlist: new Set<string>(),
      },
      services: {
        config: null,
        settings: {} as CommandContext['services']['settings'],
        git: undefined,
        logger: {} as CommandContext['services']['logger'],
      },
      ui: {} as CommandContext['ui'],
    } as unknown as CommandContext;

    vi.setSystemTime(new Date('2025-01-01T00:05:00Z')); // 5 minutes later

    const result = restartCommand.action?.(mockContext, '');

    expect(result).toBeDefined();
    expect(result).toHaveProperty('type', 'restart');
    expect(result).toHaveProperty('sessionId', 'test-session-123');
    expect(result).toHaveProperty('messages');
    if (result && 'messages' in result) {
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toHaveProperty('type', 'user');
      expect(result.messages[0]).toHaveProperty('text', '/restart');
      expect(result.messages[1]).toHaveProperty('type', 'info');
      expect(result.messages[1].text).toContain('Restarting CLI...');
    }

    vi.useRealTimers();
  });
});
