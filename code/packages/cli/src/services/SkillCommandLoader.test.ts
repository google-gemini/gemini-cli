/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';
import { SkillCommandLoader } from './SkillCommandLoader.js';
import { CommandKind } from '../ui/commands/types.js';
import { ACTIVATE_SKILL_TOOL_NAME } from '@google/gemini-cli-core';

describe('SkillCommandLoader', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockConfig: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockSkillManager: any;

  beforeEach(() => {
    mockSkillManager = {
      getDisplayableSkills: vi.fn(),
      isAdminEnabled: vi.fn().mockReturnValue(true),
    };

    mockConfig = {
      isSkillsSupportEnabled: vi.fn().mockReturnValue(true),
      getSkillManager: vi.fn().mockReturnValue(mockSkillManager),
    };
  });

  it('should return an empty array if skills support is disabled', async () => {
    mockConfig.isSkillsSupportEnabled.mockReturnValue(false);
    const loader = new SkillCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);
    expect(commands).toEqual([]);
  });

  it('should return an empty array if SkillManager is missing', async () => {
    mockConfig.getSkillManager.mockReturnValue(null);
    const loader = new SkillCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);
    expect(commands).toEqual([]);
  });

  it('should return an empty array if skills are admin-disabled', async () => {
    mockSkillManager.isAdminEnabled.mockReturnValue(false);
    const loader = new SkillCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);
    expect(commands).toEqual([]);
  });

  it('should load skills as slash commands', async () => {
    const mockSkills = [
      { name: 'skill1', description: 'Description 1' },
      { name: 'skill2', description: '' },
    ];
    mockSkillManager.getDisplayableSkills.mockReturnValue(mockSkills);

    const loader = new SkillCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);

    expect(commands).toHaveLength(2);

    expect(commands[0]).toMatchObject({
      name: 'skill1',
      description: 'Description 1',
      kind: CommandKind.SKILL,
      autoExecute: true,
    });

    expect(commands[1]).toMatchObject({
      name: 'skill2',
      description: 'Activate the skill2 skill',
      kind: CommandKind.SKILL,
      autoExecute: true,
    });
  });

  it('should return a tool action when a skill command is executed', async () => {
    const mockSkills = [{ name: 'test-skill', description: 'Test skill' }];
    mockSkillManager.getDisplayableSkills.mockReturnValue(mockSkills);

    const loader = new SkillCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actionResult = await commands[0].action!({} as any, '');
    expect(actionResult).toEqual({
      type: 'tool',
      toolName: ACTIVATE_SKILL_TOOL_NAME,
      toolArgs: { name: 'test-skill' },
      postSubmitPrompt: 'Use the skill test-skill',
    });
  });

  it('should return a tool action with postSubmitPrompt when args are provided', async () => {
    const mockSkills = [{ name: 'test-skill', description: 'Test skill' }];
    mockSkillManager.getDisplayableSkills.mockReturnValue(mockSkills);

    const loader = new SkillCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actionResult = await commands[0].action!({} as any, 'hello world');
    expect(actionResult).toEqual({
      type: 'tool',
      toolName: ACTIVATE_SKILL_TOOL_NAME,
      toolArgs: { name: 'test-skill' },
      postSubmitPrompt: 'hello world',
    });
  });

  it('should sanitize skill names with spaces', async () => {
    const mockSkills = [{ name: 'my awesome skill', description: 'Desc' }];
    mockSkillManager.getDisplayableSkills.mockReturnValue(mockSkills);

    const loader = new SkillCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);

    expect(commands[0].name).toBe('my-awesome-skill');

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const actionResult = (await commands[0].action!({} as any, '')) as any;
    expect(actionResult.toolArgs).toEqual({ name: 'my awesome skill' });
  });

  it('should propagate extensionName to the generated slash command', async () => {
    const mockSkills = [
      { name: 'skill1', description: 'desc', extensionName: 'ext1' },
    ];
    mockSkillManager.getDisplayableSkills.mockReturnValue(mockSkills);

    const loader = new SkillCommandLoader(mockConfig);
    const commands = await loader.loadCommands(new AbortController().signal);

    expect(commands[0].extensionName).toBe('ext1');
  });
});
