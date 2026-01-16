/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  DEFAULT_FILE_FILTERING_OPTIONS,
  OutputFormat,
  SHELL_TOOL_NAME,
  WRITE_FILE_TOOL_NAME,
  EDIT_TOOL_NAME,
  WEB_FETCH_TOOL_NAME,
  type ExtensionLoader,
  debugLogger,
  ApprovalMode,
} from '@google/gemini-cli-core';
import { loadCliConfig, parseArguments, type CliArgs } from './config.js';
import { type Settings, createTestMergedSettings } from './settings.js';
import * as ServerConfig from '@google/gemini-cli-core';

import { isWorkspaceTrusted } from './trustedFolders.js';
import { ExtensionManager } from './extension-manager.js';
import { RESUME_LATEST } from '../utils/sessionUtils.js';

vi.mock('./trustedFolders.js', () => ({
  isWorkspaceTrusted: vi.fn(() => ({ isTrusted: true, source: 'file' })), // Default to trusted
}));

vi.mock('./sandboxConfig.js', () => ({
  loadSandboxConfig: vi.fn(async () => undefined),
}));

vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof import('fs')>();
  const pathMod = await import('node:path');
  const mockHome = pathMod.resolve(pathMod.sep, 'mock', 'home', 'user');
  const MOCK_CWD1 = process.cwd();
  const MOCK_CWD2 = pathMod.resolve(pathMod.sep, 'home', 'user', 'project');

  const mockPaths = new Set([
    MOCK_CWD1,
    MOCK_CWD2,
    pathMod.resolve(pathMod.sep, 'cli', 'path1'),
    pathMod.resolve(pathMod.sep, 'settings', 'path1'),
    pathMod.join(mockHome, 'settings', 'path2'),
    pathMod.join(MOCK_CWD2, 'cli', 'path2'),
    pathMod.join(MOCK_CWD2, 'settings', 'path3'),
  ]);

  return {
    ...actualFs,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    existsSync: vi.fn((p) => mockPaths.has(p.toString())),
    statSync: vi.fn((p) => {
      if (mockPaths.has(p.toString())) {
        return { isDirectory: () => true } as unknown as import('fs').Stats;
      }
      return actualFs.statSync(p as unknown as string);
    }),
    realpathSync: vi.fn((p) => p),
  };
});

vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof os>();
  return {
    ...actualOs,
    homedir: vi.fn(() => path.resolve(path.sep, 'mock', 'home', 'user')),
  };
});

vi.mock('open', () => ({
  default: vi.fn(),
}));

vi.mock('read-package-up', () => ({
  readPackageUp: vi.fn(() =>
    Promise.resolve({ packageJson: { version: 'test-version' } }),
  ),
}));

vi.mock('@google/gemini-cli-core', async () => {
  const actualServer = await vi.importActual<typeof ServerConfig>(
    '@google/gemini-cli-core',
  );
  return {
    ...actualServer,
    IdeClient: {
      getInstance: vi.fn().mockResolvedValue({
        getConnectionStatus: vi.fn(),
        initialize: vi.fn(),
        shutdown: vi.fn(),
      }),
    },
    loadEnvironment: vi.fn(),
    loadServerHierarchicalMemory: vi.fn(
      (
        cwd,
        dirs,
        debug,
        fileService,
        extensionLoader: ExtensionLoader,
        _maxDirs,
      ) => {
        const extensionPaths = extensionLoader
          .getExtensions()
          .flatMap((e) => e.contextFiles);
        return Promise.resolve({
          memoryContent: extensionPaths.join(',') || '',
          fileCount: extensionPaths?.length || 0,
          filePaths: extensionPaths,
        });
      },
    ),
    DEFAULT_MEMORY_FILE_FILTERING_OPTIONS: {
      respectGitIgnore: false,
      respectGeminiIgnore: true,
    },
    DEFAULT_FILE_FILTERING_OPTIONS: {
      respectGitIgnore: true,
      respectGeminiIgnore: true,
    },
    createPolicyEngineConfig: vi.fn(async () => ({
      rules: [],
      checkers: [],
      defaultDecision: ServerConfig.PolicyDecision.ASK_USER,
      approvalMode: ServerConfig.ApprovalMode.DEFAULT,
    })),
  };
});

vi.mock('./extension-manager.js');

// Global setup to ensure clean environment for all tests in this file
const originalArgv = process.argv;
const originalGeminiModel = process.env['GEMINI_MODEL'];

beforeEach(() => {
  delete process.env['GEMINI_MODEL'];
});

afterEach(() => {
  process.argv = originalArgv;
  if (originalGeminiModel !== undefined) {
    process.env['GEMINI_MODEL'] = originalGeminiModel;
  } else {
    delete process.env['GEMINI_MODEL'];
  }
});

describe('parseArguments', () => {
  it.each([
    {
      description: 'long flags',
      argv: [
        'node',
        'script.js',
        '--prompt',
        'test prompt',
        '--prompt-interactive',
        'interactive prompt',
      ],
    },
    {
      description: 'short flags',
      argv: [
        'node',
        'script.js',
        '-p',
        'test prompt',
        '-i',
        'interactive prompt',
      ],
    },
  ])(
    'should throw an error when using conflicting prompt flags ($description)',
    async ({ argv }) => {
      process.argv = argv;

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      const mockConsoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(parseArguments(createTestMergedSettings())).rejects.toThrow(
        'process.exit called',
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining(
          'Cannot use both --prompt (-p) and --prompt-interactive (-i) together',
        ),
      );

      mockExit.mockRestore();
      mockConsoleError.mockRestore();
    },
  );

  it.each([
    {
      description: 'should allow --prompt without --prompt-interactive',
      argv: ['node', 'script.js', '--prompt', 'test prompt'],
      expected: { prompt: 'test prompt', promptInteractive: undefined },
    },
    {
      description: 'should allow --prompt-interactive without --prompt',
      argv: ['node', 'script.js', '--prompt-interactive', 'interactive prompt'],
      expected: { prompt: undefined, promptInteractive: 'interactive prompt' },
    },
    {
      description: 'should allow -i flag as alias for --prompt-interactive',
      argv: ['node', 'script.js', '-i', 'interactive prompt'],
      expected: { prompt: undefined, promptInteractive: 'interactive prompt' },
    },
  ])('$description', async ({ argv, expected }) => {
    process.argv = argv;
    const parsedArgs = await parseArguments(createTestMergedSettings());
    expect(parsedArgs.prompt).toBe(expected.prompt);
    expect(parsedArgs.promptInteractive).toBe(expected.promptInteractive);
  });

  describe('positional arguments and @commands', () => {
    it.each([
      {
        description:
          'should convert positional query argument to prompt by default',
        argv: ['node', 'script.js', 'Hi Gemini'],
        expectedQuery: 'Hi Gemini',
        expectedModel: undefined,
        debug: false,
      },
      {
        description:
          'should map @path to prompt (one-shot) when it starts with @',
        argv: ['node', 'script.js', '@path ./file.md'],
        expectedQuery: '@path ./file.md',
        expectedModel: undefined,
        debug: false,
      },
      {
        description:
          'should map @path to prompt even when config flags are present',
        argv: [
          'node',
          'script.js',
          '@path',
          './file.md',
          '--model',
          'gemini-2.5-pro',
        ],
        expectedQuery: '@path ./file.md',
        expectedModel: 'gemini-2.5-pro',
        debug: false,
      },
      {
        description:
          'maps unquoted positional @path + arg to prompt (one-shot)',
        argv: ['node', 'script.js', '@path', './file.md'],
        expectedQuery: '@path ./file.md',
        expectedModel: undefined,
        debug: false,
      },
      {
        description:
          'should handle multiple @path arguments in a single command (one-shot)',
        argv: [
          'node',
          'script.js',
          '@path',
          './file1.md',
          '@path',
          './file2.md',
        ],
        expectedQuery: '@path ./file1.md @path ./file2.md',
        expectedModel: undefined,
        debug: false,
      },
      {
        description:
          'should handle mixed quoted and unquoted @path arguments (one-shot)',
        argv: [
          'node',
          'script.js',
          '@path ./file1.md',
          '@path',
          './file2.md',
          'additional text',
        ],
        expectedQuery: '@path ./file1.md @path ./file2.md additional text',
        expectedModel: undefined,
        debug: false,
      },
      {
        description: 'should map @path to prompt with ambient flags (debug)',
        argv: ['node', 'script.js', '@path', './file.md', '--debug'],
        expectedQuery: '@path ./file.md',
        expectedModel: undefined,
        debug: true,
      },
      {
        description: 'should map @include to prompt (one-shot)',
        argv: ['node', 'script.js', '@include src/'],
        expectedQuery: '@include src/',
        expectedModel: undefined,
        debug: false,
      },
      {
        description: 'should map @search to prompt (one-shot)',
        argv: ['node', 'script.js', '@search pattern'],
        expectedQuery: '@search pattern',
        expectedModel: undefined,
        debug: false,
      },
      {
        description: 'should map @web to prompt (one-shot)',
        argv: ['node', 'script.js', '@web query'],
        expectedQuery: '@web query',
        expectedModel: undefined,
        debug: false,
      },
      {
        description: 'should map @git to prompt (one-shot)',
        argv: ['node', 'script.js', '@git status'],
        expectedQuery: '@git status',
        expectedModel: undefined,
        debug: false,
      },
      {
        description: 'should handle @command with leading whitespace',
        argv: ['node', 'script.js', '  @path ./file.md'],
        expectedQuery: '  @path ./file.md',
        expectedModel: undefined,
        debug: false,
      },
    ])(
      '$description',
      async ({ argv, expectedQuery, expectedModel, debug }) => {
        process.argv = argv;
        const parsedArgs = await parseArguments(createTestMergedSettings());
        expect(parsedArgs.query).toBe(expectedQuery);
        expect(parsedArgs.prompt).toBe(expectedQuery);
        expect(parsedArgs.promptInteractive).toBeUndefined();
        if (expectedModel) {
          expect(parsedArgs.model).toBe(expectedModel);
        }
        if (debug) {
          expect(parsedArgs.debug).toBe(true);
        }
      },
    );
  });

  it.each([
    {
      description: 'long flags',
      argv: ['node', 'script.js', '--yolo', '--approval-mode', 'default'],
    },
    {
      description: 'short flags',
      argv: ['node', 'script.js', '-y', '--approval-mode', 'yolo'],
    },
  ])(
    'should throw an error when using conflicting yolo/approval-mode flags ($description)',
    async ({ argv }) => {
      process.argv = argv;

      const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('process.exit called');
      });

      const mockConsoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(parseArguments(createTestMergedSettings())).rejects.toThrow(
        'process.exit called',
      );

      expect(mockConsoleError).toHaveBeenCalledWith(
        expect.stringContaining(
          'Cannot use both --yolo (-y) and --approval-mode together. Use --approval-mode=yolo instead.',
        ),
      );

      mockExit.mockRestore();
      mockConsoleError.mockRestore();
    },
  );

  it.each([
    {
      description: 'should allow --approval-mode without --yolo',
      argv: ['node', 'script.js', '--approval-mode', 'auto_edit'],
      expected: { approvalMode: 'auto_edit', yolo: false },
    },
    {
      description: 'should allow --yolo without --approval-mode',
      argv: ['node', 'script.js', '--yolo'],
      expected: { approvalMode: undefined, yolo: true },
    },
  ])('$description', async ({ argv, expected }) => {
    process.argv = argv;
    const parsedArgs = await parseArguments(createTestMergedSettings());
    expect(parsedArgs.approvalMode).toBe(expected.approvalMode);
    expect(parsedArgs.yolo).toBe(expected.yolo);
  });

  it('should reject invalid --approval-mode values', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'invalid'];

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    const mockConsoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const debugErrorSpy = vi
      .spyOn(debugLogger, 'error')
      .mockImplementation(() => {});

    await expect(parseArguments(createTestMergedSettings())).rejects.toThrow(
      'process.exit called',
    );

    expect(debugErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid values:'),
    );
    expect(mockConsoleError).toHaveBeenCalled();

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
    debugErrorSpy.mockRestore();
  });

  it('should allow resuming a session without prompt argument in non-interactive mode (expecting stdin)', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = false;
    process.argv = ['node', 'script.js', '--resume', 'session-id'];

    try {
      const argv = await parseArguments(createTestMergedSettings());
      expect(argv.resume).toBe('session-id');
    } finally {
      process.stdin.isTTY = originalIsTTY;
    }
  });

  it('should return RESUME_LATEST constant when --resume is passed without a value', async () => {
    const originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true; // Make it interactive to avoid validation error
    process.argv = ['node', 'script.js', '--resume'];

    try {
      const argv = await parseArguments(createTestMergedSettings());
      expect(argv.resume).toBe(RESUME_LATEST);
      expect(argv.resume).toBe('latest');
    } finally {
      process.stdin.isTTY = originalIsTTY;
    }
  });

  it('should support comma-separated values for --allowed-tools', async () => {
    process.argv = [
      'node',
      'script.js',
      '--allowed-tools',
      'read_file,ShellTool(git status)',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    expect(argv.allowedTools).toEqual(['read_file', 'ShellTool(git status)']);
  });

  it('should support comma-separated values for --allowed-mcp-server-names', async () => {
    process.argv = [
      'node',
      'script.js',
      '--allowed-mcp-server-names',
      'server1,server2',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    expect(argv.allowedMcpServerNames).toEqual(['server1', 'server2']);
  });

  it('should support comma-separated values for --extensions', async () => {
    process.argv = ['node', 'script.js', '--extensions', 'ext1,ext2'];
    const argv = await parseArguments(createTestMergedSettings());
    expect(argv.extensions).toEqual(['ext1', 'ext2']);
  });

  it('should correctly parse positional arguments when flags with arguments are present', async () => {
    process.argv = [
      'node',
      'script.js',
      '--model',
      'test-model-string',
      'my-positional-arg',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    expect(argv.model).toBe('test-model-string');
    expect(argv.query).toBe('my-positional-arg');
  });

  it('should handle long positional prompts with multiple flags', async () => {
    process.argv = [
      'node',
      'script.js',
      '-e',
      'none',
      '--approval-mode=auto_edit',
      '--allowed-tools=ShellTool',
      '--allowed-tools=ShellTool(whoami)',
      '--allowed-tools=ShellTool(wc)',
      'Use whoami to write a poem in file poem.md about my username in pig latin and use wc to tell me how many lines are in the poem you wrote.',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    expect(argv.extensions).toEqual(['none']);
    expect(argv.approvalMode).toBe('auto_edit');
    expect(argv.allowedTools).toEqual([
      'ShellTool',
      'ShellTool(whoami)',
      'ShellTool(wc)',
    ]);
    expect(argv.query).toBe(
      'Use whoami to write a poem in file poem.md about my username in pig latin and use wc to tell me how many lines are in the poem you wrote.',
    );
  });
});

describe('loadCliConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  describe('Proxy configuration', () => {
    const originalProxyEnv: { [key: string]: string | undefined } = {};
    const proxyEnvVars = [
      'HTTP_PROXY',
      'HTTPS_PROXY',
      'http_proxy',
      'https_proxy',
    ];

    beforeEach(() => {
      for (const key of proxyEnvVars) {
        originalProxyEnv[key] = process.env[key];
        delete process.env[key];
      }
    });

    afterEach(() => {
      for (const key of proxyEnvVars) {
        if (originalProxyEnv[key]) {
          process.env[key] = originalProxyEnv[key];
        } else {
          delete process.env[key];
        }
      }
    });

    it(`should leave proxy to empty by default`, async () => {
      process.argv = ['node', 'script.js'];
      const argv = await parseArguments(createTestMergedSettings());
      const settings = createTestMergedSettings();
      const config = await loadCliConfig(settings, 'test-session', argv);
      expect(config.getProxy()).toBeFalsy();
    });

    const proxy_url = 'http://localhost:7890';
    const testCases = [
      {
        input: {
          env_name: 'https_proxy',
          proxy_url,
        },
        expected: proxy_url,
      },
      {
        input: {
          env_name: 'http_proxy',
          proxy_url,
        },
        expected: proxy_url,
      },
      {
        input: {
          env_name: 'HTTPS_PROXY',
          proxy_url,
        },
        expected: proxy_url,
      },
      {
        input: {
          env_name: 'HTTP_PROXY',
          proxy_url,
        },
        expected: proxy_url,
      },
    ];
    testCases.forEach(({ input, expected }) => {
      it(`should set proxy to ${expected} according to environment variable [${input.env_name}]`, async () => {
        vi.stubEnv(input.env_name, input.proxy_url);
        process.argv = ['node', 'script.js'];
        const argv = await parseArguments(createTestMergedSettings());
        const settings = createTestMergedSettings();
        const config = await loadCliConfig(settings, 'test-session', argv);
        expect(config.getProxy()).toBe(expected);
      });
    });
  });

  it('should use default fileFilter options when unconfigured', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings();
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getFileFilteringRespectGitIgnore()).toBe(
      DEFAULT_FILE_FILTERING_OPTIONS.respectGitIgnore,
    );
    expect(config.getFileFilteringRespectGeminiIgnore()).toBe(
      DEFAULT_FILE_FILTERING_OPTIONS.respectGeminiIgnore,
    );
    expect(config.getApprovalMode()).toBe(ApprovalMode.DEFAULT);
  });
});

describe('Hierarchical Memory Loading (config.ts) - Placeholder Suite', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    // Other common mocks would be reset here.
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should pass extension context file paths to loadServerHierarchicalMemory', async () => {
    process.argv = ['node', 'script.js'];
    const settings = createTestMergedSettings();
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([
      {
        path: '/path/to/ext1',
        name: 'ext1',
        id: 'ext1-id',
        version: '1.0.0',
        contextFiles: ['/path/to/ext1/GEMINI.md'],
        isActive: true,
      },
      {
        path: '/path/to/ext2',
        name: 'ext2',
        id: 'ext2-id',
        version: '1.0.0',
        contextFiles: [],
        isActive: true,
      },
      {
        path: '/path/to/ext3',
        name: 'ext3',
        id: 'ext3-id',
        version: '1.0.0',
        contextFiles: [
          '/path/to/ext3/context1.md',
          '/path/to/ext3/context2.md',
        ],
        isActive: true,
      },
    ]);
    const argv = await parseArguments(createTestMergedSettings());
    await loadCliConfig(settings, 'session-id', argv);
    expect(ServerConfig.loadServerHierarchicalMemory).toHaveBeenCalledWith(
      expect.any(String),
      [],
      false,
      expect.any(Object),
      expect.any(ExtensionManager),
      true,
      'tree',
      expect.objectContaining({
        respectGitIgnore: true,
        respectGeminiIgnore: true,
      }),
      200, // maxDirs
    );
  });
});

describe('mergeMcpServers', () => {
  it('should not modify the original settings object', async () => {
    const settings = createTestMergedSettings({
      mcpServers: {
        'test-server': {
          url: 'http://localhost:8080',
        },
      },
    });

    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([
      {
        path: '/path/to/ext1',
        name: 'ext1',
        id: 'ext1-id',

        version: '1.0.0',
        mcpServers: {
          'ext1-server': {
            url: 'http://localhost:8081',
          },
        },
        contextFiles: [],
        isActive: true,
      },
    ]);
    const originalSettings = JSON.parse(JSON.stringify(settings));
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    await loadCliConfig(settings, 'test-session', argv);
    expect(settings).toEqual(originalSettings);
  });
});

describe('mergeExcludeTools', () => {
  const defaultExcludes = new Set([
    SHELL_TOOL_NAME,
    EDIT_TOOL_NAME,
    WRITE_FILE_TOOL_NAME,
    WEB_FETCH_TOOL_NAME,
  ]);
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
    process.stdin.isTTY = true;
  });

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY;
  });

  it('should merge excludeTools from settings and extensions', async () => {
    const settings = createTestMergedSettings({
      tools: { exclude: ['tool1', 'tool2'] },
    });
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([
      {
        path: '/path/to/ext1',
        name: 'ext1',
        id: 'ext1-id',
        version: '1.0.0',
        excludeTools: ['tool3', 'tool4'],
        contextFiles: [],
        isActive: true,
      },
      {
        path: '/path/to/ext2',
        name: 'ext2',
        id: 'ext2-id',
        version: '1.0.0',
        excludeTools: ['tool5'],
        contextFiles: [],
        isActive: true,
      },
    ]);
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      settings,

      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).toEqual(
      new Set(['tool1', 'tool2', 'tool3', 'tool4', 'tool5']),
    );
    expect(config.getExcludeTools()).toHaveLength(5);
  });

  it('should handle overlapping excludeTools between settings and extensions', async () => {
    const settings = createTestMergedSettings({
      tools: { exclude: ['tool1', 'tool2'] },
    });
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([
      {
        path: '/path/to/ext1',
        name: 'ext1',
        id: 'ext1-id',
        version: '1.0.0',
        excludeTools: ['tool2', 'tool3'],
        contextFiles: [],
        isActive: true,
      },
    ]);
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getExcludeTools()).toEqual(
      new Set(['tool1', 'tool2', 'tool3']),
    );
    expect(config.getExcludeTools()).toHaveLength(3);
  });

  it('should handle overlapping excludeTools between extensions', async () => {
    const settings = createTestMergedSettings({
      tools: { exclude: ['tool1'] },
    });
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([
      {
        path: '/path/to/ext1',
        name: 'ext1',
        id: 'ext1-id',
        version: '1.0.0',
        excludeTools: ['tool2', 'tool3'],
        contextFiles: [],
        isActive: true,
      },
      {
        path: '/path/to/ext2',
        name: 'ext2',
        id: 'ext2-id',
        version: '1.0.0',
        excludeTools: ['tool3', 'tool4'],
        contextFiles: [],
        isActive: true,
      },
    ]);
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getExcludeTools()).toEqual(
      new Set(['tool1', 'tool2', 'tool3', 'tool4']),
    );
    expect(config.getExcludeTools()).toHaveLength(4);
  });

  it('should return an empty array when no excludeTools are specified and it is interactive', async () => {
    process.stdin.isTTY = true;
    const settings = createTestMergedSettings();
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getExcludeTools()).toEqual(new Set([]));
  });

  it('should return default excludes when no excludeTools are specified and it is not interactive', async () => {
    process.stdin.isTTY = false;
    const settings = createTestMergedSettings();
    process.argv = ['node', 'script.js', '-p', 'test'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getExcludeTools()).toEqual(defaultExcludes);
  });

  it('should handle settings with excludeTools but no extensions', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      tools: { exclude: ['tool1', 'tool2'] },
    });
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getExcludeTools()).toEqual(new Set(['tool1', 'tool2']));
    expect(config.getExcludeTools()).toHaveLength(2);
  });

  it('should handle extensions with excludeTools but no settings', async () => {
    const settings = createTestMergedSettings();
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([
      {
        path: '/path/to/ext',
        name: 'ext1',
        id: 'ext1-id',
        version: '1.0.0',
        excludeTools: ['tool1', 'tool2'],
        contextFiles: [],
        isActive: true,
      },
    ]);
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getExcludeTools()).toEqual(new Set(['tool1', 'tool2']));
    expect(config.getExcludeTools()).toHaveLength(2);
  });

  it('should not modify the original settings object', async () => {
    const settings = createTestMergedSettings({
      tools: { exclude: ['tool1'] },
    });
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([
      {
        path: '/path/to/ext',
        name: 'ext1',
        id: 'ext1-id',
        version: '1.0.0',
        excludeTools: ['tool2'],
        contextFiles: [],
        isActive: true,
      },
    ]);
    const originalSettings = JSON.parse(JSON.stringify(settings));
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    await loadCliConfig(settings, 'test-session', argv);
    expect(settings).toEqual(originalSettings);
  });
});

describe('Approval mode tool exclusion logic', () => {
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    process.stdin.isTTY = false; // Ensure non-interactive mode
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: undefined,
    });
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY;
  });

  it('should exclude all interactive tools in non-interactive mode with default approval mode', async () => {
    process.argv = ['node', 'script.js', '-p', 'test'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings();
    const config = await loadCliConfig(settings, 'test-session', argv);

    const excludedTools = config.getExcludeTools();
    expect(excludedTools).toContain(SHELL_TOOL_NAME);
    expect(excludedTools).toContain(EDIT_TOOL_NAME);
    expect(excludedTools).toContain(WRITE_FILE_TOOL_NAME);
  });

  it('should exclude all interactive tools in non-interactive mode with explicit default approval mode', async () => {
    process.argv = [
      'node',
      'script.js',
      '--approval-mode',
      'default',
      '-p',
      'test',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings();

    const config = await loadCliConfig(settings, 'test-session', argv);

    const excludedTools = config.getExcludeTools();
    expect(excludedTools).toContain(SHELL_TOOL_NAME);
    expect(excludedTools).toContain(EDIT_TOOL_NAME);
    expect(excludedTools).toContain(WRITE_FILE_TOOL_NAME);
  });

  it('should exclude only shell tools in non-interactive mode with auto_edit approval mode', async () => {
    process.argv = [
      'node',
      'script.js',
      '--approval-mode',
      'auto_edit',
      '-p',
      'test',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings();

    const config = await loadCliConfig(settings, 'test-session', argv);

    const excludedTools = config.getExcludeTools();
    expect(excludedTools).toContain(SHELL_TOOL_NAME);
    expect(excludedTools).not.toContain(EDIT_TOOL_NAME);
    expect(excludedTools).not.toContain(WRITE_FILE_TOOL_NAME);
  });

  it('should exclude no interactive tools in non-interactive mode with yolo approval mode', async () => {
    process.argv = [
      'node',
      'script.js',
      '--approval-mode',
      'yolo',
      '-p',
      'test',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings();

    const config = await loadCliConfig(settings, 'test-session', argv);

    const excludedTools = config.getExcludeTools();
    expect(excludedTools).not.toContain(SHELL_TOOL_NAME);
    expect(excludedTools).not.toContain(EDIT_TOOL_NAME);
    expect(excludedTools).not.toContain(WRITE_FILE_TOOL_NAME);
  });

  it('should exclude all interactive tools in non-interactive mode with plan approval mode', async () => {
    process.argv = [
      'node',
      'script.js',
      '--approval-mode',
      'plan',
      '-p',
      'test',
    ];
    const settings = createTestMergedSettings({
      experimental: {
        plan: true,
      },
    });
    const argv = await parseArguments(createTestMergedSettings());

    const config = await loadCliConfig(settings, 'test-session', argv);

    const excludedTools = config.getExcludeTools();
    expect(excludedTools).toContain(SHELL_TOOL_NAME);
    expect(excludedTools).toContain(EDIT_TOOL_NAME);
    expect(excludedTools).toContain(WRITE_FILE_TOOL_NAME);
  });

  it('should exclude no interactive tools in non-interactive mode with legacy yolo flag', async () => {
    process.argv = ['node', 'script.js', '--yolo', '-p', 'test'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings();

    const config = await loadCliConfig(settings, 'test-session', argv);

    const excludedTools = config.getExcludeTools();
    expect(excludedTools).not.toContain(SHELL_TOOL_NAME);
    expect(excludedTools).not.toContain(EDIT_TOOL_NAME);
    expect(excludedTools).not.toContain(WRITE_FILE_TOOL_NAME);
  });

  it('should not exclude interactive tools in interactive mode regardless of approval mode', async () => {
    process.stdin.isTTY = true; // Interactive mode

    const testCases = [
      { args: ['node', 'script.js'] }, // default
      { args: ['node', 'script.js', '--approval-mode', 'default'] },
      { args: ['node', 'script.js', '--approval-mode', 'auto_edit'] },
      { args: ['node', 'script.js', '--approval-mode', 'yolo'] },
      { args: ['node', 'script.js', '--yolo'] },
    ];

    for (const testCase of testCases) {
      process.argv = testCase.args;
      const argv = await parseArguments(createTestMergedSettings());
      const settings = createTestMergedSettings();

      const config = await loadCliConfig(settings, 'test-session', argv);

      const excludedTools = config.getExcludeTools();
      expect(excludedTools).not.toContain(SHELL_TOOL_NAME);
      expect(excludedTools).not.toContain(EDIT_TOOL_NAME);
      expect(excludedTools).not.toContain(WRITE_FILE_TOOL_NAME);
    }
  });

  it('should merge approval mode exclusions with settings exclusions in auto_edit mode', async () => {
    process.argv = [
      'node',
      'script.js',
      '--approval-mode',
      'auto_edit',
      '-p',
      'test',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      tools: { exclude: ['custom_tool'] },
    });

    const config = await loadCliConfig(settings, 'test-session', argv);

    const excludedTools = config.getExcludeTools();
    expect(excludedTools).toContain('custom_tool'); // From settings
    expect(excludedTools).toContain(SHELL_TOOL_NAME); // From approval mode
    expect(excludedTools).not.toContain(EDIT_TOOL_NAME); // Should be allowed in auto_edit
    expect(excludedTools).not.toContain(WRITE_FILE_TOOL_NAME); // Should be allowed in auto_edit
  });

  it('should throw an error if YOLO mode is attempted when disableYoloMode is true', async () => {
    process.argv = ['node', 'script.js', '--yolo'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      security: {
        disableYoloMode: true,
      },
    });

    await expect(loadCliConfig(settings, 'test-session', argv)).rejects.toThrow(
      'Cannot start in YOLO mode since it is disabled by your admin',
    );
  });

  it('should throw an error for invalid approval mode values in loadCliConfig', async () => {
    // Create a mock argv with an invalid approval mode that bypasses argument parsing validation
    const invalidArgv: Partial<CliArgs> & { approvalMode: string } = {
      approvalMode: 'invalid_mode',
      promptInteractive: '',
      prompt: '',
      yolo: false,
    };

    const settings = createTestMergedSettings();
    await expect(
      loadCliConfig(settings, 'test-session', invalidArgv as CliArgs),
    ).rejects.toThrow(
      'Invalid approval mode: invalid_mode. Valid values are: yolo, auto_edit, plan, default',
    );
  });
});

describe('loadCliConfig with allowed-mcp-server-names', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const baseSettings = createTestMergedSettings({
    mcpServers: {
      server1: { url: 'http://localhost:8080' },
      server2: { url: 'http://localhost:8081' },
      server3: { url: 'http://localhost:8082' },
    },
  });

  it('should allow all MCP servers if the flag is not provided', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(baseSettings, 'test-session', argv);
    expect(config.getMcpServers()).toEqual(baseSettings.mcpServers);
  });

  it('should allow only the specified MCP server', async () => {
    process.argv = [
      'node',
      'script.js',
      '--allowed-mcp-server-names',
      'server1',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(baseSettings, 'test-session', argv);
    expect(config.getAllowedMcpServers()).toEqual(['server1']);
  });

  it('should allow multiple specified MCP servers', async () => {
    process.argv = [
      'node',
      'script.js',
      '--allowed-mcp-server-names',
      'server1',
      '--allowed-mcp-server-names',
      'server3',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(baseSettings, 'test-session', argv);
    expect(config.getAllowedMcpServers()).toEqual(['server1', 'server3']);
  });

  it('should handle server names that do not exist', async () => {
    process.argv = [
      'node',
      'script.js',
      '--allowed-mcp-server-names',
      'server1',
      '--allowed-mcp-server-names',
      'server4',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(baseSettings, 'test-session', argv);
    expect(config.getAllowedMcpServers()).toEqual(['server1', 'server4']);
  });

  it('should allow no MCP servers if the flag is provided but empty', async () => {
    process.argv = ['node', 'script.js', '--allowed-mcp-server-names', ''];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(baseSettings, 'test-session', argv);
    expect(config.getAllowedMcpServers()).toEqual(['']);
  });

  it('should read allowMCPServers from settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      ...baseSettings,
      mcp: { allowed: ['server1', 'server2'] },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getAllowedMcpServers()).toEqual(['server1', 'server2']);
  });

  it('should read excludeMCPServers from settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      ...baseSettings,
      mcp: { excluded: ['server1', 'server2'] },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getBlockedMcpServers()).toEqual(['server1', 'server2']);
  });

  it('should override allowMCPServers with excludeMCPServers if overlapping', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      ...baseSettings,
      mcp: {
        excluded: ['server1'],
        allowed: ['server1', 'server2'],
      },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getAllowedMcpServers()).toEqual(['server1', 'server2']);
    expect(config.getBlockedMcpServers()).toEqual(['server1']);
  });

  it('should prioritize mcp server flag if set', async () => {
    process.argv = [
      'node',
      'script.js',
      '--allowed-mcp-server-names',
      'server1',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      ...baseSettings,
      mcp: {
        excluded: ['server1'],
        allowed: ['server2'],
      },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getAllowedMcpServers()).toEqual(['server1']);
  });

  it('should prioritize CLI flag over both allowed and excluded settings', async () => {
    process.argv = [
      'node',
      'script.js',
      '--allowed-mcp-server-names',
      'server2',
      '--allowed-mcp-server-names',
      'server3',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      ...baseSettings,
      mcp: {
        allowed: ['server1', 'server2'], // Should be ignored
        excluded: ['server3'], // Should be ignored
      },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getAllowedMcpServers()).toEqual(['server2', 'server3']);
    expect(config.getBlockedMcpServers()).toEqual([]);
  });
});

describe('loadCliConfig model selection', () => {
  beforeEach(() => {
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('selects a model from settings.json if provided', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings({
        model: {
          name: 'gemini-2.5-pro',
        },
      }),
      'test-session',
      argv,
    );

    expect(config.getModel()).toBe('gemini-2.5-pro');
  });

  it('uses the default gemini model if nothing is set', async () => {
    process.argv = ['node', 'script.js']; // No model set.
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings({
        // No model set.
      }),
      'test-session',
      argv,
    );

    expect(config.getModel()).toBe('auto-gemini-2.5');
  });

  it('always prefers model from argv', async () => {
    process.argv = ['node', 'script.js', '--model', 'gemini-2.5-flash-preview'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings({
        model: {
          name: 'gemini-2.5-pro',
        },
      }),
      'test-session',
      argv,
    );

    expect(config.getModel()).toBe('gemini-2.5-flash-preview');
  });

  it('selects the model from argv if provided', async () => {
    process.argv = ['node', 'script.js', '--model', 'gemini-2.5-flash-preview'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings({
        // No model provided via settings.
      }),
      'test-session',
      argv,
    );

    expect(config.getModel()).toBe('gemini-2.5-flash-preview');
  });

  it('selects the default auto model if provided via auto alias', async () => {
    process.argv = ['node', 'script.js', '--model', 'auto'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings({
        // No model provided via settings.
      }),
      'test-session',
      argv,
    );

    expect(config.getModel()).toBe('auto-gemini-2.5');
  });
});

describe('loadCliConfig folderTrust', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should be false when folderTrust is false', async () => {
    process.argv = ['node', 'script.js'];
    const settings = createTestMergedSettings({
      security: {
        folderTrust: {
          enabled: false,
        },
      },
    });
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getFolderTrust()).toBe(false);
  });

  it('should be true when folderTrust is true', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      security: {
        folderTrust: {
          enabled: true,
        },
      },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getFolderTrust()).toBe(true);
  });

  it('should be false by default', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings();
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getFolderTrust()).toBe(false);
  });
});

describe('loadCliConfig with includeDirectories', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue(
      path.resolve(path.sep, 'mock', 'home', 'user'),
    );
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(process, 'cwd').mockReturnValue(
      path.resolve(path.sep, 'home', 'user', 'project'),
    );
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should combine and resolve paths from settings and CLI arguments', async () => {
    const mockCwd = path.resolve(path.sep, 'home', 'user', 'project');
    process.argv = [
      'node',
      'script.js',
      '--include-directories',
      `${path.resolve(path.sep, 'cli', 'path1')},${path.join(mockCwd, 'cli', 'path2')}`,
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      context: {
        includeDirectories: [
          path.resolve(path.sep, 'settings', 'path1'),
          path.join(os.homedir(), 'settings', 'path2'),
          path.join(mockCwd, 'settings', 'path3'),
        ],
      },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    const expected = [
      mockCwd,
      path.resolve(path.sep, 'cli', 'path1'),
      path.join(mockCwd, 'cli', 'path2'),
      path.resolve(path.sep, 'settings', 'path1'),
      path.join(os.homedir(), 'settings', 'path2'),
      path.join(mockCwd, 'settings', 'path3'),
    ];
    const directories = config.getWorkspaceContext().getDirectories();
    expect(directories).toEqual([mockCwd]);
    expect(config.getPendingIncludeDirectories()).toEqual(
      expect.arrayContaining(expected.filter((dir) => dir !== mockCwd)),
    );
    expect(config.getPendingIncludeDirectories()).toHaveLength(
      expected.length - 1,
    );
  });
});

describe('loadCliConfig compressionThreshold', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should pass settings to the core config', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      model: {
        compressionThreshold: 0.5,
      },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(await config.getCompressionThreshold()).toBe(0.5);
  });

  it('should have default compressionThreshold if not in settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings();
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(await config.getCompressionThreshold()).toBe(0.5);
  });
});

describe('loadCliConfig useRipgrep', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should be true by default when useRipgrep is not set in settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings();
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getUseRipgrep()).toBe(true);
  });

  it('should be false when useRipgrep is set to false in settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({ tools: { useRipgrep: false } });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getUseRipgrep()).toBe(false);
  });

  it('should be true when useRipgrep is explicitly set to true in settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({ tools: { useRipgrep: true } });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getUseRipgrep()).toBe(true);
  });
});

describe('screenReader configuration', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should use screenReader value from settings if CLI flag is not present (settings true)', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      ui: { accessibility: { screenReader: true } },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getScreenReader()).toBe(true);
  });

  it('should use screenReader value from settings if CLI flag is not present (settings false)', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      ui: { accessibility: { screenReader: false } },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getScreenReader()).toBe(false);
  });

  it('should prioritize --screen-reader CLI flag (true) over settings (false)', async () => {
    process.argv = ['node', 'script.js', '--screen-reader'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      ui: { accessibility: { screenReader: false } },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getScreenReader()).toBe(true);
  });

  it('should be false by default when no flag or setting is present', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings();
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getScreenReader()).toBe(false);
  });
});

describe('loadCliConfig tool exclusions', () => {
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    process.stdin.isTTY = true;
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: undefined,
    });
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should not exclude interactive tools in interactive mode without YOLO', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).not.toContain('run_shell_command');
    expect(config.getExcludeTools()).not.toContain('replace');
    expect(config.getExcludeTools()).not.toContain('write_file');
  });

  it('should not exclude interactive tools in interactive mode with YOLO', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js', '--yolo'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).not.toContain('run_shell_command');
    expect(config.getExcludeTools()).not.toContain('replace');
    expect(config.getExcludeTools()).not.toContain('write_file');
  });

  it('should exclude interactive tools in non-interactive mode without YOLO', async () => {
    process.stdin.isTTY = false;
    process.argv = ['node', 'script.js', '-p', 'test'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).toContain('run_shell_command');
    expect(config.getExcludeTools()).toContain('replace');
    expect(config.getExcludeTools()).toContain('write_file');
  });

  it('should not exclude interactive tools in non-interactive mode with YOLO', async () => {
    process.stdin.isTTY = false;
    process.argv = ['node', 'script.js', '-p', 'test', '--yolo'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).not.toContain('run_shell_command');
    expect(config.getExcludeTools()).not.toContain('replace');
    expect(config.getExcludeTools()).not.toContain('write_file');
  });

  it('should not exclude shell tool in non-interactive mode when --allowed-tools="ShellTool" is set', async () => {
    process.stdin.isTTY = false;
    process.argv = [
      'node',
      'script.js',
      '-p',
      'test',
      '--allowed-tools',
      'ShellTool',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).not.toContain(SHELL_TOOL_NAME);
  });

  it('should exclude web-fetch in non-interactive mode when not allowed', async () => {
    process.stdin.isTTY = false;
    process.argv = ['node', 'script.js', '-p', 'test'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).toContain(WEB_FETCH_TOOL_NAME);
  });

  it('should not exclude web-fetch in non-interactive mode when allowed', async () => {
    process.stdin.isTTY = false;
    process.argv = [
      'node',
      'script.js',
      '-p',
      'test',
      '--allowed-tools',
      WEB_FETCH_TOOL_NAME,
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).not.toContain(WEB_FETCH_TOOL_NAME);
  });

  it('should not exclude shell tool in non-interactive mode when --allowed-tools="run_shell_command" is set', async () => {
    process.stdin.isTTY = false;
    process.argv = [
      'node',
      'script.js',
      '-p',
      'test',
      '--allowed-tools',
      'run_shell_command',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).not.toContain(SHELL_TOOL_NAME);
  });

  it('should not exclude shell tool in non-interactive mode when --allowed-tools="ShellTool(wc)" is set', async () => {
    process.stdin.isTTY = false;
    process.argv = [
      'node',
      'script.js',
      '-p',
      'test',
      '--allowed-tools',
      'ShellTool(wc)',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).not.toContain(SHELL_TOOL_NAME);
  });
});

describe('loadCliConfig interactive', () => {
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    process.stdin.isTTY = true;
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should be interactive if isTTY and no prompt', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(true);
  });

  it('should be interactive if prompt-interactive is set', async () => {
    process.stdin.isTTY = false;
    process.argv = ['node', 'script.js', '--prompt-interactive', 'test'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(true);
  });

  it('should not be interactive if not isTTY and no prompt', async () => {
    process.stdin.isTTY = false;
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(false);
  });

  it('should not be interactive if prompt is set', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js', '--prompt', 'test'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(false);
  });

  it('should not be interactive if positional prompt words are provided with other flags', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js', '--model', 'gemini-2.5-pro', 'Hello'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(false);
  });

  it('should not be interactive if positional prompt words are provided with multiple flags', async () => {
    process.stdin.isTTY = true;
    process.argv = [
      'node',
      'script.js',
      '--model',
      'gemini-2.5-pro',
      '--yolo',
      'Hello world',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(false);
    // Verify the question is preserved for one-shot execution
    expect(argv.prompt).toBe('Hello world');
    expect(argv.promptInteractive).toBeUndefined();
  });

  it('should not be interactive if positional prompt words are provided with extensions flag', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js', '-e', 'none', 'hello'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(false);
    expect(argv.query).toBe('hello');
    expect(argv.extensions).toEqual(['none']);
  });

  it('should handle multiple positional words correctly', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js', 'hello world how are you'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(false);
    expect(argv.query).toBe('hello world how are you');
    expect(argv.prompt).toBe('hello world how are you');
  });

  it('should handle multiple positional words with flags', async () => {
    process.stdin.isTTY = true;
    process.argv = [
      'node',
      'script.js',
      '--model',
      'gemini-2.5-pro',
      'write',
      'a',
      'function',
      'to',
      'sort',
      'array',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(false);
    expect(argv.query).toBe('write a function to sort array');
    expect(argv.model).toBe('gemini-2.5-pro');
  });

  it('should handle empty positional arguments', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js', ''];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(true);
    expect(argv.query).toBeUndefined();
  });

  it('should handle extensions flag with positional arguments correctly', async () => {
    process.stdin.isTTY = true;
    process.argv = [
      'node',
      'script.js',
      '-e',
      'none',
      'hello',
      'world',
      'how',
      'are',
      'you',
    ];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(false);
    expect(argv.query).toBe('hello world how are you');
    expect(argv.extensions).toEqual(['none']);
  });

  it('should be interactive if no positional prompt words are provided with flags', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js', '--model', 'gemini-2.5-pro'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(true);
  });
});

describe('loadCliConfig approval mode', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    process.argv = ['node', 'script.js']; // Reset argv for each test
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: undefined,
    });
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should default to DEFAULT approval mode when no flags are set', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
  });

  it('should set YOLO approval mode when --yolo flag is used', async () => {
    process.argv = ['node', 'script.js', '--yolo'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.YOLO);
  });

  it('should set YOLO approval mode when -y flag is used', async () => {
    process.argv = ['node', 'script.js', '-y'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.YOLO);
  });

  it('should set DEFAULT approval mode when --approval-mode=default', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'default'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
  });

  it('should set AUTO_EDIT approval mode when --approval-mode=auto_edit', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'auto_edit'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.AUTO_EDIT);
  });

  it('should set YOLO approval mode when --approval-mode=yolo', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'yolo'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.YOLO);
  });

  it('should prioritize --approval-mode over --yolo when both would be valid (but validation prevents this)', async () => {
    // Note: This test documents the intended behavior, but in practice the validation
    // prevents both flags from being used together
    process.argv = ['node', 'script.js', '--approval-mode', 'default'];
    const argv = await parseArguments(createTestMergedSettings());
    // Manually set yolo to true to simulate what would happen if validation didn't prevent it
    argv.yolo = true;
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
  });

  it('should fall back to --yolo behavior when --approval-mode is not set', async () => {
    process.argv = ['node', 'script.js', '--yolo'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.YOLO);
  });

  it('should set Plan approval mode when --approval-mode=plan is used and experimental.plan is enabled', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'plan'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      experimental: {
        plan: true,
      },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.PLAN);
  });

  it('should throw error when --approval-mode=plan is used but experimental.plan is disabled', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'plan'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      experimental: {
        plan: false,
      },
    });

    await expect(loadCliConfig(settings, 'test-session', argv)).rejects.toThrow(
      'Approval mode "plan" is only available when experimental.plan is enabled.',
    );
  });

  it('should throw error when --approval-mode=plan is used but experimental.plan setting is missing', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'plan'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({});

    await expect(loadCliConfig(settings, 'test-session', argv)).rejects.toThrow(
      'Approval mode "plan" is only available when experimental.plan is enabled.',
    );
  });

  // --- Untrusted Folder Scenarios ---
  describe('when folder is NOT trusted', () => {
    beforeEach(() => {
      vi.mocked(isWorkspaceTrusted).mockReturnValue({
        isTrusted: false,
        source: 'file',
      });
    });

    it('should override --approval-mode=yolo to DEFAULT', async () => {
      process.argv = ['node', 'script.js', '--approval-mode', 'yolo'];
      const argv = await parseArguments(createTestMergedSettings());
      const config = await loadCliConfig(
        createTestMergedSettings(),
        'test-session',
        argv,
      );
      expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
    });

    it('should override --approval-mode=auto_edit to DEFAULT', async () => {
      process.argv = ['node', 'script.js', '--approval-mode', 'auto_edit'];
      const argv = await parseArguments(createTestMergedSettings());
      const config = await loadCliConfig(
        createTestMergedSettings(),
        'test-session',
        argv,
      );
      expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
    });

    it('should override --yolo flag to DEFAULT', async () => {
      process.argv = ['node', 'script.js', '--yolo'];
      const argv = await parseArguments(createTestMergedSettings());
      const config = await loadCliConfig(
        createTestMergedSettings(),
        'test-session',
        argv,
      );
      expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
    });

    it('should remain DEFAULT when --approval-mode=default', async () => {
      process.argv = ['node', 'script.js', '--approval-mode', 'default'];
      const argv = await parseArguments(createTestMergedSettings());
      const config = await loadCliConfig(
        createTestMergedSettings(),
        'test-session',
        argv,
      );
      expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
    });
  });
});

describe('loadCliConfig fileFiltering', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    process.argv = ['node', 'script.js']; // Reset argv for each test
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  type FileFilteringSettings = NonNullable<
    NonNullable<Settings['context']>['fileFiltering']
  >;
  const testCases: Array<{
    property: keyof FileFilteringSettings;
    getter: (config: ServerConfig.Config) => boolean;
    value: boolean;
  }> = [
    {
      property: 'disableFuzzySearch',
      getter: (c) => c.getFileFilteringDisableFuzzySearch(),
      value: true,
    },
    {
      property: 'disableFuzzySearch',
      getter: (c) => c.getFileFilteringDisableFuzzySearch(),
      value: false,
    },
    {
      property: 'respectGitIgnore',
      getter: (c) => c.getFileFilteringRespectGitIgnore(),
      value: true,
    },
    {
      property: 'respectGitIgnore',
      getter: (c) => c.getFileFilteringRespectGitIgnore(),
      value: false,
    },
    {
      property: 'respectGeminiIgnore',
      getter: (c) => c.getFileFilteringRespectGeminiIgnore(),
      value: true,
    },
    {
      property: 'respectGeminiIgnore',
      getter: (c) => c.getFileFilteringRespectGeminiIgnore(),
      value: false,
    },
    {
      property: 'enableRecursiveFileSearch',
      getter: (c) => c.getEnableRecursiveFileSearch(),
      value: true,
    },
    {
      property: 'enableRecursiveFileSearch',
      getter: (c) => c.getEnableRecursiveFileSearch(),
      value: false,
    },
  ];

  it.each(testCases)(
    'should pass $property from settings to config when $value',
    async ({ property, getter, value }) => {
      const settings = createTestMergedSettings({
        context: {
          fileFiltering: { [property]: value },
        },
      });
      const argv = await parseArguments(settings);
      const config = await loadCliConfig(settings, 'test-session', argv);
      expect(getter(config)).toBe(value);
    },
  );
});

describe('Output format', () => {
  beforeEach(() => {
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should default to TEXT', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getOutputFormat()).toBe(OutputFormat.TEXT);
  });

  it('should use the format from settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings({ output: { format: OutputFormat.JSON } }),
      'test-session',
      argv,
    );
    expect(config.getOutputFormat()).toBe(OutputFormat.JSON);
  });

  it('should prioritize the format from argv', async () => {
    process.argv = ['node', 'script.js', '--output-format', 'json'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings({ output: { format: OutputFormat.JSON } }),
      'test-session',
      argv,
    );
    expect(config.getOutputFormat()).toBe(OutputFormat.JSON);
  });

  it('should accept stream-json as a valid output format', async () => {
    process.argv = ['node', 'script.js', '--output-format', 'stream-json'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getOutputFormat()).toBe(OutputFormat.STREAM_JSON);
  });

  it('should error on invalid --output-format argument', async () => {
    process.argv = ['node', 'script.js', '--output-format', 'invalid'];

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    const mockConsoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const debugErrorSpy = vi
      .spyOn(debugLogger, 'error')
      .mockImplementation(() => {});

    await expect(parseArguments(createTestMergedSettings())).rejects.toThrow(
      'process.exit called',
    );
    expect(debugErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid values:'),
    );
    expect(mockConsoleError).toHaveBeenCalled();

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
    debugErrorSpy.mockRestore();
  });
});

describe('parseArguments with positional prompt', () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('should throw an error when both a positional prompt and the --prompt flag are used', async () => {
    process.argv = [
      'node',
      'script.js',
      'positional',
      'prompt',
      '--prompt',
      'test prompt',
    ];

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    const mockConsoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    const debugErrorSpy = vi
      .spyOn(debugLogger, 'error')
      .mockImplementation(() => {});

    await expect(parseArguments(createTestMergedSettings())).rejects.toThrow(
      'process.exit called',
    );

    expect(debugErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        'Cannot use both a positional prompt and the --prompt (-p) flag together',
      ),
    );

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
    debugErrorSpy.mockRestore();
  });

  it('should correctly parse a positional prompt to query field', async () => {
    process.argv = ['node', 'script.js', 'positional', 'prompt'];
    const argv = await parseArguments(createTestMergedSettings());
    expect(argv.query).toBe('positional prompt');
    // Since no explicit prompt flags are set and query doesn't start with @, should map to prompt (one-shot)
    expect(argv.prompt).toBe('positional prompt');
    expect(argv.promptInteractive).toBeUndefined();
  });

  it('should have correct positional argument description', async () => {
    // Test that the positional argument has the expected description
    const yargsInstance = await import('./config.js');
    // This test verifies that the positional 'query' argument is properly configured
    // with the description: "Positional prompt. Defaults to one-shot; use -i/--prompt-interactive for interactive."
    process.argv = ['node', 'script.js', 'test', 'query'];
    const argv = await yargsInstance.parseArguments(createTestMergedSettings());
    expect(argv.query).toBe('test query');
  });

  it('should correctly parse a prompt from the --prompt flag', async () => {
    process.argv = ['node', 'script.js', '--prompt', 'test prompt'];
    const argv = await parseArguments(createTestMergedSettings());
    expect(argv.prompt).toBe('test prompt');
  });
});

describe('Telemetry configuration via environment variables', () => {
  beforeEach(() => {
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should prioritize GEMINI_TELEMETRY_ENABLED over settings', async () => {
    vi.stubEnv('GEMINI_TELEMETRY_ENABLED', 'true');
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      telemetry: { enabled: false },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(true);
  });

  it('should prioritize GEMINI_TELEMETRY_TARGET over settings', async () => {
    vi.stubEnv('GEMINI_TELEMETRY_TARGET', 'gcp');
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      telemetry: { target: ServerConfig.TelemetryTarget.LOCAL },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getTelemetryTarget()).toBe('gcp');
  });

  it('should throw when GEMINI_TELEMETRY_TARGET is invalid', async () => {
    vi.stubEnv('GEMINI_TELEMETRY_TARGET', 'bogus');
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      telemetry: { target: ServerConfig.TelemetryTarget.GCP },
    });
    await expect(loadCliConfig(settings, 'test-session', argv)).rejects.toThrow(
      /Invalid telemetry configuration: .*Invalid telemetry target/i,
    );
    vi.unstubAllEnvs();
  });

  it('should prioritize GEMINI_TELEMETRY_OTLP_ENDPOINT over settings and default env var', async () => {
    vi.stubEnv('OTEL_EXPORTER_OTLP_ENDPOINT', 'http://default.env.com');
    vi.stubEnv('GEMINI_TELEMETRY_OTLP_ENDPOINT', 'http://gemini.env.com');
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      telemetry: { otlpEndpoint: 'http://settings.com' },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getTelemetryOtlpEndpoint()).toBe('http://gemini.env.com');
  });

  it('should prioritize GEMINI_TELEMETRY_OTLP_PROTOCOL over settings', async () => {
    vi.stubEnv('GEMINI_TELEMETRY_OTLP_PROTOCOL', 'http');
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      telemetry: { otlpProtocol: 'grpc' },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getTelemetryOtlpProtocol()).toBe('http');
  });

  it('should prioritize GEMINI_TELEMETRY_LOG_PROMPTS over settings', async () => {
    vi.stubEnv('GEMINI_TELEMETRY_LOG_PROMPTS', 'false');
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      telemetry: { logPrompts: true },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getTelemetryLogPromptsEnabled()).toBe(false);
  });

  it('should prioritize GEMINI_TELEMETRY_OUTFILE over settings', async () => {
    vi.stubEnv('GEMINI_TELEMETRY_OUTFILE', '/gemini/env/telemetry.log');
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      telemetry: { outfile: '/settings/telemetry.log' },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getTelemetryOutfile()).toBe('/gemini/env/telemetry.log');
  });

  it('should prioritize GEMINI_TELEMETRY_USE_COLLECTOR over settings', async () => {
    vi.stubEnv('GEMINI_TELEMETRY_USE_COLLECTOR', 'true');
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      telemetry: { useCollector: false },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getTelemetryUseCollector()).toBe(true);
  });

  it('should use settings value when GEMINI_TELEMETRY_ENABLED is not set', async () => {
    vi.stubEnv('GEMINI_TELEMETRY_ENABLED', undefined);
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({ telemetry: { enabled: true } });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(true);
  });

  it('should use settings value when GEMINI_TELEMETRY_TARGET is not set', async () => {
    vi.stubEnv('GEMINI_TELEMETRY_TARGET', undefined);
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      telemetry: { target: ServerConfig.TelemetryTarget.LOCAL },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getTelemetryTarget()).toBe('local');
  });

  it("should treat GEMINI_TELEMETRY_ENABLED='1' as true", async () => {
    vi.stubEnv('GEMINI_TELEMETRY_ENABLED', '1');
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getTelemetryEnabled()).toBe(true);
  });

  it("should treat GEMINI_TELEMETRY_ENABLED='0' as false", async () => {
    vi.stubEnv('GEMINI_TELEMETRY_ENABLED', '0');
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings({ telemetry: { enabled: true } }),
      'test-session',
      argv,
    );
    expect(config.getTelemetryEnabled()).toBe(false);
  });

  it("should treat GEMINI_TELEMETRY_LOG_PROMPTS='1' as true", async () => {
    vi.stubEnv('GEMINI_TELEMETRY_LOG_PROMPTS', '1');
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
  });

  it("should treat GEMINI_TELEMETRY_LOG_PROMPTS='false' as false", async () => {
    vi.stubEnv('GEMINI_TELEMETRY_LOG_PROMPTS', 'false');
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings({ telemetry: { logPrompts: true } }),
      'test-session',
      argv,
    );
    expect(config.getTelemetryLogPromptsEnabled()).toBe(false);
  });
});

describe('PolicyEngine nonInteractive wiring', () => {
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY;
    vi.restoreAllMocks();
  });

  it('should set nonInteractive to true in one-shot mode', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js', 'echo hello']; // Positional query makes it one-shot
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(false);
    expect(
      (config.getPolicyEngine() as unknown as { nonInteractive: boolean })
        .nonInteractive,
    ).toBe(true);
  });

  it('should set nonInteractive to false in interactive mode', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const config = await loadCliConfig(
      createTestMergedSettings(),
      'test-session',
      argv,
    );
    expect(config.isInteractive()).toBe(true);
    expect(
      (config.getPolicyEngine() as unknown as { nonInteractive: boolean })
        .nonInteractive,
    ).toBe(false);
  });
});

describe('Policy Engine Integration in loadCliConfig', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should pass merged allowed tools from CLI and settings to createPolicyEngineConfig', async () => {
    process.argv = ['node', 'script.js', '--allowed-tools', 'cli-tool'];
    const settings = createTestMergedSettings({
      tools: { allowed: ['settings-tool'] },
    });
    const argv = await parseArguments(createTestMergedSettings());

    await loadCliConfig(settings, 'test-session', argv);

    expect(ServerConfig.createPolicyEngineConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.objectContaining({
          allowed: expect.arrayContaining(['cli-tool']),
        }),
      }),
      expect.anything(),
    );
  });

  it('should pass merged exclude tools from CLI logic and settings to createPolicyEngineConfig', async () => {
    process.stdin.isTTY = false; // Non-interactive to trigger default excludes
    process.argv = ['node', 'script.js', '-p', 'test'];
    const settings = createTestMergedSettings({
      tools: { exclude: ['settings-exclude'] },
    });
    const argv = await parseArguments(createTestMergedSettings());

    await loadCliConfig(settings, 'test-session', argv);

    // In non-interactive mode, ShellTool, etc. are excluded
    expect(ServerConfig.createPolicyEngineConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.objectContaining({
          exclude: expect.arrayContaining([SHELL_TOOL_NAME]),
        }),
      }),
      expect.anything(),
    );
  });
});

describe('loadCliConfig disableYoloMode', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should allow auto_edit mode even if yolo mode is disabled', async () => {
    process.argv = ['node', 'script.js', '--approval-mode=auto_edit'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      security: { disableYoloMode: true },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getApprovalMode()).toBe(ApprovalMode.AUTO_EDIT);
  });

  it('should throw if YOLO mode is attempted when disableYoloMode is true', async () => {
    process.argv = ['node', 'script.js', '--yolo'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      security: { disableYoloMode: true },
    });
    await expect(loadCliConfig(settings, 'test-session', argv)).rejects.toThrow(
      'Cannot start in YOLO mode since it is disabled by your admin',
    );
  });
});

describe('loadCliConfig secureModeEnabled', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
    vi.mocked(isWorkspaceTrusted).mockReturnValue({
      isTrusted: true,
      source: undefined,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should throw an error if YOLO mode is attempted when secureModeEnabled is true', async () => {
    process.argv = ['node', 'script.js', '--yolo'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      admin: {
        secureModeEnabled: true,
      },
    });

    await expect(loadCliConfig(settings, 'test-session', argv)).rejects.toThrow(
      'Cannot start in YOLO mode since it is disabled by your admin',
    );
  });

  it('should throw an error if approval-mode=yolo is attempted when secureModeEnabled is true', async () => {
    process.argv = ['node', 'script.js', '--approval-mode=yolo'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      admin: {
        secureModeEnabled: true,
      },
    });

    await expect(loadCliConfig(settings, 'test-session', argv)).rejects.toThrow(
      'Cannot start in YOLO mode since it is disabled by your admin',
    );
  });

  it('should set disableYoloMode to true when secureModeEnabled is true', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      admin: {
        secureModeEnabled: true,
      },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.isYoloModeDisabled()).toBe(true);
  });
});

describe('loadCliConfig mcpEnabled', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(ExtensionManager.prototype, 'getExtensions').mockReturnValue([]);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const mcpSettings = {
    mcp: {
      serverCommand: 'mcp-server',
      allowed: ['serverA'],
      excluded: ['serverB'],
    },
    mcpServers: { serverA: { url: 'http://a' } },
  };

  it('should enable MCP by default', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({ ...mcpSettings });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getMcpEnabled()).toBe(true);
    expect(config.getMcpServerCommand()).toBe('mcp-server');
    expect(config.getMcpServers()).toEqual({ serverA: { url: 'http://a' } });
    expect(config.getAllowedMcpServers()).toEqual(['serverA']);
    expect(config.getBlockedMcpServers()).toEqual(['serverB']);
  });

  it('should disable MCP when mcpEnabled is false', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      ...mcpSettings,
      admin: {
        mcp: {
          enabled: false,
        },
      },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getMcpEnabled()).toBe(false);
    expect(config.getMcpServerCommand()).toBeUndefined();
    expect(config.getMcpServers()).toEqual({});
    expect(config.getAllowedMcpServers()).toEqual([]);
    expect(config.getBlockedMcpServers()).toEqual([]);
  });

  it('should enable MCP when mcpEnabled is true', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments(createTestMergedSettings());
    const settings = createTestMergedSettings({
      ...mcpSettings,
      admin: {
        mcp: {
          enabled: true,
        },
      },
    });
    const config = await loadCliConfig(settings, 'test-session', argv);
    expect(config.getMcpEnabled()).toBe(true);
    expect(config.getMcpServerCommand()).toBe('mcp-server');
    expect(config.getMcpServers()).toEqual({ serverA: { url: 'http://a' } });
    expect(config.getAllowedMcpServers()).toEqual(['serverA']);
    expect(config.getBlockedMcpServers()).toEqual(['serverB']);
  });
});
