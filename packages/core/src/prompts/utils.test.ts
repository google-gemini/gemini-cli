/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import {
  resolvePathFromEnv,
  applySubstitutions,
  isSectionEnabled,
} from './utils.js';
import type { Config } from '../config/config.js';
import { debugLogger } from '../utils/debugLogger.js';

vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: {
    warn: vi.fn(),
  },
}));

describe('resolvePathFromEnv', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('when envVar is undefined, empty, or whitespace', () => {
    it.each([
      ['undefined', undefined],
      ['empty string', ''],
      ['whitespace only', '   '],
      ['tabs and newlines', '\t\n'],
    ])('should return null value for %s', (_, input) => {
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
      ['0', '0', true],
      ['false', 'false', true],
      ['1', '1', false],
      ['true', 'true', false],
    ])(
      'should recognize "%s" as a switch',
      (input, expectedValue, expectedIsDisabled) => {
        const result = resolvePathFromEnv(input);
        expect(result).toEqual({
          isSwitch: true,
          value: expectedValue,
          isDisabled: expectedIsDisabled,
        });
      },
    );

    it.each([
      ['FALSE', 'false', true],
      ['TRUE', 'true', false],
      ['False', 'false', true],
      ['True', 'true', false],
    ])(
      'should handle case-insensitive boolean "%s"',
      (input, expectedValue, expectedIsDisabled) => {
        const result = resolvePathFromEnv(input);
        expect(result).toEqual({
          isSwitch: true,
          value: expectedValue,
          isDisabled: expectedIsDisabled,
        });
      },
    );

    it('should handle boolean with surrounding whitespace', () => {
      const result = resolvePathFromEnv('  true  ');
      expect(result).toEqual({
        isSwitch: true,
        value: 'true',
        isDisabled: false,
      });
    });
  });

  describe('when envVar is a file path', () => {
    it('should resolve an absolute path', () => {
      const result = resolvePathFromEnv('/absolute/path/file.txt');
      expect(result).toEqual({
        isSwitch: false,
        value: path.resolve('/absolute/path/file.txt'),
        isDisabled: false,
      });
    });

    it('should resolve a relative path', () => {
      const result = resolvePathFromEnv('relative/path/file.txt');
      expect(result).toEqual({
        isSwitch: false,
        value: path.resolve('relative/path/file.txt'),
        isDisabled: false,
      });
    });

    it('should expand ~ to home directory', () => {
      const homeDir = '/home/testuser';
      vi.spyOn(os, 'homedir').mockReturnValue(homeDir);
      const result = resolvePathFromEnv('~/documents/file.txt');
      expect(result).toEqual({
        isSwitch: false,
        value: path.resolve(path.join(homeDir, 'documents/file.txt')),
        isDisabled: false,
      });
    });

    it('should expand standalone ~ to home directory', () => {
      const homeDir = '/home/testuser';
      vi.spyOn(os, 'homedir').mockReturnValue(homeDir);
      const result = resolvePathFromEnv('~');
      expect(result).toEqual({
        isSwitch: false,
        value: path.resolve(homeDir),
        isDisabled: false,
      });
    });

    it('should handle home directory resolution failure gracefully', () => {
      vi.spyOn(os, 'homedir').mockImplementation(() => {
        throw new Error('Cannot resolve home directory');
      });

      const result = resolvePathFromEnv('~/documents/file.txt');
      expect(result).toEqual({
        isSwitch: false,
        value: null,
        isDisabled: false,
      });
      expect(debugLogger.warn).toHaveBeenCalledWith(
        'Could not resolve home directory for path: ~/documents/file.txt',
        expect.any(Error),
      );
    });

    it('should trim whitespace from path before resolving', () => {
      const result = resolvePathFromEnv('  /some/path  ');
      expect(result).toEqual({
        isSwitch: false,
        value: path.resolve('/some/path'),
        isDisabled: false,
      });
    });
  });
});

describe('applySubstitutions', () => {
  let mockConfig: Config;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockConfig = {
      getAgentRegistry: vi.fn().mockReturnValue({
        getAllDefinitions: vi.fn().mockReturnValue([]),
      }),
      getToolRegistry: vi.fn().mockReturnValue({
        getAllToolNames: vi.fn().mockReturnValue([]),
      }),
    } as unknown as Config;
  });

  it('should replace ${AgentSkills} with skills prompt', () => {
    const prompt = 'Available skills: ${AgentSkills}';
    const result = applySubstitutions(prompt, mockConfig, 'skill1, skill2');
    expect(result).toContain('skill1, skill2');
    expect(result).not.toContain('${AgentSkills}');
  });

  it('should replace multiple ${AgentSkills} occurrences', () => {
    const prompt = 'Skills: ${AgentSkills} | Again: ${AgentSkills}';
    const result = applySubstitutions(prompt, mockConfig, 'mySkill');
    expect(result).toBe('Skills: mySkill | Again: mySkill');
  });

  it('should replace ${SubAgents} with rendered sub-agent content', () => {
    (mockConfig.getAgentRegistry as ReturnType<typeof vi.fn>).mockReturnValue({
      getAllDefinitions: vi.fn().mockReturnValue([
        { name: 'codebase_investigator', description: 'Investigates code' },
        { name: 'generalist', description: 'General agent' },
      ]),
    });

    const prompt = 'Sub agents: ${SubAgents}';
    const result = applySubstitutions(prompt, mockConfig, '');
    expect(result).not.toContain('${SubAgents}');
    expect(result).toContain('codebase_investigator');
    expect(result).toContain('generalist');
  });

  it('should replace ${SubAgents} with empty content when no agents exist', () => {
    const prompt = 'Sub agents: ${SubAgents}';
    const result = applySubstitutions(prompt, mockConfig, '');
    expect(result).not.toContain('${SubAgents}');
  });

  it('should replace ${AvailableTools} with tool names list', () => {
    (mockConfig.getToolRegistry as ReturnType<typeof vi.fn>).mockReturnValue({
      getAllToolNames: vi
        .fn()
        .mockReturnValue(['read_file', 'write_file', 'grep_search']),
    });

    const prompt = 'Tools: ${AvailableTools}';
    const result = applySubstitutions(prompt, mockConfig, '');
    expect(result).toContain('- read_file');
    expect(result).toContain('- write_file');
    expect(result).toContain('- grep_search');
    expect(result).not.toContain('${AvailableTools}');
  });

  it('should replace ${AvailableTools} with fallback when no tools exist', () => {
    const prompt = 'Tools: ${AvailableTools}';
    const result = applySubstitutions(prompt, mockConfig, '');
    expect(result).toContain('No tools are currently available.');
    expect(result).not.toContain('${AvailableTools}');
  });

  it('should replace tool name variables like ${read_file_ToolName}', () => {
    (mockConfig.getToolRegistry as ReturnType<typeof vi.fn>).mockReturnValue({
      getAllToolNames: vi.fn().mockReturnValue(['read_file']),
    });

    const prompt = 'Use ${read_file_ToolName} to read files.';
    const result = applySubstitutions(prompt, mockConfig, '');
    expect(result).toBe('Use read_file to read files.');
  });

  it('should replace multiple different tool name variables', () => {
    (mockConfig.getToolRegistry as ReturnType<typeof vi.fn>).mockReturnValue({
      getAllToolNames: vi.fn().mockReturnValue(['read_file', 'write_file']),
    });

    const prompt =
      'Use ${read_file_ToolName} and ${write_file_ToolName} for file operations.';
    const result = applySubstitutions(prompt, mockConfig, '');
    expect(result).toBe('Use read_file and write_file for file operations.');
  });

  it('should handle prompt with no substitution variables', () => {
    const prompt = 'This is a plain prompt with no variables.';
    const result = applySubstitutions(prompt, mockConfig, '');
    expect(result).toBe(prompt);
  });

  it('should handle empty prompt string', () => {
    const result = applySubstitutions('', mockConfig, '');
    expect(result).toBe('');
  });

  it('should use legacy snippets when isGemini3 is false', () => {
    (mockConfig.getAgentRegistry as ReturnType<typeof vi.fn>).mockReturnValue({
      getAllDefinitions: vi
        .fn()
        .mockReturnValue([{ name: 'test_agent', description: 'A test agent' }]),
    });

    const prompt = '${SubAgents}';
    const resultLegacy = applySubstitutions(prompt, mockConfig, '', false);
    const resultGemini3 = applySubstitutions(prompt, mockConfig, '', true);

    // Both should replace the variable (though content may differ)
    expect(resultLegacy).not.toContain('${SubAgents}');
    expect(resultGemini3).not.toContain('${SubAgents}');
  });

  it('should perform all substitutions together in a complex prompt', () => {
    (mockConfig.getAgentRegistry as ReturnType<typeof vi.fn>).mockReturnValue({
      getAllDefinitions: vi
        .fn()
        .mockReturnValue([{ name: 'helper', description: 'Helps with tasks' }]),
    });
    (mockConfig.getToolRegistry as ReturnType<typeof vi.fn>).mockReturnValue({
      getAllToolNames: vi.fn().mockReturnValue(['grep_search']),
    });

    const prompt =
      'Skills: ${AgentSkills}\nAgents: ${SubAgents}\nTools: ${AvailableTools}\nUse ${grep_search_ToolName}.';
    const result = applySubstitutions(prompt, mockConfig, 'code_review');

    expect(result).toContain('code_review');
    expect(result).toContain('helper');
    expect(result).toContain('- grep_search');
    expect(result).toContain('Use grep_search.');
    expect(result).not.toContain('${AgentSkills}');
    expect(result).not.toContain('${SubAgents}');
    expect(result).not.toContain('${AvailableTools}');
    expect(result).not.toContain('${grep_search_ToolName}');
  });
});

describe('isSectionEnabled', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return true when environment variable is not set', () => {
    vi.stubEnv('GEMINI_PROMPT_TESTSECTION', undefined);
    expect(isSectionEnabled('testSection')).toBe(true);
  });

  it('should return true when environment variable is empty', () => {
    vi.stubEnv('GEMINI_PROMPT_TESTSECTION', '');
    expect(isSectionEnabled('testSection')).toBe(true);
  });

  it('should return false when environment variable is "0"', () => {
    vi.stubEnv('GEMINI_PROMPT_TESTSECTION', '0');
    expect(isSectionEnabled('testSection')).toBe(false);
  });

  it('should return false when environment variable is "false"', () => {
    vi.stubEnv('GEMINI_PROMPT_TESTSECTION', 'false');
    expect(isSectionEnabled('testSection')).toBe(false);
  });

  it('should return false when environment variable is "FALSE" (case-insensitive)', () => {
    vi.stubEnv('GEMINI_PROMPT_TESTSECTION', 'FALSE');
    expect(isSectionEnabled('testSection')).toBe(false);
  });

  it('should return false when environment variable is "False" (mixed case)', () => {
    vi.stubEnv('GEMINI_PROMPT_TESTSECTION', 'False');
    expect(isSectionEnabled('testSection')).toBe(false);
  });

  it('should return true when environment variable is "1"', () => {
    vi.stubEnv('GEMINI_PROMPT_TESTSECTION', '1');
    expect(isSectionEnabled('testSection')).toBe(true);
  });

  it('should return true when environment variable is "true"', () => {
    vi.stubEnv('GEMINI_PROMPT_TESTSECTION', 'true');
    expect(isSectionEnabled('testSection')).toBe(true);
  });

  it('should return true when environment variable is any other value', () => {
    vi.stubEnv('GEMINI_PROMPT_TESTSECTION', 'anything');
    expect(isSectionEnabled('testSection')).toBe(true);
  });

  it('should convert key to uppercase for env var lookup', () => {
    vi.stubEnv('GEMINI_PROMPT_MYKEY', '0');
    expect(isSectionEnabled('myKey')).toBe(false);
  });

  it('should handle whitespace in environment variable value', () => {
    vi.stubEnv('GEMINI_PROMPT_TESTSECTION', '  false  ');
    expect(isSectionEnabled('testSection')).toBe(false);
  });

  it('should handle whitespace around "0"', () => {
    vi.stubEnv('GEMINI_PROMPT_TESTSECTION', ' 0 ');
    expect(isSectionEnabled('testSection')).toBe(false);
  });
});
