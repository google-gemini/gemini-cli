/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { MessageType } from '../types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import { debugCompanionCommand } from './debugCompanionCommand.js';

describe('debugCompanionCommand', () => {
  it('shows status by default', async () => {
    const mockContext = createMockCommandContext({
      services: {
        config: {
          getDebugCompanionMode: () => false,
          getToolRegistry: () => ({
            getTool: () => ({}),
          }),
        },
      },
    });

    if (!debugCompanionCommand.action) throw new Error('Action not defined');
    await debugCompanionCommand.action(mockContext, '');

    const [message] = (mockContext.ui.addItem as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(message.type).toBe(MessageType.INFO);
    expect(message.text).toContain('Debug companion mode: disabled');
  });

  it('enables mode with /debug on', async () => {
    const setDebugCompanionMode = vi.fn();
    const mockContext = createMockCommandContext({
      services: {
        config: {
          setDebugCompanionMode,
          getDebugCompanionMode: () => true,
          getToolRegistry: () => ({
            getTool: () => ({}),
          }),
        },
      },
    });

    if (!debugCompanionCommand.action) throw new Error('Action not defined');
    await debugCompanionCommand.action(mockContext, 'on');

    expect(setDebugCompanionMode).toHaveBeenCalledWith(true);
  });

  it('disables mode with /debug off', async () => {
    const setDebugCompanionMode = vi.fn();
    const mockContext = createMockCommandContext({
      services: {
        config: {
          setDebugCompanionMode,
          getDebugCompanionMode: () => false,
          getToolRegistry: () => ({
            getTool: () => ({}),
          }),
        },
      },
    });

    if (!debugCompanionCommand.action) throw new Error('Action not defined');
    await debugCompanionCommand.action(mockContext, 'off');

    expect(setDebugCompanionMode).toHaveBeenCalledWith(false);
  });

  it('returns usage error on unknown subcommand', async () => {
    const mockContext = createMockCommandContext({
      services: {
        config: {
          getDebugCompanionMode: () => false,
          getToolRegistry: () => ({
            getTool: () => ({}),
          }),
        },
      },
    });

    if (!debugCompanionCommand.action) throw new Error('Action not defined');
    await debugCompanionCommand.action(mockContext, 'unknown');

    const [message] = (mockContext.ui.addItem as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(message.type).toBe(MessageType.ERROR);
    expect(message.text).toContain('Unknown /debug subcommand');
  });
});
