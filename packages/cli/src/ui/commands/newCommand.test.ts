/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi } from 'vitest';
import { newCommand } from './newCommand.js';
import type { CommandContext } from './types.js';
import { CommandKind } from './types.js';

describe('newCommand', () => {
  it('should have correct name and properties', () => {
    expect(newCommand.name).toBe('new');
    expect(newCommand.description).toBe(
      'Start a new session (current session is saved for later resume)',
    );
    expect(newCommand.kind).toBe(CommandKind.BUILT_IN);
    expect(newCommand.autoExecute).toBe(true);
  });

  it('should return new_session action with messages', () => {
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

    vi.setSystemTime(new Date('2025-01-01T00:10:00Z')); // 10 minutes later

    const result = newCommand.action?.(mockContext, '');

    expect(result).toBeDefined();
    expect(result).toHaveProperty('type', 'new_session');
    expect(result).toHaveProperty('messages');
    if (result && 'messages' in result) {
      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toHaveProperty('type', 'user');
      expect(result.messages[0]).toHaveProperty('text', '/new');
      expect(result.messages[1]).toHaveProperty('type', 'info');
      expect(result.messages[1].text).toContain('Starting new session');
      expect(result.messages[1].text).toContain('/resume');
    }

    vi.useRealTimers();
  });
});
