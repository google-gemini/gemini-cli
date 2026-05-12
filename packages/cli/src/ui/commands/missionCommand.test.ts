/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { missionCommand } from './missionCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { CommandContext, SlashCommandActionReturn } from './types.js';
import { getCurrentMission } from '../cockpit/CockpitState.js';

describe('missionCommand', () => {
  let mockContext: CommandContext;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('should return error if request is empty', async () => {
    const result = (await missionCommand.action!(
      mockContext,
      '',
    )) as SlashCommandActionReturn;
    expect(result.type).toBe('message');
    if (result.type === 'message') {
      expect(result.messageType).toBe('error');
    }
  });

  it('should return submit_prompt and activate cockpit mission if request is provided', async () => {
    const request = 'Refactor the tokenizer';
    const result = (await missionCommand.action!(
      mockContext,
      request,
    )) as SlashCommandActionReturn;
    expect(result.type).toBe('submit_prompt');
    if (result.type === 'submit_prompt') {
      expect(result.content).toContain(request);
    }
    expect(getCurrentMission()).toBe(request);
  });

  it('should set the live Autopilot mission context when available', async () => {
    const setAutopilotMission = vi.fn();
    const request = 'fix README typo without touching core';
    mockContext = createMockCommandContext({
      services: {
        agentContext: {
          config: {
            getPolicyEngine: () => ({ setAutopilotMission }),
          },
        },
      },
    });

    const result = (await missionCommand.action!(
      mockContext,
      request,
    )) as SlashCommandActionReturn;

    expect(result.type).toBe('submit_prompt');
    expect(setAutopilotMission).toHaveBeenCalledWith(request);
  });

  it('should not set Autopilot mission context for an empty request', async () => {
    const setAutopilotMission = vi.fn();
    mockContext = createMockCommandContext({
      services: {
        agentContext: {
          config: {
            getPolicyEngine: () => ({ setAutopilotMission }),
          },
        },
      },
    });

    const result = (await missionCommand.action!(
      mockContext,
      '',
    )) as SlashCommandActionReturn;

    expect(result.type).toBe('message');
    expect(setAutopilotMission).not.toHaveBeenCalled();
  });
});
