/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { policiesCommand } from './policiesCommand.js';
import { CommandKind } from './types.js';
import { MessageType } from '../types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import {
  type Config,
  PolicyDecision,
  ApprovalMode,
} from '@google/gemini-cli-core';

describe('policiesCommand', () => {
  let mockContext: ReturnType<typeof createMockCommandContext>;

  beforeEach(() => {
    mockContext = createMockCommandContext();
  });

  it('should have correct command definition', () => {
    expect(policiesCommand.name).toBe('policies');
    expect(policiesCommand.description).toBe('Manage policies');
    expect(policiesCommand.kind).toBe(CommandKind.BUILT_IN);
    expect(policiesCommand.subCommands).toHaveLength(1);
    expect(policiesCommand.subCommands![0].name).toBe('list');
  });

  describe('list subcommand', () => {
    it('should show error if config is missing', async () => {
      mockContext.services.config = null;
      const listCommand = policiesCommand.subCommands![0];

      await listCommand.action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Error: Config not available.',
        }),
        expect.any(Number),
      );
    });

    it('should show message when no policies are active', async () => {
      const mockPolicyEngine = {
        getRules: vi.fn().mockReturnValue([]),
      };
      mockContext.services.config = {
        getPolicyEngine: vi.fn().mockReturnValue(mockPolicyEngine),
      } as unknown as Config;

      const listCommand = policiesCommand.subCommands![0];
      await listCommand.action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'No active policies.',
        }),
        expect.any(Number),
      );
    });

    it('should list policies grouped by mode', async () => {
      const mockRules = [
        {
          decision: PolicyDecision.DENY,
          toolName: 'dangerousTool',
          priority: 10,
        },
        {
          decision: PolicyDecision.ALLOW,
          argsPattern: /safe/,
          source: 'test.toml',
        },
        {
          decision: PolicyDecision.ASK_USER,
        },
      ];
      const mockPolicyEngine = {
        getRules: vi.fn().mockReturnValue(mockRules),
      };
      mockContext.services.config = {
        getPolicyEngine: vi.fn().mockReturnValue(mockPolicyEngine),
      } as unknown as Config;

      const listCommand = policiesCommand.subCommands![0];
      await listCommand.action!(mockContext, '');

      expect(mockContext.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('**Active Policies**'),
        }),
        expect.any(Number),
      );

      const call = vi.mocked(mockContext.ui.addItem).mock.calls[0];
      const content = (call[0] as { text: string }).text;

      expect(content).toContain('### Normal Mode Policies');
      expect(content).toContain(
        '### Auto Edit Mode Policies (combined with normal mode policies)',
      );
      expect(content).toContain(
        '### Yolo Mode Policies (combined with normal mode policies)',
      );
      expect(content).toContain('### Plan Mode Policies');
      expect(content).toContain(
        '**DENY** tool: `dangerousTool` [Priority: 10]',
      );
      expect(content).toContain(
        '**ALLOW** all tools (args match: `safe`) [Source: test.toml]',
      );
      expect(content).toContain('**ASK_USER** all tools');
    });

    it('should show plan-only rules in plan mode section', async () => {
      const mockRules = [
        {
          decision: PolicyDecision.ALLOW,
          toolName: 'glob',
          priority: 70,
          modes: [ApprovalMode.PLAN],
        },
        {
          decision: PolicyDecision.DENY,
          priority: 60,
          modes: [ApprovalMode.PLAN],
        },
        {
          decision: PolicyDecision.ALLOW,
          toolName: 'shell',
          priority: 50,
        },
      ];
      const mockPolicyEngine = {
        getRules: vi.fn().mockReturnValue(mockRules),
      };
      mockContext.services.config = {
        getPolicyEngine: vi.fn().mockReturnValue(mockPolicyEngine),
      } as unknown as Config;

      const listCommand = policiesCommand.subCommands![0];
      await listCommand.action!(mockContext, '');

      const call = vi.mocked(mockContext.ui.addItem).mock.calls[0];
      const content = (call[0] as { text: string }).text;

      // Plan-only rules appear under Plan Mode section
      expect(content).toContain('### Plan Mode Policies');
      // glob ALLOW is plan-only, should appear in plan section
      expect(content).toContain('**ALLOW** tool: `glob` [Priority: 70]');
      // shell ALLOW has no modes (applies to all), appears in normal section
      expect(content).toContain('**ALLOW** tool: `shell` [Priority: 50]');
    });
  });
});
