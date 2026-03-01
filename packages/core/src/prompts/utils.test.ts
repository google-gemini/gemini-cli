/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolvePathFromEnv,
  isSectionEnabled,
  applySubstitutions,
} from './utils.js';
import type { Config } from '../config/config.js';

vi.mock('../utils/paths.js', () => ({
  homedir: vi.fn().mockReturnValue('/mock/home'),
}));

vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: {
    warn: vi.fn(),
  },
}));

vi.mock('./snippets.js', () => ({
  renderSubAgents: vi.fn().mockReturnValue('mocked-sub-agents'),
}));

vi.mock('./snippets.legacy.js', () => ({
  renderSubAgents: vi.fn().mockReturnValue('mocked-legacy-sub-agents'),
}));

describe('resolvePathFromEnv', () => {
  it('should return default values for undefined input', () => {
    const result = resolvePathFromEnv(undefined);
    expect(result).toEqual({
      isSwitch: false,
      value: null,
      isDisabled: false,
    });
  });

  it('should return default values for empty string input', () => {
    const result = resolvePathFromEnv('');
    expect(result).toEqual({
      isSwitch: false,
      value: null,
      isDisabled: false,
    });
  });

  it('should return default values for whitespace-only input', () => {
    const result = resolvePathFromEnv('   ');
    expect(result).toEqual({
      isSwitch: false,
      value: null,
      isDisabled: false,
    });
  });

  it('should recognize "true" as an enabled switch', () => {
    const result = resolvePathFromEnv('true');
    expect(result).toEqual({
      isSwitch: true,
      value: 'true',
      isDisabled: false,
    });
  });

  it('should recognize "1" as an enabled switch', () => {
    const result = resolvePathFromEnv('1');
    expect(result).toEqual({
      isSwitch: true,
      value: '1',
      isDisabled: false,
    });
  });

  it('should recognize "false" as a disabled switch', () => {
    const result = resolvePathFromEnv('false');
    expect(result).toEqual({
      isSwitch: true,
      value: 'false',
      isDisabled: true,
    });
  });

  it('should recognize "0" as a disabled switch', () => {
    const result = resolvePathFromEnv('0');
    expect(result).toEqual({
      isSwitch: true,
      value: '0',
      isDisabled: true,
    });
  });

  it('should handle case-insensitive switch values', () => {
    const result = resolvePathFromEnv('TRUE');
    expect(result).toEqual({
      isSwitch: true,
      value: 'true',
      isDisabled: false,
    });
  });

  it('should handle case-insensitive FALSE', () => {
    const result = resolvePathFromEnv('FALSE');
    expect(result).toEqual({
      isSwitch: true,
      value: 'false',
      isDisabled: true,
    });
  });

  it('should trim whitespace before evaluating switch values', () => {
    const result = resolvePathFromEnv('  true  ');
    expect(result).toEqual({
      isSwitch: true,
      value: 'true',
      isDisabled: false,
    });
  });

  it('should resolve a regular path', () => {
    const result = resolvePathFromEnv('/some/absolute/path');
    expect(result.isSwitch).toBe(false);
    expect(result.value).toBe('/some/absolute/path');
    expect(result.isDisabled).toBe(false);
  });

  it('should resolve a tilde path to the home directory', () => {
    const result = resolvePathFromEnv('~/my/custom/path');
    expect(result.isSwitch).toBe(false);
    expect(result.value).toContain('/mock/home');
    expect(result.value).toContain('my/custom/path');
    expect(result.isDisabled).toBe(false);
  });

  it('should resolve a bare tilde to the home directory', () => {
    const result = resolvePathFromEnv('~');
    expect(result.isSwitch).toBe(false);
    expect(result.value).toBe('/mock/home');
    expect(result.isDisabled).toBe(false);
  });

  it('should handle home directory resolution failure gracefully', async () => {
    const { homedir } = await import('../utils/paths.js');
    vi.mocked(homedir).mockImplementationOnce(() => {
      throw new Error('No home directory');
    });

    const result = resolvePathFromEnv('~/some/path');
    expect(result).toEqual({
      isSwitch: false,
      value: null,
      isDisabled: false,
    });
  });
});

describe('isSectionEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return true when the env var is not set', () => {
    expect(isSectionEnabled('SOME_KEY')).toBe(true);
  });

  it('should return true when the env var is set to "1"', () => {
    vi.stubEnv('GEMINI_PROMPT_SOME_KEY', '1');
    expect(isSectionEnabled('SOME_KEY')).toBe(true);
  });

  it('should return true when the env var is set to "true"', () => {
    vi.stubEnv('GEMINI_PROMPT_SOME_KEY', 'true');
    expect(isSectionEnabled('SOME_KEY')).toBe(true);
  });

  it('should return false when the env var is set to "0"', () => {
    vi.stubEnv('GEMINI_PROMPT_SOME_KEY', '0');
    expect(isSectionEnabled('SOME_KEY')).toBe(false);
  });

  it('should return false when the env var is set to "false"', () => {
    vi.stubEnv('GEMINI_PROMPT_SOME_KEY', 'false');
    expect(isSectionEnabled('SOME_KEY')).toBe(false);
  });

  it('should handle case-insensitive key conversion', () => {
    vi.stubEnv('GEMINI_PROMPT_MY_SECTION', '0');
    expect(isSectionEnabled('my_section')).toBe(false);
  });

  it('should handle whitespace around the env var value', () => {
    vi.stubEnv('GEMINI_PROMPT_SOME_KEY', '  false  ');
    expect(isSectionEnabled('SOME_KEY')).toBe(false);
  });

  it('should return true for any non-falsy value', () => {
    vi.stubEnv('GEMINI_PROMPT_SOME_KEY', 'enabled');
    expect(isSectionEnabled('SOME_KEY')).toBe(true);
  });
});

describe('applySubstitutions', () => {
  let mockConfig: Config;

  beforeEach(() => {
    mockConfig = {
      getAgentRegistry: vi.fn().mockReturnValue({
        getAllDefinitions: vi.fn().mockReturnValue([]),
      }),
      getToolRegistry: vi.fn().mockReturnValue({
        getAllToolNames: vi.fn().mockReturnValue([]),
      }),
    } as unknown as Config;
  });

  it('should replace ${AgentSkills} with the skills prompt', () => {
    const result = applySubstitutions(
      'Skills: ${AgentSkills}',
      mockConfig,
      'my-skills-content',
    );
    expect(result).toBe('Skills: my-skills-content');
  });

  it('should replace multiple ${AgentSkills} occurrences', () => {
    const result = applySubstitutions(
      '${AgentSkills} and ${AgentSkills}',
      mockConfig,
      'skills',
    );
    expect(result).toBe('skills and skills');
  });

  it('should replace ${SubAgents} with rendered sub-agents content', () => {
    const result = applySubstitutions(
      'Agents: ${SubAgents}',
      mockConfig,
      '',
      true,
    );
    expect(result).toContain('mocked-sub-agents');
  });

  it('should use legacy snippets when isGemini3 is false', () => {
    const result = applySubstitutions(
      'Agents: ${SubAgents}',
      mockConfig,
      '',
      false,
    );
    expect(result).toContain('mocked-legacy-sub-agents');
  });

  it('should replace ${AvailableTools} with tool names list', () => {
    vi.mocked(mockConfig.getToolRegistry).mockReturnValue({
      getAllToolNames: vi.fn().mockReturnValue(['read_file', 'write_file']),
      getAllTools: vi.fn().mockReturnValue([]),
    } as unknown as ReturnType<Config['getToolRegistry']>);

    const result = applySubstitutions(
      'Tools: ${AvailableTools}',
      mockConfig,
      '',
    );
    expect(result).toContain('- read_file');
    expect(result).toContain('- write_file');
  });

  it('should show no tools message when no tools available', () => {
    const result = applySubstitutions(
      'Tools: ${AvailableTools}',
      mockConfig,
      '',
    );
    expect(result).toContain('No tools are currently available.');
  });

  it('should replace tool-specific ${toolName_ToolName} variables', () => {
    vi.mocked(mockConfig.getToolRegistry).mockReturnValue({
      getAllToolNames: vi.fn().mockReturnValue(['read_file']),
      getAllTools: vi.fn().mockReturnValue([]),
    } as unknown as ReturnType<Config['getToolRegistry']>);

    const result = applySubstitutions(
      'Use ${read_file_ToolName} to read',
      mockConfig,
      '',
    );
    expect(result).toBe('Use read_file to read');
  });

  it('should handle a prompt with no substitution placeholders', () => {
    const result = applySubstitutions(
      'A plain prompt with no variables.',
      mockConfig,
      '',
    );
    expect(result).toBe('A plain prompt with no variables.');
  });
});
