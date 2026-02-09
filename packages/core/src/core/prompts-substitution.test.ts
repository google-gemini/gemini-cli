/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCoreSystemPrompt } from './prompts.js';
import fs from 'node:fs';
import type { Config } from '../config/config.js';
import type { AgentDefinition } from '../agents/types.js';
import * as toolNames from '../tools/tool-names.js';

vi.mock('node:fs');
vi.mock('../utils/gitUtils', () => ({
  isGitRepository: vi.fn().mockReturnValue(false),
}));

describe('Core System Prompt Substitution', () => {
  let mockConfig: Config;
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('GEMINI_SYSTEM_MD', 'true');
    mockConfig = {
      getToolRegistry: vi.fn().mockReturnValue({
        getAllToolNames: vi
          .fn()
          .mockReturnValue([
            toolNames.WRITE_FILE_TOOL_NAME,
            toolNames.READ_FILE_TOOL_NAME,
          ]),
      }),
      getEnableShellOutputEfficiency: vi.fn().mockReturnValue(true),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/project-temp'),
      },
      isInteractive: vi.fn().mockReturnValue(true),
      isInteractiveShellEnabled: vi.fn().mockReturnValue(true),
      isAgentsEnabled: vi.fn().mockReturnValue(false),
      getModel: vi.fn().mockReturnValue('auto'),
      getActiveModel: vi.fn().mockReturnValue('gemini-1.5-pro'),
      getAgentRegistry: vi.fn().mockReturnValue({
        getDirectoryContext: vi.fn().mockReturnValue('Mock Agent Directory'),
        getAllDefinitions: vi.fn().mockReturnValue([]),
      }),
      getSkillManager: vi.fn().mockReturnValue({
        getSkills: vi.fn().mockReturnValue([]),
      }),
      getApprovedPlanPath: vi.fn().mockReturnValue(undefined),
    } as unknown as Config;
  });

  it('should substitute ${AgentSkills} in custom system prompt', () => {
    const skills = [
      {
        name: 'test-skill',
        description: 'A test skill description',
        location: '/path/to/test-skill/SKILL.md',
        body: 'Skill content',
      },
    ];
    vi.mocked(mockConfig.getSkillManager().getSkills).mockReturnValue(skills);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      'Skills go here: ${AgentSkills}',
    );

    const prompt = getCoreSystemPrompt(mockConfig);

    expect(prompt).toContain('Skills go here:');
    expect(prompt).toContain('<available_skills>');
    expect(prompt).toContain('<name>test-skill</name>');
    expect(prompt).not.toContain('${AgentSkills}');
  });

  it('should substitute ${SubAgents} in custom system prompt', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('Agents: ${SubAgents}');

    vi.mocked(mockConfig.getAgentRegistry().getAllDefinitions).mockReturnValue([
      {
        name: 'test-agent',
        description: 'Test Agent Description',
      } as unknown as AgentDefinition,
    ]);

    const prompt = getCoreSystemPrompt(mockConfig);

    expect(prompt).toContain('Agents:');
    expect(prompt).toContain('# Available Sub-Agents');
    expect(prompt).toContain('- test-agent -> Test Agent Description');
    expect(prompt).not.toContain('${SubAgents}');
  });

  it('should substitute ${AvailableTools} in custom system prompt', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('Tools:\n${AvailableTools}');

    const prompt = getCoreSystemPrompt(mockConfig);

    expect(prompt).toContain(
      `Tools:\n- ${toolNames.WRITE_FILE_TOOL_NAME}\n- ${toolNames.READ_FILE_TOOL_NAME}`,
    );
    expect(prompt).not.toContain('${AvailableTools}');
  });

  it('should substitute tool names using the ${toolName}_ToolName pattern', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      'Use ${write_file_ToolName} and ${read_file_ToolName}.',
    );

    const prompt = getCoreSystemPrompt(mockConfig);

    expect(prompt).toContain(
      `Use ${toolNames.WRITE_FILE_TOOL_NAME} and ${toolNames.READ_FILE_TOOL_NAME}.`,
    );
    expect(prompt).not.toContain('${write_file_ToolName}');
    expect(prompt).not.toContain('${read_file_ToolName}');
  });

  it('should not substitute old patterns', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      '${WriteFileToolName} and ${WRITE_FILE_TOOL_NAME}',
    );

    const prompt = getCoreSystemPrompt(mockConfig);

    expect(prompt).toBe('${WriteFileToolName} and ${WRITE_FILE_TOOL_NAME}');
  });

  it('should not substitute disabled tool names', () => {
    vi.mocked(mockConfig.getToolRegistry().getAllToolNames).mockReturnValue([]);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('Use ${write_file_ToolName}.');

    const prompt = getCoreSystemPrompt(mockConfig);

    expect(prompt).toBe('Use ${write_file_ToolName}.');
  });
});
