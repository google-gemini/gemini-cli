/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { skillsCommand } from './skillsCommand.js';
import { MessageType, type HistoryItemSkillsList } from '../types.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';
import type { CommandContext } from './types.js';
import type { Config, SkillDefinition } from '@google/gemini-cli-core';
import { SettingScope, type LoadedSettings } from '../../config/settings.js';

vi.mock('../../config/settings.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../../config/settings.js')>();
  return {
    ...actual,
    isLoadableSettingScope: vi.fn((s) => s === 'User' || s === 'Workspace'),
  };
});

describe('skillsCommand', () => {
  let context: CommandContext;

  beforeEach(() => {
    vi.useFakeTimers();
    const skills = [
      {
        name: 'skill1',
        description: 'desc1',
        location: '/loc1',
        body: 'body1',
      },
      {
        name: 'skill2',
        description: 'desc2',
        location: '/loc2',
        body: 'body2',
      },
    ];
    context = createMockCommandContext({
      services: {
        config: {
          getSkillManager: vi.fn().mockReturnValue({
            getAllSkills: vi.fn().mockReturnValue(skills),
            getSkills: vi.fn().mockReturnValue(skills),
            isAdminEnabled: vi.fn().mockReturnValue(true),
            getSkill: vi
              .fn()
              .mockImplementation(
                (name: string) => skills.find((s) => s.name === name) ?? null,
              ),
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

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should add a SKILLS_LIST item to UI with descriptions by default', async () => {
    await skillsCommand.action!(context, '');

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.SKILLS_LIST,
        skills: [
          {
            name: 'skill1',
            description: 'desc1',
            disabled: undefined,
            location: '/loc1',
            body: 'body1',
          },
          {
            name: 'skill2',
            description: 'desc2',
            disabled: undefined,
            location: '/loc2',
            body: 'body2',
          },
        ],
        showDescriptions: true,
      }),
    );
  });

  it('should list skills when "list" subcommand is used', async () => {
    const listCmd = skillsCommand.subCommands!.find((s) => s.name === 'list')!;
    await listCmd.action!(context, '');

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        type: MessageType.SKILLS_LIST,
        skills: [
          {
            name: 'skill1',
            description: 'desc1',
            disabled: undefined,
            location: '/loc1',
            body: 'body1',
          },
          {
            name: 'skill2',
            description: 'desc2',
            disabled: undefined,
            location: '/loc2',
            body: 'body2',
          },
        ],
        showDescriptions: true,
      }),
    );
  });

  it('should disable descriptions if "nodesc" arg is provided to list', async () => {
    const listCmd = skillsCommand.subCommands!.find((s) => s.name === 'list')!;
    await listCmd.action!(context, 'nodesc');

    expect(context.ui.addItem).toHaveBeenCalledWith(
      expect.objectContaining({
        showDescriptions: false,
      }),
    );
  });

  it('should filter built-in skills by default and show them with "all"', async () => {
    const skillManager = context.services.config!.getSkillManager();
    const mockSkills = [
      {
        name: 'regular',
        description: 'desc1',
        location: '/loc1',
        body: 'body1',
      },
      {
        name: 'builtin',
        description: 'desc2',
        location: '/loc2',
        body: 'body2',
        isBuiltin: true,
      },
    ];
    vi.mocked(skillManager.getAllSkills).mockReturnValue(mockSkills);

    const listCmd = skillsCommand.subCommands!.find((s) => s.name === 'list')!;

    // By default, only regular skills
    await listCmd.action!(context, '');
    let lastCall = vi
      .mocked(context.ui.addItem)
      .mock.calls.at(-1)![0] as HistoryItemSkillsList;
    expect(lastCall.skills).toHaveLength(1);
    expect(lastCall.skills[0].name).toBe('regular');

    // With "all", show both
    await listCmd.action!(context, 'all');
    lastCall = vi
      .mocked(context.ui.addItem)
      .mock.calls.at(-1)![0] as HistoryItemSkillsList;
    expect(lastCall.skills).toHaveLength(2);
    expect(lastCall.skills.map((s) => s.name)).toContain('builtin');

    // With "--all", show both
    await listCmd.action!(context, '--all');
    lastCall = vi
      .mocked(context.ui.addItem)
      .mock.calls.at(-1)![0] as HistoryItemSkillsList;
    expect(lastCall.skills).toHaveLength(2);
  });

  describe('disable/enable', () => {
    beforeEach(() => {
      context.services.settings.merged.skills = { disabled: [] };
      (
        context.services.settings as unknown as { workspace: { path: string } }
      ).workspace = {
        path: '/workspace',
      };

      interface MockSettings {
        user: { settings: unknown; path: string };
        workspace: { settings: unknown; path: string };
        forScope: unknown;
      }

      const settings = context.services.settings as unknown as MockSettings;

      settings.forScope = vi.fn((scope) => {
        if (scope === SettingScope.User) return settings.user;
        if (scope === SettingScope.Workspace) return settings.workspace;
        return { settings: {}, path: '' };
      });
      settings.user = {
        settings: {},
        path: '/user/settings.json',
      };
      settings.workspace = {
        settings: {},
        path: '/workspace',
      };
    });

    it('should disable a skill', async () => {
      const disableCmd = skillsCommand.subCommands!.find(
        (s) => s.name === 'disable',
      )!;
      await disableCmd.action!(context, 'skill1');

      expect(context.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'skills.disabled',
        ['skill1'],
      );
      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'Skill "skill1" disabled by adding it to the disabled list in workspace (/workspace) settings. Use "/skills reload" for it to take effect.',
        }),
      );
    });

    it('should enable a skill', async () => {
      const enableCmd = skillsCommand.subCommands!.find(
        (s) => s.name === 'enable',
      )!;
      context.services.settings.merged.skills = { disabled: ['skill1'] };
      (
        context.services.settings as unknown as {
          workspace: { settings: { skills: { disabled: string[] } } };
        }
      ).workspace.settings = {
        skills: { disabled: ['skill1'] },
      };

      await enableCmd.action!(context, 'skill1');

      expect(context.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'skills.disabled',
        [],
      );
      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'Skill "skill1" enabled by removing it from the disabled list in workspace (/workspace) and user (/user/settings.json) settings. Use "/skills reload" for it to take effect.',
        }),
      );
    });

    it('should enable a skill across multiple scopes', async () => {
      const enableCmd = skillsCommand.subCommands!.find(
        (s) => s.name === 'enable',
      )!;
      (
        context.services.settings as unknown as {
          user: { settings: { skills: { disabled: string[] } } };
        }
      ).user.settings = {
        skills: { disabled: ['skill1'] },
      };
      (
        context.services.settings as unknown as {
          workspace: { settings: { skills: { disabled: string[] } } };
        }
      ).workspace.settings = {
        skills: { disabled: ['skill1'] },
      };

      await enableCmd.action!(context, 'skill1');

      expect(context.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.User,
        'skills.disabled',
        [],
      );
      expect(context.services.settings.setValue).toHaveBeenCalledWith(
        SettingScope.Workspace,
        'skills.disabled',
        [],
      );
      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'Skill "skill1" enabled by removing it from the disabled list in workspace (/workspace) and user (/user/settings.json) settings. Use "/skills reload" for it to take effect.',
        }),
      );
    });

    it('should show error if skill not found during disable', async () => {
      const disableCmd = skillsCommand.subCommands!.find(
        (s) => s.name === 'disable',
      )!;
      await disableCmd.action!(context, 'non-existent');

      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Skill "non-existent" not found.',
        }),
        expect.any(Number),
      );
    });

    it('should show error if skills are disabled by admin during disable', async () => {
      const skillManager = context.services.config!.getSkillManager();
      vi.mocked(skillManager.isAdminEnabled).mockReturnValue(false);

      const disableCmd = skillsCommand.subCommands!.find(
        (s) => s.name === 'disable',
      )!;
      await disableCmd.action!(context, 'skill1');

      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Agent skills are disabled by your admin.',
        }),
        expect.any(Number),
      );
    });

    it('should show error if skills are disabled by admin during enable', async () => {
      const skillManager = context.services.config!.getSkillManager();
      vi.mocked(skillManager.isAdminEnabled).mockReturnValue(false);

      const enableCmd = skillsCommand.subCommands!.find(
        (s) => s.name === 'enable',
      )!;
      await enableCmd.action!(context, 'skill1');

      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Agent skills are disabled by your admin.',
        }),
        expect.any(Number),
      );
    });
  });

  describe('reload', () => {
    it('should reload skills successfully and show success message', async () => {
      const reloadCmd = skillsCommand.subCommands!.find(
        (s) => s.name === 'reload',
      )!;
      // Make reload take some time so timer can fire
      const reloadSkillsMock = vi.fn().mockImplementation(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
      });
      // @ts-expect-error Mocking reloadSkills
      context.services.config.reloadSkills = reloadSkillsMock;

      const actionPromise = reloadCmd.action!(context, '');

      // Initially, no pending item (flicker prevention)
      expect(context.ui.setPendingItem).not.toHaveBeenCalled();

      // Fast forward 100ms to trigger the pending item
      await vi.advanceTimersByTimeAsync(100);
      expect(context.ui.setPendingItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'Reloading agent skills...',
        }),
      );

      // Fast forward another 100ms (reload complete), but pending item should stay
      await vi.advanceTimersByTimeAsync(100);
      expect(context.ui.setPendingItem).not.toHaveBeenCalledWith(null);

      // Fast forward to reach 500ms total
      await vi.advanceTimersByTimeAsync(300);
      await actionPromise;

      expect(reloadSkillsMock).toHaveBeenCalled();
      expect(context.ui.setPendingItem).toHaveBeenCalledWith(null);
      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'Agent skills reloaded successfully.',
        }),
      );
    });

    it('should show new skills count after reload', async () => {
      const reloadCmd = skillsCommand.subCommands!.find(
        (s) => s.name === 'reload',
      )!;
      const reloadSkillsMock = vi.fn().mockImplementation(async () => {
        const skillManager = context.services.config!.getSkillManager();
        vi.mocked(skillManager.getSkills).mockReturnValue([
          { name: 'skill1' },
          { name: 'skill2' },
          { name: 'skill3' },
        ] as SkillDefinition[]);
      });
      // @ts-expect-error Mocking reloadSkills
      context.services.config.reloadSkills = reloadSkillsMock;

      await reloadCmd.action!(context, '');

      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'Agent skills reloaded successfully. 1 newly available skill.',
        }),
      );
    });

    it('should show removed skills count after reload', async () => {
      const reloadCmd = skillsCommand.subCommands!.find(
        (s) => s.name === 'reload',
      )!;
      const reloadSkillsMock = vi.fn().mockImplementation(async () => {
        const skillManager = context.services.config!.getSkillManager();
        vi.mocked(skillManager.getSkills).mockReturnValue([
          { name: 'skill1' },
        ] as SkillDefinition[]);
      });
      // @ts-expect-error Mocking reloadSkills
      context.services.config.reloadSkills = reloadSkillsMock;

      await reloadCmd.action!(context, '');

      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'Agent skills reloaded successfully. 1 skill no longer available.',
        }),
      );
    });

    it('should show both added and removed skills count after reload', async () => {
      const reloadCmd = skillsCommand.subCommands!.find(
        (s) => s.name === 'reload',
      )!;
      const reloadSkillsMock = vi.fn().mockImplementation(async () => {
        const skillManager = context.services.config!.getSkillManager();
        vi.mocked(skillManager.getSkills).mockReturnValue([
          { name: 'skill2' }, // skill1 removed, skill3 added
          { name: 'skill3' },
        ] as SkillDefinition[]);
      });
      // @ts-expect-error Mocking reloadSkills
      context.services.config.reloadSkills = reloadSkillsMock;

      await reloadCmd.action!(context, '');

      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.INFO,
          text: 'Agent skills reloaded successfully. 1 newly available skill and 1 skill no longer available.',
        }),
      );
    });

    it('should show error if configuration is missing', async () => {
      const reloadCmd = skillsCommand.subCommands!.find(
        (s) => s.name === 'reload',
      )!;
      context.services.config = null;

      await reloadCmd.action!(context, '');

      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Could not retrieve configuration.',
        }),
      );
    });

    it('should show error if reload fails', async () => {
      const reloadCmd = skillsCommand.subCommands!.find(
        (s) => s.name === 'reload',
      )!;
      const error = new Error('Reload failed');
      const reloadSkillsMock = vi.fn().mockImplementation(async () => {
        await new Promise((_, reject) => setTimeout(() => reject(error), 200));
      });
      // @ts-expect-error Mocking reloadSkills
      context.services.config.reloadSkills = reloadSkillsMock;

      const actionPromise = reloadCmd.action!(context, '');
      await vi.advanceTimersByTimeAsync(100);
      await vi.advanceTimersByTimeAsync(400);
      await actionPromise;

      expect(context.ui.setPendingItem).toHaveBeenCalledWith(null);
      expect(context.ui.addItem).toHaveBeenCalledWith(
        expect.objectContaining({
          type: MessageType.ERROR,
          text: 'Failed to reload skills: Reload failed',
        }),
      );
    });
  });

  describe('completions', () => {
    it('should provide completions for disable (only enabled skills)', async () => {
      const disableCmd = skillsCommand.subCommands!.find(
        (s) => s.name === 'disable',
      )!;
      const skillManager = context.services.config!.getSkillManager();
      const mockSkills = [
        {
          name: 'skill1',
          description: 'desc1',
          disabled: false,
          location: '/loc1',
          body: 'body1',
        },
        {
          name: 'skill2',
          description: 'desc2',
          disabled: true,
          location: '/loc2',
          body: 'body2',
        },
      ];
      vi.mocked(skillManager.getAllSkills).mockReturnValue(mockSkills);
      vi.mocked(skillManager.getSkill).mockImplementation(
        (name: string) => mockSkills.find((s) => s.name === name) ?? null,
      );

      const completions = await disableCmd.completion!(context, 'sk');
      expect(completions).toEqual(['skill1']);
    });

    it('should provide completions for enable (only disabled skills)', async () => {
      const enableCmd = skillsCommand.subCommands!.find(
        (s) => s.name === 'enable',
      )!;
      const skillManager = context.services.config!.getSkillManager();
      const mockSkills = [
        {
          name: 'skill1',
          description: 'desc1',
          disabled: false,
          location: '/loc1',
          body: 'body1',
        },
        {
          name: 'skill2',
          description: 'desc2',
          disabled: true,
          location: '/loc2',
          body: 'body2',
        },
      ];
      vi.mocked(skillManager.getAllSkills).mockReturnValue(mockSkills);
      vi.mocked(skillManager.getSkill).mockImplementation(
        (name: string) => mockSkills.find((s) => s.name === name) ?? null,
      );

      const completions = await enableCmd.completion!(context, 'sk');
      expect(completions).toEqual(['skill2']);
    });
  });
});
