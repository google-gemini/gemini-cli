/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCoreSystemPrompt } from './prompts.js';
import { resolvePathFromEnv } from '../prompts/utils.js';
import { isGitRepository } from '../utils/gitUtils.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Config } from '../config/config.js';
import type { AgentDefinition } from '../agents/types.js';
import { CodebaseInvestigatorAgent } from '../agents/codebase-investigator.js';
import { GEMINI_DIR } from '../utils/paths.js';
import { debugLogger } from '../utils/debugLogger.js';
import {
  PREVIEW_GEMINI_MODEL,
  PREVIEW_GEMINI_FLASH_MODEL,
  DEFAULT_GEMINI_MODEL_AUTO,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_GEMINI_FLASH_LITE_MODEL,
} from '../config/models.js';
import { ApprovalMode } from '../policy/types.js';
import { DiscoveredMCPTool } from '../tools/mcp-tool.js';
import type { CallableTool } from '@google/genai';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

// Mock tool names if they are dynamically generated or complex
vi.mock('../tools/ls', () => ({ LSTool: { Name: 'list_directory' } }));
vi.mock('../tools/edit', () => ({ EditTool: { Name: 'replace' } }));
vi.mock('../tools/glob', () => ({ GlobTool: { Name: 'glob' } }));
vi.mock('../tools/grep', () => ({ GrepTool: { Name: 'grep_search' } }));
vi.mock('../tools/read-file', () => ({ ReadFileTool: { Name: 'read_file' } }));
vi.mock('../tools/read-many-files', () => ({
  ReadManyFilesTool: { Name: 'read_many_files' },
}));
vi.mock('../tools/shell', () => ({
  ShellTool: class {
    static readonly Name = 'run_shell_command';
    name = 'run_shell_command';
  },
}));
vi.mock('../tools/write-file', () => ({
  WriteFileTool: { Name: 'write_file' },
}));
vi.mock('../agents/codebase-investigator.js', () => ({
  CodebaseInvestigatorAgent: { name: 'codebase_investigator' },
}));
vi.mock('../utils/gitUtils', () => ({
  isGitRepository: vi.fn().mockReturnValue(false),
}));
vi.mock('node:fs');
vi.mock('../config/models.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as object),
  };
});

describe('Core System Prompt (prompts.ts)', () => {
  const mockPlatform = (platform: string) => {
    vi.stubGlobal(
      'process',
      Object.create(process, {
        platform: {
          get: () => platform,
        },
      }),
    );
  };

  let mockConfig: Config;
  beforeEach(() => {
    vi.resetAllMocks();
    // Stub process.platform to 'linux' by default for deterministic snapshots across OSes
    mockPlatform('linux');

    vi.stubEnv('SANDBOX', undefined);
    vi.stubEnv('GEMINI_SYSTEM_MD', undefined);
    vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', undefined);
    mockConfig = {
      getToolRegistry: vi.fn().mockReturnValue({
        getAllToolNames: vi.fn().mockReturnValue([]),
        getAllTools: vi.fn().mockReturnValue([]),
      }),
      getEnableShellOutputEfficiency: vi.fn().mockReturnValue(true),
      storage: {
        getProjectTempDir: vi.fn().mockReturnValue('/tmp/project-temp'),
        getProjectTempPlansDir: vi
          .fn()
          .mockReturnValue('/tmp/project-temp/plans'),
      },
      isInteractive: vi.fn().mockReturnValue(true),
      isInteractiveShellEnabled: vi.fn().mockReturnValue(true),
      isAgentsEnabled: vi.fn().mockReturnValue(false),
      getPreviewFeatures: vi.fn().mockReturnValue(true),
      getModel: vi.fn().mockReturnValue(DEFAULT_GEMINI_MODEL_AUTO),
      getActiveModel: vi.fn().mockReturnValue(DEFAULT_GEMINI_MODEL),
      getMessageBus: vi.fn(),
      getAgentRegistry: vi.fn().mockReturnValue({
        getDirectoryContext: vi.fn().mockReturnValue('Mock Agent Directory'),
        getAllDefinitions: vi.fn().mockReturnValue([
          {
            name: 'mock-agent',
            description: 'Mock Agent Description',
          },
        ]),
      }),
      getSkillManager: vi.fn().mockReturnValue({
        getSkills: vi.fn().mockReturnValue([]),
      }),
      getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.DEFAULT),
      getApprovedPlanPath: vi.fn().mockReturnValue(undefined),
    } as unknown as Config;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should include available_skills when provided in config', () => {
    const skills = [
      {
        name: 'test-skill',
        description: 'A test skill description',
        location: '/path/to/test-skill/SKILL.md',
        body: 'Skill content',
      },
    ];
    vi.mocked(mockConfig.getSkillManager().getSkills).mockReturnValue(skills);
    const prompt = getCoreSystemPrompt(mockConfig);

    expect(prompt).toContain('# Available Agent Skills');
    expect(prompt).toContain(
      "To activate a skill and receive its detailed instructions, you can call the `activate_skill` tool with the skill's name.",
    );
    expect(prompt).toContain('Skill Guidance');
    expect(prompt).toContain('<available_skills>');
    expect(prompt).toContain('<skill>');
    expect(prompt).toContain('<name>test-skill</name>');
    expect(prompt).toContain(
      '<description>A test skill description</description>',
    );
    expect(prompt).toContain(
      '<location>/path/to/test-skill/SKILL.md</location>',
    );
    expect(prompt).toContain('</skill>');
    expect(prompt).toContain('</available_skills>');
    expect(prompt).toMatchSnapshot();
  });

  it('should NOT include skill guidance or available_skills when NO skills are provided', () => {
    vi.mocked(mockConfig.getSkillManager().getSkills).mockReturnValue([]);
    const prompt = getCoreSystemPrompt(mockConfig);

    expect(prompt).not.toContain('# Available Agent Skills');
    expect(prompt).not.toContain('Skill Guidance');
    expect(prompt).not.toContain('activate_skill');
  });

  it('should include sub-agents in XML for preview models', () => {
    vi.mocked(mockConfig.getActiveModel).mockReturnValue(PREVIEW_GEMINI_MODEL);
    const agents = [
      {
        name: 'test-agent',
        displayName: 'Test Agent',
        description: 'A test agent description',
      },
    ];
    vi.mocked(mockConfig.getAgentRegistry().getAllDefinitions).mockReturnValue(
      agents as unknown as AgentDefinition[],
    );
    const prompt = getCoreSystemPrompt(mockConfig);

    expect(prompt).toContain('# Available Sub-Agents');
    expect(prompt).toContain('<available_subagents>');
    expect(prompt).toContain('<subagent>');
    expect(prompt).toContain('<name>Test Agent</name>');
    expect(prompt).toContain(
      '<description>A test agent description</description>',
    );
    expect(prompt).toContain('</subagent>');
    expect(prompt).toContain('</available_subagents>');
    expect(prompt).toMatchSnapshot();
  });

  it('should use legacy system prompt for non-preview model', () => {
    vi.mocked(mockConfig.getActiveModel).mockReturnValue(
      DEFAULT_GEMINI_FLASH_LITE_MODEL,
    );
    const prompt = getCoreSystemPrompt(mockConfig);
    expect(prompt).toContain(
      'You are an interactive CLI agent specializing in software engineering tasks.',
    );
    expect(prompt).not.toContain('No sub-agents are currently available.');
    expect(prompt).toContain('# Core Mandates');
    expect(prompt).toContain('- **Conventions:**');
    expect(prompt).toMatchSnapshot();
  });

  it('should use chatty system prompt for preview model', () => {
    vi.mocked(mockConfig.getActiveModel).mockReturnValue(PREVIEW_GEMINI_MODEL);
    const prompt = getCoreSystemPrompt(mockConfig);
    expect(prompt).toContain('You are Gemini CLI, an interactive CLI agent'); // Check for core content
    expect(prompt).toContain('No Chitchat:');
    expect(prompt).toMatchSnapshot();
  });

  it('should use chatty system prompt for preview flash model', () => {
    vi.mocked(mockConfig.getActiveModel).mockReturnValue(
      PREVIEW_GEMINI_FLASH_MODEL,
    );
    const prompt = getCoreSystemPrompt(mockConfig);
    expect(prompt).toContain('You are Gemini CLI, an interactive CLI agent'); // Check for core content
    expect(prompt).toContain('No Chitchat:');
    expect(prompt).toMatchSnapshot();
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '   \n  \t '],
  ])('should return the base prompt when userMemory is %s', (_, userMemory) => {
    vi.stubEnv('SANDBOX', undefined);
    vi.mocked(mockConfig.getActiveModel).mockReturnValue(PREVIEW_GEMINI_MODEL);
    const prompt = getCoreSystemPrompt(mockConfig, userMemory);
    expect(prompt).not.toContain('---\n\n'); // Separator should not be present
    expect(prompt).toContain('You are Gemini CLI, an interactive CLI agent'); // Check for core content
    expect(prompt).toContain('No Chitchat:');
    expect(prompt).toMatchSnapshot(); // Use snapshot for base prompt structure
  });

  it('should append userMemory with separator when provided', () => {
    vi.stubEnv('SANDBOX', undefined);
    vi.mocked(mockConfig.getActiveModel).mockReturnValue(PREVIEW_GEMINI_MODEL);
    const memory = 'This is custom user memory.\nBe extra polite.';
    const prompt = getCoreSystemPrompt(mockConfig, memory);

    expect(prompt).toContain('# Contextual Instructions (GEMINI.md)');
    expect(prompt).toContain('<loaded_context>');
    expect(prompt).toContain(memory);
    expect(prompt).toContain('You are Gemini CLI, an interactive CLI agent'); // Ensure base prompt follows
    expect(prompt).toMatchSnapshot(); // Snapshot the combined prompt
  });

  it('should match snapshot on Windows', () => {
    mockPlatform('win32');
    vi.stubEnv('SANDBOX', undefined);
    const prompt = getCoreSystemPrompt(mockConfig);
    expect(prompt).toMatchSnapshot();
  });

  it.each([
    ['true', '# Sandbox', ['# macOS Seatbelt', '# Outside of Sandbox']],
    ['sandbox-exec', '# macOS Seatbelt', ['# Sandbox', '# Outside of Sandbox']],
    [undefined, '# Outside of Sandbox', ['# Sandbox', '# macOS Seatbelt']],
  ])(
    'should include correct sandbox instructions for SANDBOX=%s',
    (sandboxValue, expectedContains, expectedNotContains) => {
      vi.stubEnv('SANDBOX', sandboxValue);
      const prompt = getCoreSystemPrompt(mockConfig);
      expect(prompt).toContain(expectedContains);
      expectedNotContains.forEach((text) => expect(prompt).not.toContain(text));
      expect(prompt).toMatchSnapshot();
    },
  );

  it.each([
    [true, true],
    [false, false],
  ])(
    'should handle git instructions when isGitRepository=%s',
    (isGitRepo, shouldContainGit) => {
      vi.stubEnv('SANDBOX', undefined);
      vi.mocked(isGitRepository).mockReturnValue(isGitRepo);
      const prompt = getCoreSystemPrompt(mockConfig);
      shouldContainGit
        ? expect(prompt).toContain('# Git Repository')
        : expect(prompt).not.toContain('# Git Repository');
      expect(prompt).toMatchSnapshot();
    },
  );

  it('should return the interactive avoidance prompt when in non-interactive mode', () => {
    vi.stubEnv('SANDBOX', undefined);
    mockConfig.isInteractive = vi.fn().mockReturnValue(false);
    const prompt = getCoreSystemPrompt(mockConfig, '');
    expect(prompt).toContain('**Interactive Commands:**'); // Check for interactive prompt
    expect(prompt).toMatchSnapshot(); // Use snapshot for base prompt structure
  });

  it.each([
    [[CodebaseInvestigatorAgent.name], true],
    [[], false],
  ])(
    'should handle CodebaseInvestigator with tools=%s',
    (toolNames, expectCodebaseInvestigator) => {
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
        isAgentsEnabled: vi.fn().mockReturnValue(false),
        getModel: vi.fn().mockReturnValue('auto'),
        getActiveModel: vi.fn().mockReturnValue(PREVIEW_GEMINI_MODEL),
        getPreviewFeatures: vi.fn().mockReturnValue(true),
        getAgentRegistry: vi.fn().mockReturnValue({
          getDirectoryContext: vi.fn().mockReturnValue('Mock Agent Directory'),
          getAllDefinitions: vi.fn().mockReturnValue([]),
        }),
        getSkillManager: vi.fn().mockReturnValue({
          getSkills: vi.fn().mockReturnValue([]),
        }),
        getApprovedPlanPath: vi.fn().mockReturnValue(undefined),
      } as unknown as Config;

      const prompt = getCoreSystemPrompt(testConfig);
      if (expectCodebaseInvestigator) {
        expect(prompt).toContain(
          `Utilize specialized sub-agents (e.g., \`codebase_investigator\`) as the primary mechanism for initial discovery`,
        );
        expect(prompt).not.toContain(
          "Use 'grep_search' and 'glob' search tools extensively",
        );
      } else {
        expect(prompt).not.toContain(
          `Utilize specialized sub-agents (e.g., \`codebase_investigator\`) as the primary mechanism for initial discovery`,
        );
        expect(prompt).toContain(
          "Use 'grep_search' and 'glob' search tools extensively",
        );
      }
      expect(prompt).toMatchSnapshot();
    },
  );

  describe('ApprovalMode in System Prompt', () => {
    it('should include PLAN mode instructions', () => {
      vi.mocked(mockConfig.getApprovalMode).mockReturnValue(ApprovalMode.PLAN);
      const prompt = getCoreSystemPrompt(mockConfig);
      expect(prompt).toContain('# Active Approval Mode: Plan');
      expect(prompt).toMatchSnapshot();
    });

    it('should NOT include approval mode instructions for DEFAULT mode', () => {
      vi.mocked(mockConfig.getApprovalMode).mockReturnValue(
        ApprovalMode.DEFAULT,
      );
      const prompt = getCoreSystemPrompt(mockConfig);
      expect(prompt).not.toContain('# Active Approval Mode: Plan');
      expect(prompt).toMatchSnapshot();
    });

    it('should include read-only MCP tools in PLAN mode', () => {
      vi.mocked(mockConfig.getApprovalMode).mockReturnValue(ApprovalMode.PLAN);

      const readOnlyMcpTool = new DiscoveredMCPTool(
        {} as CallableTool,
        'readonly-server',
        'read_static_value',
        'A read-only tool',
        {},
        {} as MessageBus,
        false,
        true, // isReadOnly
      );

      const nonReadOnlyMcpTool = new DiscoveredMCPTool(
        {} as CallableTool,
        'nonreadonly-server',
        'non_read_static_value',
        'A non-read-only tool',
        {},
        {} as MessageBus,
        false,
        false,
      );

      vi.mocked(mockConfig.getToolRegistry().getAllTools).mockReturnValue([
        readOnlyMcpTool,
        nonReadOnlyMcpTool,
      ]);
      vi.mocked(mockConfig.getToolRegistry().getAllToolNames).mockReturnValue([
        readOnlyMcpTool.name,
        nonReadOnlyMcpTool.name,
      ]);

      const prompt = getCoreSystemPrompt(mockConfig);

      expect(prompt).toContain('`read_static_value` (readonly-server)');
      expect(prompt).not.toContain(
        '`non_read_static_value` (nonreadonly-server)',
      );
    });

    it('should only list available tools in PLAN mode', () => {
      vi.mocked(mockConfig.getApprovalMode).mockReturnValue(ApprovalMode.PLAN);
      // Only enable a subset of tools, including ask_user
      vi.mocked(mockConfig.getToolRegistry().getAllToolNames).mockReturnValue([
        'glob',
        'read_file',
        'ask_user',
      ]);

      const prompt = getCoreSystemPrompt(mockConfig);

      // Should include enabled tools
      expect(prompt).toContain('`glob`');
      expect(prompt).toContain('`read_file`');
      expect(prompt).toContain('`ask_user`');

      // Should NOT include disabled tools
      expect(prompt).not.toContain('`google_web_search`');
      expect(prompt).not.toContain('`list_directory`');
      expect(prompt).not.toContain('`grep_search`');
    });

    describe('Approved Plan in Plan Mode', () => {
      beforeEach(() => {
        vi.mocked(mockConfig.getApprovalMode).mockReturnValue(
          ApprovalMode.PLAN,
        );
        vi.mocked(mockConfig.storage.getProjectTempPlansDir).mockReturnValue(
          '/tmp/plans',
        );
      });

      it('should include approved plan path when set in config', () => {
        const planPath = '/tmp/plans/feature-x.md';
        vi.mocked(mockConfig.getApprovedPlanPath).mockReturnValue(planPath);

        const prompt = getCoreSystemPrompt(mockConfig);
        expect(prompt).toMatchSnapshot();
      });

      it('should NOT include approved plan section if no plan is set in config', () => {
        vi.mocked(mockConfig.getApprovedPlanPath).mockReturnValue(undefined);

        const prompt = getCoreSystemPrompt(mockConfig);
        expect(prompt).toMatchSnapshot();
      });
    });
  });

  describe('Platform-specific and Background Process instructions', () => {
    it('should include Windows-specific shell efficiency commands on win32', () => {
      mockPlatform('win32');
      const prompt = getCoreSystemPrompt(mockConfig);
      expect(prompt).toContain(
        "using commands like 'type' or 'findstr' (on CMD) and 'Get-Content' or 'Select-String' (on PowerShell)",
      );
      expect(prompt).not.toContain(
        "using commands like 'grep', 'tail', 'head'",
      );
    });

    it('should include generic shell efficiency commands on non-Windows', () => {
      mockPlatform('linux');
      const prompt = getCoreSystemPrompt(mockConfig);
      expect(prompt).toContain("using commands like 'grep', 'tail', 'head'");
      expect(prompt).not.toContain(
        "using commands like 'type' or 'findstr' (on CMD) and 'Get-Content' or 'Select-String' (on PowerShell)",
      );
    });

    it('should use is_background parameter in background process instructions', () => {
      const prompt = getCoreSystemPrompt(mockConfig);
      expect(prompt).toContain(
        'To run a command in the background, set the `is_background` parameter to true.',
      );
      expect(prompt).not.toContain('via `&`');
    });

    it("should include 'ctrl + f' instructions when interactive shell is enabled", () => {
      vi.mocked(mockConfig.getActiveModel).mockReturnValue(
        PREVIEW_GEMINI_MODEL,
      );
      vi.mocked(mockConfig.isInteractive).mockReturnValue(true);
      vi.mocked(mockConfig.isInteractiveShellEnabled).mockReturnValue(true);
      const prompt = getCoreSystemPrompt(mockConfig);
      expect(prompt).toContain('ctrl + f');
    });

    it("should NOT include 'ctrl + f' instructions when interactive shell is disabled", () => {
      vi.mocked(mockConfig.getActiveModel).mockReturnValue(
        PREVIEW_GEMINI_MODEL,
      );
      vi.mocked(mockConfig.isInteractive).mockReturnValue(true);
      vi.mocked(mockConfig.isInteractiveShellEnabled).mockReturnValue(false);
      const prompt = getCoreSystemPrompt(mockConfig);
      expect(prompt).not.toContain('ctrl + f');
    });
  });

  it('should include approved plan instructions when approvedPlanPath is set', () => {
    const planPath = '/path/to/approved/plan.md';
    vi.mocked(mockConfig.getApprovedPlanPath).mockReturnValue(planPath);
    const prompt = getCoreSystemPrompt(mockConfig);

    expect(prompt).toMatchSnapshot();
  });

  it('should include planning phase suggestion when enter_plan_mode tool is enabled', () => {
    vi.mocked(mockConfig.getToolRegistry().getAllToolNames).mockReturnValue([
      'enter_plan_mode',
    ]);
    const prompt = getCoreSystemPrompt(mockConfig);

    expect(prompt).toContain(
      "For complex tasks, consider using the 'enter_plan_mode' tool to enter a dedicated planning phase before starting implementation.",
    );
    expect(prompt).toMatchSnapshot();
  });

  describe('GEMINI_SYSTEM_MD environment variable', () => {
    it.each(['false', '0'])(
      'should use default prompt when GEMINI_SYSTEM_MD is "%s"',
      (value) => {
        vi.stubEnv('GEMINI_SYSTEM_MD', value);
        const prompt = getCoreSystemPrompt(mockConfig);
        expect(fs.readFileSync).not.toHaveBeenCalled();
        expect(prompt).not.toContain('custom system prompt');
      },
    );

    it('should throw error if GEMINI_SYSTEM_MD points to a non-existent file', () => {
      const customPath = '/non/existent/path/system.md';
      vi.stubEnv('GEMINI_SYSTEM_MD', customPath);
      vi.mocked(fs.existsSync).mockReturnValue(false);
      expect(() => getCoreSystemPrompt(mockConfig)).toThrow(
        `missing system prompt file '${path.resolve(customPath)}'`,
      );
    });

    it.each(['true', '1'])(
      'should read from default path when GEMINI_SYSTEM_MD is "%s"',
      (value) => {
        const defaultPath = path.resolve(path.join(GEMINI_DIR, 'system.md'));
        vi.stubEnv('GEMINI_SYSTEM_MD', value);
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.readFileSync).mockReturnValue('custom system prompt');

        const prompt = getCoreSystemPrompt(mockConfig);
        expect(fs.readFileSync).toHaveBeenCalledWith(defaultPath, 'utf8');
        expect(prompt).toBe('custom system prompt');
      },
    );

    it('should read from custom path when GEMINI_SYSTEM_MD provides one, preserving case', () => {
      const customPath = path.resolve('/custom/path/SyStEm.Md');
      vi.stubEnv('GEMINI_SYSTEM_MD', customPath);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('custom system prompt');

      const prompt = getCoreSystemPrompt(mockConfig);
      expect(fs.readFileSync).toHaveBeenCalledWith(customPath, 'utf8');
      expect(prompt).toBe('custom system prompt');
    });

    it('should expand tilde in custom path when GEMINI_SYSTEM_MD is set', () => {
      const homeDir = '/Users/test';
      vi.spyOn(os, 'homedir').mockReturnValue(homeDir);
      const customPath = '~/custom/system.md';
      const expectedPath = path.join(homeDir, 'custom/system.md');
      vi.stubEnv('GEMINI_SYSTEM_MD', customPath);
      vi.mocked(fs.existsSync).mockReturnValue(true);
      vi.mocked(fs.readFileSync).mockReturnValue('custom system prompt');

      const prompt = getCoreSystemPrompt(mockConfig);
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
      (value) => {
        vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', value);
        getCoreSystemPrompt(mockConfig);
        expect(fs.writeFileSync).not.toHaveBeenCalled();
      },
    );

    it.each(['true', '1'])(
      'should write to default path when GEMINI_WRITE_SYSTEM_MD is "%s"',
      (value) => {
        const defaultPath = path.resolve(path.join(GEMINI_DIR, 'system.md'));
        vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', value);
        getCoreSystemPrompt(mockConfig);
        expect(fs.writeFileSync).toHaveBeenCalledWith(
          defaultPath,
          expect.any(String),
        );
      },
    );

    it('should write to custom path when GEMINI_WRITE_SYSTEM_MD provides one', () => {
      const customPath = path.resolve('/custom/path/system.md');
      vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', customPath);
      getCoreSystemPrompt(mockConfig);
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
      (customPath, relativePath) => {
        const homeDir = '/Users/test';
        vi.spyOn(os, 'homedir').mockReturnValue(homeDir);
        const expectedPath = relativePath
          ? path.join(homeDir, relativePath)
          : homeDir;
        vi.stubEnv('GEMINI_WRITE_SYSTEM_MD', customPath);
        getCoreSystemPrompt(mockConfig);
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
