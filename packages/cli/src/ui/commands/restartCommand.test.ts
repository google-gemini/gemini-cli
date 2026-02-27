/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { Mock } from 'vitest';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { restartCommand } from './restartCommand.js';
import { type CommandContext } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { SessionEndReason , flushTelemetry } from '@google/gemini-cli-core';

// Mock the relaunch module
vi.mock('../../utils/relaunch.js', () => ({
  relaunchAppInChildProcess: vi.fn().mockResolvedValue(undefined),
}));

// Mock the telemetry service
vi.mock('@google/gemini-cli-core', async () => {
  const actual = await vi.importActual('@google/gemini-cli-core');
  return {
    ...actual,
    flushTelemetry: vi.fn().mockResolvedValue(undefined),
  };
});

import { relaunchAppInChildProcess } from '../../utils/relaunch.js';

describe('restartCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContext = createMockCommandContext({
      services: {
        config: {
          getSessionId: vi.fn().mockReturnValue('test-session-id-123'),
          getHookSystem: vi.fn().mockReturnValue({
            fireSessionEndEvent: vi.fn().mockResolvedValue(undefined),
            fireSessionStartEvent: vi.fn().mockResolvedValue(undefined),
          }),
        },
      },
    });
  });

  it('should restart with the current session ID preserved', async () => {
    if (!restartCommand.action) {
      throw new Error('restartCommand must have an action.');
    }

    await restartCommand.action(mockContext, '');

    // Verify session ID is retrieved
    const config = mockContext.services.config as unknown as Record<
      string,
      Mock
    >;
    expect(config.getSessionId).toHaveBeenCalledTimes(1);

    // Verify SessionEnd hook is fired
    const hookSystem = config.getHookSystem();
    expect(hookSystem.fireSessionEndEvent).toHaveBeenCalledWith(
      SessionEndReason.Restart,
    );

    // Verify telemetry is flushed
    expect(flushTelemetry).toHaveBeenCalledWith(config);

    // Verify relaunch is called with the correct session ID
    expect(relaunchAppInChildProcess).toHaveBeenCalledWith(
      [],
      ['--resume', 'test-session-id-123'],
    );
  });

  it('should set debug message during restart', async () => {
    if (!restartCommand.action) {
      throw new Error('restartCommand must have an action.');
    }

    await restartCommand.action(mockContext, '');

    expect(mockContext.ui.setDebugMessage).toHaveBeenCalledWith(
      'Restarting CLI with current session...',
    );
  });

  it('should return error message when config is not available', async () => {
    if (!restartCommand.action) {
      throw new Error('restartCommand must have an action.');
    }

    const nullConfigContext = createMockCommandContext({
      services: {
        config: null,
      },
    });

    const result = await restartCommand.action(nullConfigContext, '');

    expect(result).toEqual({
      type: 'message',
      messageType: 'error',
      content: 'Unable to restart: config not available',
    });

    // Relaunch should not be called when config is unavailable
    expect(relaunchAppInChildProcess).not.toHaveBeenCalled();
  });

  it('should flush telemetry after firing session end event', async () => {
    if (!restartCommand.action) {
      throw new Error('restartCommand must have an action.');
    }

    const callOrder: string[] = [];

    const config = mockContext.services.config as unknown as Record<
      string,
      Record<string, Mock> | Mock
    >;
    (
      (config.getHookSystem as Mock)() as Record<string, Mock>
    ).fireSessionEndEvent.mockImplementation(async () => {
      callOrder.push('fireSessionEndEvent');
    });

    (flushTelemetry as Mock).mockImplementation(async () => {
      callOrder.push('flushTelemetry');
    });

    await restartCommand.action(mockContext, '');

    // Verify order: fireSessionEndEvent -> flushTelemetry
    const fireIndex = callOrder.indexOf('fireSessionEndEvent');
    const flushIndex = callOrder.indexOf('flushTelemetry');

    expect(fireIndex).toBeLessThan(flushIndex);
  });
});
