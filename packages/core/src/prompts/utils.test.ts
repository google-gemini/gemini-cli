/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import {
  resolvePathFromEnv,
  applySubstitutions,
  isSectionEnabled,
} from './utils.js';
import type { Config } from '../config/config.js';

vi.mock('../utils/paths.js', () => ({
  homedir: vi.fn(() => '/mock/home'),
}));

vi.mock('../utils/debugLogger.js', () => ({
  debugLogger: {
    warn: vi.fn(),
  },
}));

vi.mock('./snippets.js', () => ({
  renderSubAgents: vi.fn(
    (agents: Array<{ name: string; description: string }>) =>
      agents.map((a) => `[${a.name}]: ${a.description}`).join('\n'),
  ),
}));

vi.mock('./snippets.legacy.js', () => ({
  renderSubAgents: vi.fn(
    (agents: Array<{ name: string; description: string }>) =>
      agents.map((a) => `legacy[${a.name}]: ${a.description}`).join('\n'),
  ),
}));

describe('resolvePathFromEnv', () => {
  it('returns default result for undefined input', () => {
    expect(resolvePathFromEnv(undefined)).toEqual({
      isSwitch: false,
      value: null,
      isDisabled: false,
    });
  });

  it('returns default result for empty string', () => {
    expect(resolvePathFromEnv('')).toEqual({
      isSwitch: false,
      value: null,
      isDisabled: false,
    });
  });

  it('returns default result for whitespace-only string', () => {
    expect(resolvePathFromEnv('   ')).toEqual({
      isSwitch: false,
      value: null,
      isDisabled: false,
    });
  });

  describe('boolean switch values', () => {
    it('recognizes "true" as an enabled switch', () => {
      expect(resolvePathFromEnv('true')).toEqual({
        isSwitch: true,
        value: 'true',
        isDisabled: false,
      });
    });

    it('recognizes "1" as an enabled switch', () => {
      expect(resolvePathFromEnv('1')).toEqual({
        isSwitch: true,
        value: '1',
        isDisabled: false,
      });
    });

    it('recognizes "false" as a disabled switch', () => {
      expect(resolvePathFromEnv('false')).toEqual({
        isSwitch: true,
        value: 'false',
        isDisabled: true,
      });
    });

    it('recognizes "0" as a disabled switch', () => {
      expect(resolvePathFromEnv('0')).toEqual({
        isSwitch: true,
        value: '0',
        isDisabled: true,
      });
    });

    it('is case-insensitive for switch values', () => {
      expect(resolvePathFromEnv('TRUE')).toEqual({
        isSwitch: true,
        value: 'true',
        isDisabled: false,
      });
      expect(resolvePathFromEnv('False')).toEqual({
        isSwitch: true,
        value: 'false',
        isDisabled: true,
      });
    });

    it('trims whitespace before checking switch values', () => {
      expect(resolvePathFromEnv('  true  ')).toEqual({
        isSwitch: true,
        value: 'true',
        isDisabled: false,
      });
    });
  });

  describe('path resolution', () => {
    it('resolves a relative path to an absolute path', () => {
      const result = resolvePathFromEnv('some/relative/path');
      expect(result.isSwitch).toBe(false);
      expect(result.isDisabled).toBe(false);
      expect(result.value).toBe(path.resolve('some/relative/path'));
    });

    it('resolves an absolute path as-is', () => {
      const result = resolvePathFromEnv('/absolute/path');
      expect(result).toEqual({
        isSwitch: false,
        value: '/absolute/path',
        isDisabled: false,
      });
    });

    it('expands ~ to home directory', () => {
      const result = resolvePathFromEnv('~/my/config');
      expect(result).toEqual({
        isSwitch: false,
        value: path.resolve('/mock/home/my/config'),
        isDisabled: false,
      });
    });

    it('expands bare ~ to home directory', () => {
      const result = resolvePathFromEnv('~');
      expect(result).toEqual({
        isSwitch: false,
        value: path.resolve('/mock/home'),
        isDisabled: false,
      });
    });

    it('returns null when homedir throws an error', async () => {
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

    it('trims whitespace from paths', () => {
      const result = resolvePathFromEnv('  /some/path  ');
      expect(result).toEqual({
        isSwitch: false,
        value: '/some/path',
        isDisabled: false,
      });
    });
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

  it('replaces ${AgentSkills} with the skills prompt', () => {
    const result = applySubstitutions(
      'Skills: ${AgentSkills}',
      mockConfig,
      'skill1, skill2',
    );
    expect(result).toBe('Skills: skill1, skill2');
  });

  it('replaces multiple ${AgentSkills} occurrences', () => {
    const result = applySubstitutions(
      '${AgentSkills} and ${AgentSkills}',
      mockConfig,
      'skills',
    );
    expect(result).toBe('skills and skills');
  });

  it('replaces ${SubAgents} with rendered sub-agent content', () => {
    vi.mocked(mockConfig.getAgentRegistry).mockReturnValue({
      getAllDefinitions: vi.fn().mockReturnValue([
        { name: 'agent1', description: 'desc1' },
        { name: 'agent2', description: 'desc2' },
      ]),
    } as never);

    const result = applySubstitutions('Agents: ${SubAgents}', mockConfig, '');
    // isGemini3 defaults to false, so legacy snippets are used
    expect(result).toBe('Agents: legacy[agent1]: desc1\nlegacy[agent2]: desc2');
  });

  it('uses non-legacy snippets when isGemini3 is true', () => {
    vi.mocked(mockConfig.getAgentRegistry).mockReturnValue({
      getAllDefinitions: vi
        .fn()
        .mockReturnValue([{ name: 'agent1', description: 'desc1' }]),
    } as never);

    const result = applySubstitutions(
      'Agents: ${SubAgents}',
      mockConfig,
      '',
      true,
    );
    expect(result).toBe('Agents: [agent1]: desc1');
  });

  it('replaces ${AvailableTools} with tool list', () => {
    vi.mocked(mockConfig.getToolRegistry).mockReturnValue({
      getAllToolNames: vi.fn().mockReturnValue(['read', 'write', 'shell']),
    } as never);

    const result = applySubstitutions(
      'Tools:\n${AvailableTools}',
      mockConfig,
      '',
    );
    expect(result).toBe('Tools:\n- read\n- write\n- shell');
  });

  it('shows fallback message when no tools are available', () => {
    const result = applySubstitutions(
      'Tools: ${AvailableTools}',
      mockConfig,
      '',
    );
    expect(result).toBe('Tools: No tools are currently available.');
  });

  it('replaces ${toolName_ToolName} placeholders with tool names', () => {
    vi.mocked(mockConfig.getToolRegistry).mockReturnValue({
      getAllToolNames: vi.fn().mockReturnValue(['ReadFile', 'EditFile']),
    } as never);

    const result = applySubstitutions(
      'Use ${ReadFile_ToolName} to read and ${EditFile_ToolName} to edit.',
      mockConfig,
      '',
    );
    expect(result).toBe('Use ReadFile to read and EditFile to edit.');
  });

  it('returns original string when no placeholders are present', () => {
    const result = applySubstitutions('No substitutions here.', mockConfig, '');
    expect(result).toBe('No substitutions here.');
  });

  it('handles empty prompt string', () => {
    const result = applySubstitutions('', mockConfig, '');
    expect(result).toBe('');
  });
});

describe('isSectionEnabled', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns true when env var is not set', () => {
    expect(isSectionEnabled('TOOLS')).toBe(true);
  });

  it('returns true when env var is empty string', () => {
    vi.stubEnv('GEMINI_PROMPT_TOOLS', '');
    expect(isSectionEnabled('TOOLS')).toBe(true);
  });

  it('returns false when env var is "0"', () => {
    vi.stubEnv('GEMINI_PROMPT_TOOLS', '0');
    expect(isSectionEnabled('TOOLS')).toBe(false);
  });

  it('returns false when env var is "false"', () => {
    vi.stubEnv('GEMINI_PROMPT_TOOLS', 'false');
    expect(isSectionEnabled('TOOLS')).toBe(false);
  });

  it('returns false when env var is "FALSE" (case-insensitive)', () => {
    vi.stubEnv('GEMINI_PROMPT_TOOLS', 'FALSE');
    expect(isSectionEnabled('TOOLS')).toBe(false);
  });

  it('returns false when env var is "False" (mixed case)', () => {
    vi.stubEnv('GEMINI_PROMPT_TOOLS', 'False');
    expect(isSectionEnabled('TOOLS')).toBe(false);
  });

  it('returns true when env var is "1"', () => {
    vi.stubEnv('GEMINI_PROMPT_TOOLS', '1');
    expect(isSectionEnabled('TOOLS')).toBe(true);
  });

  it('returns true when env var is "true"', () => {
    vi.stubEnv('GEMINI_PROMPT_TOOLS', 'true');
    expect(isSectionEnabled('TOOLS')).toBe(true);
  });

  it('returns true when env var is any other string', () => {
    vi.stubEnv('GEMINI_PROMPT_TOOLS', 'enabled');
    expect(isSectionEnabled('TOOLS')).toBe(true);
  });

  it('converts key to uppercase for env var lookup', () => {
    vi.stubEnv('GEMINI_PROMPT_LOWERCASEKEY', '0');
    expect(isSectionEnabled('lowercasekey')).toBe(false);
  });

  it('trims whitespace around the env var value', () => {
    vi.stubEnv('GEMINI_PROMPT_TOOLS', '  false  ');
    expect(isSectionEnabled('TOOLS')).toBe(false);
  });
});
