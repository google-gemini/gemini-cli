/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { skillsCommand } from './skillsCommand.js';
import { MessageType } from '../types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { CommandContext } from './types.js';
import type { Config } from '@google/gemini-cli-core';
import { SettingScope, type LoadedSettings } from '../../config/settings.js';

describe('skillsCommand', () => {
  let context: CommandContext;

  beforeEach(() => {
    const skills = [
      { name: 'skill1', description: 'desc1' },
      { name: 'skill2', description: 'desc2' },
    ];
    context = createMockCommandContext({
      services: {
        config: {
          getSkillManager: vi.fn().mockReturnValue({
            getSkills: vi.fn().mockReturnValue(skills),
            getAllSkills: vi.fn().mockReturnValue(skills),
          }),
        } as unknown as Config,
        settings: {
          merged: { skills: { disabled: [] } },
          workspace: { path: '/workspace' },
          setValue: vi.fn(),
        } as unknown as LoadedSettings,
      },
    });
  });

  it('should add a SKILLS_LIST item to UI with descriptions by default', async () => {
    await skillsCommand.action(context);

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.SKILLS_LIST,
        skills: [
          { name: 'skill1', description: 'desc1' },
          { name: 'skill2', description: 'desc2' },
        ],
        showDescriptions: true,
      }),
      expect.any(Number),
    );
  });

  it('should list skills when "list" subcommand is used', async () => {
    await skillsCommand.action(context, 'list');

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.SKILLS_LIST,
        skills: [
          { name: 'skill1', description: 'desc1' },
          { name: 'skill2', description: 'desc2' },
        ],
        showDescriptions: true,
      }),
      expect.any(Number),
    );
  });

  it('should disable descriptions if "nodesc" arg is provided to list', async () => {
    await skillsCommand.action(context, 'list nodesc');

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        showDescriptions: false,
      }),
      expect.any(Number),
    );
  });

  describe('disable/enable', () => {
    beforeEach(() => {
      context.services.settings.merged.skills = { disabled: [] };
      (
        context.services.settings as unknown as { workspace: { path: string } }
      ).workspace = {
        path: '/workspace',
      };
    });

    it('should disable a skill', async () => {
      await skillsCommand.action(context, 'disable skill1');

      expect(context.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'skills.disabled',
        ['skill1'],
      );
      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Skill "skill1" disabled'),
        }),
        expect.any(Number),
      );
    });

    it('should enable a skill', async () => {
      context.services.settings.merged.skills = { disabled: ['skill1'] };
      await skillsCommand.action(context, 'enable skill1');

      expect(context.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'skills.disabled',
        [],
      );
      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: expect.stringContaining('Skill "skill1" enabled'),
        }),
        expect.any(Number),
      );
    });

    it('should show error if skill not found during disable', async () => {
      await skillsCommand.action(context, 'disable non-existent');

      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Skill "non-existent" not found.',
        }),
        expect.any(Number),
      );
    });
  });
});
