/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActivateSkillTool } from './activate-skill.js';
import type { Config } from '../config/config.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';

vi.mock('../utils/getFolderStructure.js', () => ({
  getFolderStructure: vi.fn().mockResolvedValue('Mock folder structure'),
}));

describe('ActivateSkillTool', () => {
  let mockConfig: Config;
  let tool: ActivateSkillTool;
  let mockMessageBus: MessageBus;

  beforeEach(() => {
    mockMessageBus = createMockMessageBus();
    const skills = [
      {
        name: 'test-skill',
        description: 'A test skill',
        location: '/path/to/test-skill/SKILL.md',
      },
    ];
    mockConfig = {
      getWorkspaceContext: vi.fn().mockReturnValue({
        addDirectory: vi.fn(),
      }),
      getSkillManager: vi.fn().mockReturnValue({
        getSkills: vi.fn().mockReturnValue(skills),
        getAllSkills: vi.fn().mockReturnValue(skills),
        getSkill: vi.fn().mockImplementation((name: string) => {
          if (name === 'test-skill') {
            return {
              name: 'test-skill',
              description: 'A test skill',
              location: '/path/to/test-skill/SKILL.md',
              body: 'Skill instructions content.',
            };
          }
          return null;
        }),
        activateSkill: vi.fn(),
      }),
    } as unknown as Config;
    tool = new ActivateSkillTool(mockConfig, mockMessageBus);
  });

  it('should return enhanced description', () => {
    const params = { name: 'test-skill' };
    const invocation = tool.build(params);
    expect(invocation.getDescription()).toBe('"test-skill": A test skill');
  });

  it('should return enhanced confirmation details', async () => {
    const params = { name: 'test-skill' };
    const invocation = tool.build(params);
    const details = await (
      invocation as unknown as {
        getConfirmationDetails: (signal: AbortSignal) => Promise<{
          prompt: string;
          title: string;
        }>;
      }
    ).getConfirmationDetails(new AbortController().signal);

    expect(details.title).toBe('Activate Skill: test-skill');
    expect(details.prompt).toContain('enable the specialized agent skill');
    expect(details.prompt).toContain('A test skill');
    expect(details.prompt).toContain('Mock folder structure');
  });

  it('should skip confirmation for built-in skills', async () => {
    const builtinSkill = {
      name: 'builtin-skill',
      description: 'A built-in skill',
      location: '/path/to/builtin/SKILL.md',
      isBuiltin: true,
      body: 'Built-in instructions',
    };
    vi.mocked(mockConfig.getSkillManager().getSkill).mockReturnValue(
      builtinSkill,
    );
    vi.mocked(mockConfig.getSkillManager().getSkills).mockReturnValue([
      builtinSkill,
    ]);

    const params = { name: 'builtin-skill' };
    const toolWithBuiltin = new ActivateSkillTool(mockConfig, mockMessageBus);
    const invocation = toolWithBuiltin.build(params);

    const details = await (
      invocation as unknown as {
        getConfirmationDetails: (signal: AbortSignal) => Promise<unknown>;
      }
    ).getConfirmationDetails(new AbortController().signal);

    expect(details).toBe(false);
  });

  it('should activate a valid skill and return its content in XML tags', async () => {
    const params = { name: 'test-skill' };
    const invocation = tool.build(params);
    const result = await invocation.execute(new AbortController().signal);

    expect(mockConfig.getSkillManager().activateSkill).toHaveBeenCalledWith(
      'test-skill',
    );
    expect(mockConfig.getWorkspaceContext().addDirectory).toHaveBeenCalledWith(
      '/path/to/test-skill',
    );
    expect(result.llmContent).toContain('<activated_skill name="test-skill">');
    expect(result.llmContent).toContain('<instructions>');
    expect(result.llmContent).toContain('Skill instructions content.');
    expect(result.llmContent).toContain('</instructions>');
    expect(result.llmContent).toContain('<available_resources>');
    expect(result.llmContent).toContain('Mock folder structure');
    expect(result.llmContent).toContain('</available_resources>');
    expect(result.llmContent).toContain('</activated_skill>');
    expect(result.returnDisplay).toContain('Skill **test-skill** activated');
    expect(result.returnDisplay).toContain('Mock folder structure');
  });

  it('should throw error if skill is not in enum', async () => {
    const params = { name: 'non-existent' };
    expect(() => tool.build(params as { name: string })).toThrow();
  });

  it('should return an error if skill content cannot be read', async () => {
    vi.mocked(mockConfig.getSkillManager().getSkill).mockReturnValue(null);
    const params = { name: 'test-skill' };
    const invocation = tool.build(params);
    const result = await invocation.execute(new AbortController().signal);

    expect(result.llmContent).toContain('Error: Skill "test-skill" not found.');
    expect(mockConfig.getSkillManager().activateSkill).not.toHaveBeenCalled();
  });

  it('should validate that name is provided', () => {
    expect(() =>
      tool.build({ name: '' } as unknown as { name: string }),
    ).toThrow();
  });
});
