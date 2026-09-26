/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { superfastCommand } from './superfast-command.js';
import { type CommandContext, CommandKind } from './types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { SettingScope } from '../../config/settings.js';
import type { Config } from '@google/gemini-cli-core';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return { ...actual, probeBackend: vi.fn() };
});

import { probeBackend } from '@google/gemini-cli-core';
const probeBackendMock = vi.mocked(probeBackend);

function ctxWith(enabled: boolean): CommandContext {
  const setValue = vi.fn();
  const ctx = createMockCommandContext({
    services: {
      agentContext: {
        config: {
          getSuperfastSettings: () => ({
            enabled,
            endpoint: 'http://localhost:8000/v1/systemone',
            model: 'von-1.2.0',
            timeoutMs: 150,
          }),
        } as unknown as Config,
      },
      settings: { setValue },
    },
  });
  return ctx;
}

describe('superfastCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('has correct metadata', () => {
    expect(superfastCommand.name).toBe('superfast');
    expect(superfastCommand.kind).toBe(CommandKind.BUILT_IN);
  });

  it('enables and persists on "/superfast on"', async () => {
    const ctx = ctxWith(false);
    const result = (await superfastCommand.action?.(ctx, 'on')) as {
      type: string;
      messageType: string;
      content: string;
    };
    expect(result.type).toBe('message');
    expect(result.messageType).toBe('info');
    expect(ctx.services.settings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      'superfast.enabled',
      true,
    );
  });

  it('disables and persists on "/superfast off"', async () => {
    const ctx = ctxWith(true);
    const result = (await superfastCommand.action?.(ctx, 'off')) as {
      messageType: string;
    };
    expect(result.messageType).toBe('info');
    expect(ctx.services.settings.setValue).toHaveBeenCalledWith(
      SettingScope.User,
      'superfast.enabled',
      false,
    );
  });

  it('rejects an unknown argument', async () => {
    const ctx = ctxWith(false);
    const result = (await superfastCommand.action?.(ctx, 'bogus')) as {
      messageType: string;
    };
    expect(result.messageType).toBe('error');
    expect(ctx.services.settings.setValue).not.toHaveBeenCalled();
  });

  it('status reports OFF when disabled', async () => {
    const ctx = ctxWith(false);
    const result = (await superfastCommand.action?.(ctx, 'status')) as {
      messageType: string;
      content: string;
    };
    expect(result.messageType).toBe('info');
    expect(result.content).toContain('OFF');
    expect(probeBackendMock).not.toHaveBeenCalled();
  });

  it('status reports reachable when the backend answers', async () => {
    probeBackendMock.mockResolvedValue(true);
    const ctx = ctxWith(true);
    const result = (await superfastCommand.action?.(ctx, 'status')) as {
      messageType: string;
      content: string;
    };
    expect(result.messageType).toBe('info');
    expect(result.content).toContain('reachable');
  });

  it('status reports error when the backend is unreachable', async () => {
    probeBackendMock.mockResolvedValue(false);
    const ctx = ctxWith(true);
    const result = (await superfastCommand.action?.(ctx, 'status')) as {
      messageType: string;
      content: string;
    };
    expect(result.messageType).toBe('error');
    expect(result.content).toContain('not reachable');
  });
});
