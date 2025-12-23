/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCoreSystemPrompt, resolvePathFromEnv } from './prompts.js';
import { isGitRepository } from '../utils/gitUtils.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Config } from '../config/config.js';
import { CodebaseInvestigatorAgent } from '../agents/codebase-investigator.js';
import { GEMINI_DIR } from '../utils/paths.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  DEFAULT_GEMINI_MODEL,
} from '../config/models.js';

// Mock tool names if they are dynamically generated or complex
vi.mock('../tools/ls', () => ({ LSTool: { Name: 'list_directory' } }));
vi.mock('../tools/edit', () => ({ EditTool: { Name: 'replace' } }));
vi.mock('../tools/glob', () => ({ GlobTool: { Name: 'glob' } }));
vi.mock('../tools/grep', () => ({ GrepTool: { Name: 'search_file_content' } }));
vi.mock('../tools/read-file', () => ({ ReadFileTool: { Name: 'read_file' } }));
vi.mock('../tools/read-many-files', () => ({
  ReadManyFilesTool: { Name: 'read_many_files' },
}));
vi.mock('../tools/shell', () => ({
  ShellTool: { Name: 'run_shell_command' },
}));
vi.mock('../tools/write-file', () => ({
  WriteFileTool: { Name: 'write_file' },
}));
vi.mock('../agents/codebase-investigator.js', () => ({
  CodebaseInvestigatorAgent: { name: 'codebase_investigator' },
}));
vi.mock('../utils/gitUtils', () => ({
  isGitRepository: vi.fn(),
}));
vi.mock('node:fs');
vi.mock('../config/models.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
  };
});

describe('Core System Prompt (prompts.ts)', () => {
  let mockConfig: Config;
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('GEMINI_SYSTEM_MD', undefined);
    vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', undefined);
    mockConfig = {
      getToolRegistry: vi.fn().mockReturnValue({
        getAllToolNames: vi.fn().mockReturnValue([]),
      }),
      getEnableShellOutputEfficiency: vi.fn().mockReturnValue(true),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/project-temp'),
      },
      isInteractive: vi.fn().mockReturnValue(true),
      isInteractiveShellEnabled: vi.fn().mockReturnValue(true),
      getModel: vi.fn().mockReturnValue(DEFAULT_GEMINI_MODEL_AUTO),
      getActiveModel: vi.fn().mockReturnValue(DEFAULT_GEMINI_MODEL),
      getPreviewFeatures: vi.fn().mockReturnValue(false),
      getAgentRegistry: vi.fn().mockReturnValue({
        getDirectoryContext: vi.fn().mockReturnValue('Mock Agent Directory'),
      }),
      getSkillManager: vi.fn().mockReturnValue({
        getSkills: vi.fn().mockReturnValue([]),
      }),
    } as unknown as Config;
  });

  it('should include available_skills when provided in config', async () => {
    const skills = [
      {
        name: 'test-skill',
        description: 'A test skill description',
        location: '/path/to/test-skill/SKILL.md',
      },
    ];
    vi.mocked(mockConfig.getSkillManager().getSkills).mockReturnValue(skills);
    const prompt = await getCoreSystemPrompt(mockConfig);

    expect(prompt).toContain('# Available Agent Skills');
    expect(prompt).toContain(
      "To activate a skill and receive its detailed instructions, you MUST first call the `activate_skill` tool with the skill's name. You MUST then follow those detailed instructions strictly.",
    );
    expect(prompt).toContain('Skill Guidance');
    expect(prompt).toContain('```json');
    expect(prompt).toContain('"name": "test-skill"');
    expect(prompt).toContain('"description": "A test skill description"');
    expect(prompt).toContain('"location": "/path/to/test-skill/SKILL.md"');
    expect(prompt).toContain('```');
  });

  it('should NOT include skill guidance or available_skills when NO skills are provided', async () => {
    vi.mocked(mockConfig.getSkillManager().getSkills).mockReturnValue([]);
    const prompt = await getCoreSystemPrompt(mockConfig);

    expect(prompt).not.toContain('# Available Agent Skills');
    expect(prompt).not.toContain('Skill Guidance');
    expect(prompt).not.toContain('activate_skill');
  });

  it('should use chatty system prompt for preview model', async () => {
    vi.mocked(mockConfig.getActiveModel).mockReturnValue(PREVIEW_GEMINI_MODEL);
    const prompt = await getCoreSystemPrompt(mockConfig);
    expect(prompt).toContain('You are an interactive CLI agent'); // Check for core content
    expect(prompt).not.toContain('No Chitchat:');
  });

  it('should use chatty system prompt for preview flash model', async () => {
    vi.mocked(mockConfig.getActiveModel).mockReturnValue(
      PREVIEW_GEMINI_FLASH_MODEL,
    );
    const prompt = await getCoreSystemPrompt(mockConfig);
    expect(prompt).toContain('Do not call tools in silence');
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   \n  \t '],
  ])(
    'should return the base prompt when userMemory is %s',
    async (_, userMemory) => {
      vi.stubEnv('SANDBOX', undefined);
      const prompt = await getCoreSystemPrompt(mockConfig, userMemory);
      expect(prompt).not.toContain('---\n\n'); // Separator should not be present
      expect(prompt).toContain('You are an interactive CLI agent'); // Check for core content
      expect(prompt).toContain('No Chitchat:');
    },
  );

  it('should append userMemory with separator when provided', async () => {
    vi.stubEnv('SANDBOX', undefined);
    const memory = 'This is custom user memory.\nBe extra polite.';
    const expectedSuffix = `\n\n---\n\n${memory}`;
    const prompt = await getCoreSystemPrompt(mockConfig, memory);

    expect(prompt.endsWith(expectedSuffix)).toBe(true);
    expect(prompt).toContain('You are an interactive CLI agent'); // Ensure base prompt follows
  });

  it.each([
    ['true', '# Sandbox', ['# macOS Seatbelt', '# Outside of Sandbox']],
    ['sandbox-exec', '# macOS Seatbelt', ['# Sandbox', '# Outside of Sandbox']],
    [undefined, '# Outside of Sandbox', ['# Sandbox', '# macOS Seatbelt']],
  ])(
    'should include correct sandbox instructions for SANDBOX=%s',
    async (sandboxValue, expectedContains, expectedNotContains) => {
      vi.stubEnv('SANDBOX', sandboxValue);
      const prompt = await getCoreSystemPrompt(mockConfig);
      expect(prompt).toContain(expectedContains);
      expectedNotContains.forEach((text) => expect(prompt).not.toContain(text));
    },
  );

  it.each([
    [true, true],
    [false, false],
  ])(
    'should handle git instructions when isGitRepository=%s',
    async (isGitRepo, shouldContainGit) => {
      vi.stubEnv('SANDBOX', undefined);
      vi.mocked(isGitRepository).mockReturnValue(isGitRepo);
      const prompt = await getCoreSystemPrompt(mockConfig);
      shouldContainGit
        ? expect(prompt).toContain('# Git Repository')
        : expect(prompt).not.toContain('# Git Repository');
    },
  );

  it('should return the interactive avoidance prompt when in non-interactive mode', async () => {
    vi.stubEnv('SANDBOX', undefined);
    mockConfig.isInteractive = vi.fn().mockReturnValue(false);
    const prompt = await getCoreSystemPrompt(mockConfig, '');
    expect(prompt).toContain('**Interactive Commands:**'); // Check for interactive prompt
  });

  it.each([
    [[CodebaseInvestigatorAgent.name], true],
    [[], false],
  ])(
    'should handle CodebaseInvestigator with tools=%s',
    async (toolNames, expectCodebaseInvestigator) => {
      const testConfig = {
        getToolRegistry: vi.fn().mockReturnValue({
          getAllToolNames: vi.fn().mockReturnValue(toolNames),
        }),
        getEnableShellOutputEfficiency: vi.fn().mockReturnValue(true),
        storage: {
          getProjectTempDir: vi.fn().mockReturnValue('/tmp/project-temp'),
        },
        isInteractive: vi.fn().mockReturnValue(false),
        isInteractiveShellEnabled: vi.fn().mockReturnValue(false),
        getModel: vi.fn().mockReturnValue('auto'),
        getActiveModel: vi.fn().mockReturnValue(DEFAULT_GEMINI_MODEL),
        getPreviewFeatures: vi.fn().mockReturnValue(false),
        getAgentRegistry: vi.fn().mockReturnValue({
          getDirectoryContext: vi.fn().mockReturnValue('Mock Agent Directory'),
        }),
        getSkillManager: vi.fn().mockReturnValue({
          getSkills: vi.fn().mockReturnValue([]),
        }),
      } as unknown as Config;

      const prompt = await getCoreSystemPrompt(testConfig);
      if (expectCodebaseInvestigator) {
        expect(prompt).toContain(
          `your **first and primary action** must be to delegate to the '${CodebaseInvestigatorAgent.name}' agent`,
        );
        expect(prompt).toContain(`do not ignore the output of the agent`);
        expect(prompt).not.toContain(
          "Use 'search_file_content' and 'glob' search tools extensively",
        );
      } else {
        expect(prompt).not.toContain(
          `your **first and primary action** must be to delegate to the '${CodebaseInvestigatorAgent.name}' agent`,
        );
        expect(prompt).toContain(
          "Use 'search_file_content' and 'glob' search tools extensively",
        );
      }
    },
  );

  describe('GEMINI_SYSTEM_MD environment variable', () => {
    it.each(['false', '0'])(
      'should use default prompt when GEMINI_SYSTEM_MD is "%s"',
      async (value) => {
        vi.stubEnv('GEMINI_SYSTEM_MD', value);
        const prompt = await getCoreSystemPrompt(mockConfig);
        expect(fs.readFileSync).not.toHaveBeenCalled();
        expect(prompt).not.toContain('custom system prompt');
      },
    );

    it('should throw error if GEMINI_SYSTEM_MD points to a non-existent file', async () => {
      const customPath = '/non/existent/path/system.md';
      vi.stubEnv('GEMINI_SYSTEM_MD', customPath);
      vi.mocked(fs.existsSync).mockReturnValue(false);
      await expect(() => getCoreSystemPrompt(mockConfig)).rejects.toThrow(
        `missing system prompt file '${path.resolve(customPath)}'`,
      );
    });

    it.each(['true', '1'])(
      'should read from default path when GEMINI_SYSTEM_MD is "%s"',
      async (value) => {
        const defaultPath = path.resolve(path.join(GEMINI_DIR, 'system.md'));
        vi.stubEnv('GEMINI_SYSTEM_MD', value);
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('custom system prompt');

        const prompt = await getCoreSystemPrompt(mockConfig);
        expect(fs.readFileSync).toHaveBeenCalledWith(defaultPath, 'utf8');
        expect(prompt).toBe('custom system prompt');
      },
    );

    it('should read from custom path when GEMINI_SYSTEM_MD provides one, preserving case', async () => {
      const customPath = path.resolve('/custom/path/SyStEm.Md');
      vi.stubEnv('GEMINI_SYSTEM_MD', customPath);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('custom system prompt');

      const prompt = await getCoreSystemPrompt(mockConfig);
      expect(fs.readFileSync).toHaveBeenCalledWith(customPath, 'utf8');
      expect(prompt).toBe('custom system prompt');
    });

    it('should expand tilde in custom path when GEMINI_SYSTEM_MD is set', async () => {
      const homeDir = '/Users/test';
      vi.spyOn(os, 'homedir').mockReturnValue(homeDir);
      const customPath = '~/custom/system.md';
      const expectedPath = path.join(homeDir, 'custom/system.md');
      vi.stubEnv('GEMINI_SYSTEM_MD', customPath);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('custom system prompt');

      const prompt = await getCoreSystemPrompt(mockConfig);
      expect(fs.readFileSync).toHaveBeenCalledWith(
        path.resolve(expectedPath),
        'utf8',
      );
      expect(prompt).toBe('custom system prompt');
    });
  });

  describe('GEMINI_WRITE_SYSTEM_MD environment variable', () => {
    it.each(['false', '0'])(
      'should not write to file when GEMINI_WRITE_SYSTEM_MD is "%s"',
      async (value) => {
        vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', value);
        await getCoreSystemPrompt(mockConfig);
        expect(fs.writeFileSync).not.toHaveBeenCalled();
      },
    );

    it.each(['true', '1'])(
      'should write to default path when GEMINI_WRITE_SYSTEM_MD is "%s"',
      async (value) => {
        const defaultPath = path.resolve(path.join(GEMINI_DIR, 'system.md'));
        vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', value);
        await getCoreSystemPrompt(mockConfig);
        expect(fs.writeFileSync).toHaveBeenCalledWith(
          defaultPath,
          expect.any(String),
        );
      },
    );

    it('should write to custom path when GEMINI_WRITE_SYSTEM_MD provides one', async () => {
      const customPath = path.resolve('/custom/path/system.md');
      vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', customPath);
      await getCoreSystemPrompt(mockConfig);
      expect(fs.writeFileSync).toHaveBeenCalledWith(
        customPath,
        expect.any(String),
      );
    });

    it.each([
      ['~/custom/system.md', 'custom/system.md'],
      ['~', ''],
    ])(
      'should expand tilde in custom path when GEMINI_WRITE_SYSTEM_MD is "%s"',
      async (customPath, relativePath) => {
        const homeDir = '/Users/test';
        vi.spyOn(os, 'homedir').mockReturnValue(homeDir);
        const expectedPath = relativePath
          ? path.join(homeDir, relativePath)
          : homeDir;
        vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', customPath);
        await getCoreSystemPrompt(mockConfig);
        expect(fs.writeFileSync).toHaveBeenCalledWith(
          path.resolve(expectedPath),
          expect.any(String),
        );
      },
    );
  });
});

describe('resolvePathFromEnv helper function', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  describe('when envVar is undefined, empty, or whitespace', () => {
    it.each([
      ['undefined', undefined],
      ['empty string', ''],
      ['whitespace only', '   \n\t  '],
    ])('should return null for %s', (_, input) => {
      const result = resolvePathFromEnv(input);
      expect(result).toEqual({
        isSwitch: false,
        value: null,
        isDisabled: false,
      });
    });
  });

  describe('when envVar is a boolean-like string', () => {
    it.each([
      ['"0" as disabled switch', '0', '0', true],
      ['"false" as disabled switch', 'false', 'false', true],
      ['"1" as enabled switch', '1', '1', false],
      ['"true" as enabled switch', 'true', 'true', false],
      ['"FALSE" (case-insensitive)', 'FALSE', 'false', true],
      ['"TRUE" (case-insensitive)', 'TRUE', 'true', false],
    ])('should handle %s', (_, input, expectedValue, isDisabled) => {
      const result = resolvePathFromEnv(input);
      expect(result).toEqual({
        isSwitch: true,
        value: expectedValue,
        isDisabled,
      });
    });
  });

  describe('when envVar is a file path', () => {
    it.each([['/absolute/path/file.txt'], ['relative/path/file.txt']])(
      'should resolve path: %s',
      (input) => {
        const result = resolvePathFromEnv(input);
        expect(result).toEqual({
          isSwitch: false,
          value: path.resolve(input),
          isDisabled: false,
        });
      },
    );

    it.each([
      ['~/documents/file.txt', 'documents/file.txt'],
      ['~', ''],
    ])('should expand tilde path: %s', (input, homeRelativePath) => {
      const homeDir = '/Users/test';
      vi.spyOn(os, 'homedir').mockReturnValue(homeDir);
      const result = resolvePathFromEnv(input);
      expect(result).toEqual({
        isSwitch: false,
        value: path.resolve(
          homeRelativePath ? path.join(homeDir, homeRelativePath) : homeDir,
        ),
        isDisabled: false,
      });
    });

    it('should handle os.homedir() errors gracefully', () => {
      vi.spyOn(os, 'homedir').mockImplementation(() => {
        throw new Error('Cannot resolve home directory');
      });
      const consoleSpy = vi
        .spyOn(debugLogger, 'warn')
        .mockImplementation(() => {});

      const result = resolvePathFromEnv('~/documents/file.txt');
      expect(result).toEqual({
        isSwitch: false,
        value: null,
        isDisabled: false,
      });
      expect(consoleSpy).toHaveBeenCalledWith(
        'Could not resolve home directory for path: ~/documents/file.txt',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });
});
