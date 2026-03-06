/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SlashCommandConflictHandler } from './SlashCommandConflictHandler.js';
import {
  coreEvents,
  CoreEvent,
  type SlashCommandConflictsPayload,
  type SlashCommandConflict,
} from '@google/gemini-cli-core';
import { CommandKind } from '../ui/commands/types.js';

vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    coreEvents: {
      on: vi.fn(),
      off: vi.fn(),
      emitFeedback: vi.fn(),
    },
  };
});

describe('SlashCommandConflictHandler', () => {
  let handler: SlashCommandConflictHandler;

  /**
   * Helper to find and invoke the registered conflict event listener.
   */
  const simulateEvent = (conflicts: SlashCommandConflict[]) => {
    const callback = vi
      .mocked(coreEvents.on)
      .mock.calls.find(
        (call) => call[0] === CoreEvent.SlashCommandConflicts,
      )![1] as (payload: SlashCommandConflictsPayload) => void;
    callback({ conflicts });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    handler = new SlashCommandConflictHandler();
    handler.start();
  });

  afterEach(() => {
    handler.stop();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('should listen for conflict events on start', () => {
    expect(coreEvents.on).toHaveBeenCalledWith(
      CoreEvent.SlashCommandConflicts,
      expect.any(Function),
    );
  });

  it('should display a descriptive message for a single extension conflict', () => {
    simulateEvent([
      {
        name: 'deploy',
        renamedTo: 'firebase.deploy',
        loserExtensionName: 'firebase',
        loserKind: CommandKind.EXTENSION_FILE,
        winnerKind: CommandKind.BUILT_IN,
      },
    ]);

    vi.advanceTimersByTime(600);

    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'info',
      "Extension 'firebase' command '/deploy' was renamed to '/firebase.deploy' because it conflicts with built-in command.",
    );
  });

  it('should display a descriptive message for a single MCP conflict', () => {
    simulateEvent([
      {
        name: 'pickle',
        renamedTo: 'test-server.pickle',
        loserMcpServerName: 'test-server',
        loserKind: CommandKind.MCP_PROMPT,
        winnerExtensionName: 'pickle-rick',
        winnerKind: CommandKind.EXTENSION_FILE,
      },
    ]);

    vi.advanceTimersByTime(600);

    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'info',
      "MCP server 'test-server' command '/pickle' was renamed to '/test-server.pickle' because it conflicts with extension 'pickle-rick' command.",
    );
  });

  it('should group multiple conflicts for the same command name', () => {
    simulateEvent([
      {
        name: 'launch',
        renamedTo: 'user.launch',
        loserKind: CommandKind.USER_FILE,
        winnerKind: CommandKind.WORKSPACE_FILE,
      },
      {
        name: 'launch',
        renamedTo: 'workspace.launch',
        loserKind: CommandKind.WORKSPACE_FILE,
        winnerKind: CommandKind.USER_FILE,
      },
    ]);

    vi.advanceTimersByTime(600);

    expect(coreEvents.emitFeedback).toHaveBeenCalledWith(
      'info',
      `Conflicts detected for command '/launch':
- User command '/launch' was renamed to '/user.launch'
- Workspace command '/launch' was renamed to '/workspace.launch'`,
    );
  });

  it('should debounce multiple events within the flush window', () => {
    simulateEvent([
      {
        name: 'a',
        renamedTo: 'user.a',
        loserKind: CommandKind.USER_FILE,
        winnerKind: CommandKind.BUILT_IN,
      },
    ]);

    vi.advanceTimersByTime(200);

    simulateEvent([
      {
        name: 'b',
        renamedTo: 'user.b',
        loserKind: CommandKind.USER_FILE,
        winnerKind: CommandKind.BUILT_IN,
      },
    ]);

    vi.advanceTimersByTime(600);

    // Should emit two feedbacks (one for each unique command name)
    expect(coreEvents.emitFeedback).toHaveBeenCalledTimes(2);
  });

  it('should deduplicate already notified conflicts', () => {
    const conflict = {
      name: 'deploy',
      renamedTo: 'firebase.deploy',
      loserExtensionName: 'firebase',
      loserKind: CommandKind.EXTENSION_FILE,
      winnerKind: CommandKind.BUILT_IN,
    };

    simulateEvent([conflict]);
    vi.advanceTimersByTime(600);
    expect(coreEvents.emitFeedback).toHaveBeenCalledTimes(1);

    vi.mocked(coreEvents.emitFeedback).mockClear();

    simulateEvent([conflict]);
    vi.advanceTimersByTime(600);
    expect(coreEvents.emitFeedback).not.toHaveBeenCalled();
  });
});
