/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as os from 'os';
import { loadCliConfig, parseArguments } from './config.js';
import { Settings } from './settings.js';
import { Extension } from './extension.js';
import * as ServerConfig from '@google/gemini-cli-core';

vi.mock('os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof os>();
  return {
    ...actualOs,
    homedir: vi.fn(() => '/mock/home/user'),
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
      getInstance: vi.fn().mockReturnValue({
        getConnectionStatus: vi.fn(),
        initialize: vi.fn(),
        shutdown: vi.fn(),
      }),
    },
    loadEnvironment: vi.fn(),
    loadServerHierarchicalMemory: vi.fn(
      (cwd, debug, fileService, extensionPaths, _maxDirs) =>
        Promise.resolve({
          memoryContent: extensionPaths?.join(',') || '',
          fileCount: extensionPaths?.length || 0,
        }),
    ),
    DEFAULT_MEMORY_FILE_FILTERING_OPTIONS: {
      respectGitIgnore: false,
      respectGeminiIgnore: true,
    },
    DEFAULT_FILE_FILTERING_OPTIONS: {
      respectGitIgnore: true,
      respectGeminiIgnore: true,
    },
  };
});

describe('parseArguments', () => {
  const originalArgv = process.argv;

  afterEach(() => {
    process.argv = originalArgv;
  });

  it('should throw an error when both --prompt and --prompt-interactive are used together', async () => {
    process.argv = [
      'node',
      'script.js',
      '--prompt',
      'test prompt',
      '--prompt-interactive',
      'interactive prompt',
    ];

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    const mockConsoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(parseArguments()).rejects.toThrow('process.exit called');

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining(
        'Cannot use both --prompt (-p) and --prompt-interactive (-i) together',
      ),
    );

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('should throw an error when using short flags -p and -i together', async () => {
    process.argv = [
      'node',
      'script.js',
      '-p',
      'test prompt',
      '-i',
      'interactive prompt',
    ];

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    const mockConsoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(parseArguments()).rejects.toThrow('process.exit called');

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining(
        'Cannot use both --prompt (-p) and --prompt-interactive (-i) together',
      ),
    );

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('should allow --prompt without --prompt-interactive', async () => {
    process.argv = ['node', 'script.js', '--prompt', 'test prompt'];
    const argv = await parseArguments();
    expect(argv.prompt).toBe('test prompt');
    expect(argv.promptInteractive).toBeUndefined();
  });

  it('should allow --prompt-interactive without --prompt', async () => {
    process.argv = [
      'node',
      'script.js',
      '--prompt-interactive',
      'interactive prompt',
    ];
    const argv = await parseArguments();
    expect(argv.promptInteractive).toBe('interactive prompt');
    expect(argv.prompt).toBeUndefined();
  });

  it('should allow -i flag as alias for --prompt-interactive', async () => {
    process.argv = ['node', 'script.js', '-i', 'interactive prompt'];
    const argv = await parseArguments();
    expect(argv.promptInteractive).toBe('interactive prompt');
    expect(argv.prompt).toBeUndefined();
  });
});

describe('loadCliConfig', () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    process.env.GEMINI_API_KEY = 'test-api-key'; // Ensure API key is set for tests
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should set showMemoryUsage to true when --show-memory-usage flag is present', async () => {
    process.argv = ['node', 'script.js', '--show-memory-usage'];
    const argv = await parseArguments();
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getShowMemoryUsage()).toBe(true);
  });

  it('should set showMemoryUsage to false when --memory flag is not present', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getShowMemoryUsage()).toBe(false);
  });

  it('should set showMemoryUsage to false by default from settings if CLI flag is not present', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = { showMemoryUsage: false };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getShowMemoryUsage()).toBe(false);
  });

  it('should prioritize CLI flag over settings for showMemoryUsage (CLI true, settings false)', async () => {
    process.argv = ['node', 'script.js', '--show-memory-usage'];
    const argv = await parseArguments();
    const settings: Settings = { showMemoryUsage: false };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getShowMemoryUsage()).toBe(true);
  });

  it(`should leave proxy to empty by default`, async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
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
      process.env[input.env_name] = input.proxy_url;
      process.argv = ['node', 'script.js'];
      const argv = await parseArguments();
      const settings: Settings = {};
      const config = await loadCliConfig(settings, [], 'test-session', argv);
      expect(config.getProxy()).toBe(expected);
    });
  });

  it('should set proxy when --proxy flag is present', async () => {
    process.argv = ['node', 'script.js', '--proxy', 'http://localhost:7890'];
    const argv = await parseArguments();
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getProxy()).toBe('http://localhost:7890');
  });

  it('should prioritize CLI flag over environment variable for proxy (CLI http://localhost:7890, environment variable http://localhost:7891)', async () => {
    process.env['http_proxy'] = 'http://localhost:7891';
    process.argv = ['node', 'script.js', '--proxy', 'http://localhost:7890'];
    const argv = await parseArguments();
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getProxy()).toBe('http://localhost:7890');
  });
});

describe('loadCliConfig telemetry', () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    process.env.GEMINI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should set telemetry to false by default when no flag or setting is present', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(false);
  });

  it('should set telemetry to true when --telemetry flag is present', async () => {
    process.argv = ['node', 'script.js', '--telemetry'];
    const argv = await parseArguments();
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(true);
  });

  it('should set telemetry to false when --no-telemetry flag is present', async () => {
    process.argv = ['node', 'script.js', '--no-telemetry'];
    const argv = await parseArguments();
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(false);
  });

  it('should use telemetry value from settings if CLI flag is not present (settings true)', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { enabled: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(true);
  });

  it('should use telemetry value from settings if CLI flag is not present (settings false)', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { enabled: false } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(false);
  });

  it('should prioritize --telemetry CLI flag (true) over settings (false)', async () => {
    process.argv = ['node', 'script.js', '--telemetry'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { enabled: false } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(true);
  });

  it('should prioritize --no-telemetry CLI flag (false) over settings (true)', async () => {
    process.argv = ['node', 'script.js', '--no-telemetry'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { enabled: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(false);
  });

  it('should use telemetry OTLP endpoint from settings if CLI flag is not present', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = {
      telemetry: { otlpEndpoint: 'http://settings.example.com' },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryOtlpEndpoint()).toBe(
      'http://settings.example.com',
    );
  });

  it('should prioritize --telemetry-otlp-endpoint CLI flag over settings', async () => {
    process.argv = [
      'node',
      'script.js',
      '--telemetry-otlp-endpoint',
      'http://cli.example.com',
    ];
    const argv = await parseArguments();
    const settings: Settings = {
      telemetry: { otlpEndpoint: 'http://settings.example.com' },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryOtlpEndpoint()).toBe('http://cli.example.com');
  });

  it('should use default endpoint if no OTLP endpoint is provided via CLI or settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { enabled: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryOtlpEndpoint()).toBe('http://localhost:4317');
  });

  it('should use telemetry target from settings if CLI flag is not present', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = {
      telemetry: { target: ServerConfig.DEFAULT_TELEMETRY_TARGET },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryTarget()).toBe(
      ServerConfig.DEFAULT_TELEMETRY_TARGET,
    );
  });

  it('should prioritize --telemetry-target CLI flag over settings', async () => {
    process.argv = ['node', 'script.js', '--telemetry-target', 'gcp'];
    const argv = await parseArguments();
    const settings: Settings = {
      telemetry: { target: ServerConfig.DEFAULT_TELEMETRY_TARGET },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryTarget()).toBe('gcp');
  });

  it('should use default target if no target is provided via CLI or settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { enabled: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryTarget()).toBe(
      ServerConfig.DEFAULT_TELEMETRY_TARGET,
    );
  });

  it('should use telemetry log prompts from settings if CLI flag is not present', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { logPrompts: false } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryLogPromptsEnabled()).toBe(false);
  });

  it('should prioritize --telemetry-log-prompts CLI flag (true) over settings (false)', async () => {
    process.argv = ['node', 'script.js', '--telemetry-log-prompts'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { logPrompts: false } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
  });

  it('should prioritize --no-telemetry-log-prompts CLI flag (false) over settings (true)', async () => {
    process.argv = ['node', 'script.js', '--no-telemetry-log-prompts'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { logPrompts: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryLogPromptsEnabled()).toBe(false);
  });

  it('should use default log prompts (true) if no value is provided via CLI or settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = { telemetry: { enabled: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
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
    const settings: Settings = {};
    const extensions: Extension[] = [
      {
        config: {
          name: 'ext1',
          version: '1.0.0',
        },
        contextFiles: ['/path/to/ext1/GEMINI.md'],
      },
      {
        config: {
          name: 'ext2',
          version: '1.0.0',
        },
        contextFiles: [],
      },
      {
        config: {
          name: 'ext3',
          version: '1.0.0',
        },
        contextFiles: [
          '/path/to/ext3/context1.md',
          '/path/to/ext3/context2.md',
        ],
      },
    ];
    const argv = await parseArguments();
    await loadCliConfig(settings, extensions, 'session-id', argv);
    expect(ServerConfig.loadServerHierarchicalMemory).toHaveBeenCalledWith(
      expect.any(String),
      false,
      expect.any(Object),
      [
        '/path/to/ext1/GEMINI.md',
        '/path/to/ext3/context1.md',
        '/path/to/ext3/context2.md',
      ],
      {
        respectGitIgnore: false,
        respectGeminiIgnore: true,
      },
      undefined, // maxDirs
    );
  });

  // NOTE TO FUTURE DEVELOPERS:
  // To re-enable tests for loadHierarchicalGeminiMemory, ensure that:
  // 1. os.homedir() is reliably mocked *before* the config.ts module is loaded
  //    and its functions (which use os.homedir()) are called.
  // 2. fs/promises and fs mocks correctly simulate file/directory existence,
  //    readability, and content based on paths derived from the mocked os.homedir().
  // 3. Spies on console functions (for logger output) are correctly set up if needed.
  // Example of a previously failing test structure:
  /*
  it('should correctly use mocked homedir for global path', async () => {
    const MOCK_GEMINI_DIR_LOCAL = path.join('/mock/home/user', '.gemini');
    const MOCK_GLOBAL_PATH_LOCAL = path.join(MOCK_GEMINI_DIR_LOCAL, 'GEMINI.md');
    mockFs({
      [MOCK_GLOBAL_PATH_LOCAL]: { type: 'file', content: 'GlobalContentOnly' }
    });
    const memory = await loadHierarchicalGeminiMemory("/some/other/cwd", false);
    expect(memory).toBe('GlobalContentOnly');
    expect(vi.mocked(os.homedir)).toHaveBeenCalled();
    expect(fsPromises.readFile).toHaveBeenCalledWith(MOCK_GLOBAL_PATH_LOCAL, 'utf-8');
  });
  */
});

describe('mergeMcpServers', () => {
  it('should not modify the original settings object', async () => {
    const settings: Settings = {
      mcpServers: {
        'test-server': {
          url: 'http://localhost:8080',
        },
      },
    };
    const extensions: Extension[] = [
      {
        config: {
          name: 'ext1',
          version: '1.0.0',
          mcpServers: {
            'ext1-server': {
              url: 'http://localhost:8081',
            },
          },
        },
        contextFiles: [],
      },
    ];
    const originalSettings = JSON.parse(JSON.stringify(settings));
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    await loadCliConfig(settings, extensions, 'test-session', argv);
    expect(settings).toEqual(originalSettings);
  });
});

describe('mergeExcludeTools', () => {
  it('should merge excludeTools from settings and extensions', async () => {
    const settings: Settings = { excludeTools: ['tool1', 'tool2'] };
    const extensions: Extension[] = [
      {
        config: {
          name: 'ext1',
          version: '1.0.0',
          excludeTools: ['tool3', 'tool4'],
        },
        contextFiles: [],
      },
      {
        config: {
          name: 'ext2',
          version: '1.0.0',
          excludeTools: ['tool5'],
        },
        contextFiles: [],
      },
    ];
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).toEqual(
      expect.arrayContaining(['tool1', 'tool2', 'tool3', 'tool4', 'tool5']),
    );
    expect(config.getExcludeTools()).toHaveLength(5);
  });

  it('should handle overlapping excludeTools between settings and extensions', async () => {
    const settings: Settings = { excludeTools: ['tool1', 'tool2'] };
    const extensions: Extension[] = [
      {
        config: {
          name: 'ext1',
          version: '1.0.0',
          excludeTools: ['tool2', 'tool3'],
        },
        contextFiles: [],
      },
    ];
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).toEqual(
      expect.arrayContaining(['tool1', 'tool2', 'tool3']),
    );
    expect(config.getExcludeTools()).toHaveLength(3);
  });

  it('should handle overlapping excludeTools between extensions', async () => {
    const settings: Settings = { excludeTools: ['tool1'] };
    const extensions: Extension[] = [
      {
        config: {
          name: 'ext1',
          version: '1.0.0',
          excludeTools: ['tool2', 'tool3'],
        },
        contextFiles: [],
      },
      {
        config: {
          name: 'ext2',
          version: '1.0.0',
          excludeTools: ['tool3', 'tool4'],
        },
        contextFiles: [],
      },
    ];
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).toEqual(
      expect.arrayContaining(['tool1', 'tool2', 'tool3', 'tool4']),
    );
    expect(config.getExcludeTools()).toHaveLength(4);
  });

  it('should return an empty array when no excludeTools are specified', async () => {
    const settings: Settings = {};
    const extensions: Extension[] = [];
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).toEqual([]);
  });

  it('should handle settings with excludeTools but no extensions', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = { excludeTools: ['tool1', 'tool2'] };
    const extensions: Extension[] = [];
    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).toEqual(
      expect.arrayContaining(['tool1', 'tool2']),
    );
    expect(config.getExcludeTools()).toHaveLength(2);
  });

  it('should handle extensions with excludeTools but no settings', async () => {
    const settings: Settings = {};
    const extensions: Extension[] = [
      {
        config: {
          name: 'ext1',
          version: '1.0.0',
          excludeTools: ['tool1', 'tool2'],
        },
        contextFiles: [],
      },
    ];
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).toEqual(
      expect.arrayContaining(['tool1', 'tool2']),
    );
    expect(config.getExcludeTools()).toHaveLength(2);
  });

  it('should not modify the original settings object', async () => {
    const settings: Settings = { excludeTools: ['tool1'] };
    const extensions: Extension[] = [
      {
        config: {
          name: 'ext1',
          version: '1.0.0',
          excludeTools: ['tool2'],
        },
        contextFiles: [],
      },
    ];
    const originalSettings = JSON.parse(JSON.stringify(settings));
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    await loadCliConfig(settings, extensions, 'test-session', argv);
    expect(settings).toEqual(originalSettings);
  });
});

describe('loadCliConfig with allowed-mcp-server-names', () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    process.env.GEMINI_API_KEY = 'test-api-key';
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  const baseSettings: Settings = {
    mcpServers: {
      server1: { url: 'http://localhost:8080' },
      server2: { url: 'http://localhost:8081' },
      server3: { url: 'http://localhost:8082' },
    },
  };

  it('should allow all MCP servers if the flag is not provided', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const config = await loadCliConfig(baseSettings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual(baseSettings.mcpServers);
  });

  it('should allow only the specified MCP server', async () => {
    process.argv = [
      'node',
      'script.js',
      '--allowed-mcp-server-names',
      'server1',
    ];
    const argv = await parseArguments();
    const config = await loadCliConfig(baseSettings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({
      server1: { url: 'http://localhost:8080' },
    });
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
    const argv = await parseArguments();
    const config = await loadCliConfig(baseSettings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({
      server1: { url: 'http://localhost:8080' },
      server3: { url: 'http://localhost:8082' },
    });
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
    const argv = await parseArguments();
    const config = await loadCliConfig(baseSettings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({
      server1: { url: 'http://localhost:8080' },
    });
  });

  it('should allow no MCP servers if the flag is provided but empty', async () => {
    process.argv = ['node', 'script.js', '--allowed-mcp-server-names', ''];
    const argv = await parseArguments();
    const config = await loadCliConfig(baseSettings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({});
  });

  it('should read allowMCPServers from settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = {
      ...baseSettings,
      allowMCPServers: ['server1', 'server2'],
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({
      server1: { url: 'http://localhost:8080' },
      server2: { url: 'http://localhost:8081' },
    });
  });

  it('should read excludeMCPServers from settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = {
      ...baseSettings,
      excludeMCPServers: ['server1', 'server2'],
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({
      server3: { url: 'http://localhost:8082' },
    });
  });

  it('should override allowMCPServers with excludeMCPServers if overlapping ', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = {
      ...baseSettings,
      excludeMCPServers: ['server1'],
      allowMCPServers: ['server1', 'server2'],
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({
      server2: { url: 'http://localhost:8081' },
    });
  });

  it('should prioritize mcp server flag if set ', async () => {
    process.argv = [
      'node',
      'script.js',
      '--allowed-mcp-server-names',
      'server1',
    ];
    const argv = await parseArguments();
    const settings: Settings = {
      ...baseSettings,
      excludeMCPServers: ['server1'],
      allowMCPServers: ['server2'],
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({
      server1: { url: 'http://localhost:8080' },
    });
  });
});

describe('loadCliConfig extensions', () => {
  const mockExtensions: Extension[] = [
    {
      config: { name: 'ext1', version: '1.0.0' },
      contextFiles: ['/path/to/ext1.md'],
    },
    {
      config: { name: 'ext2', version: '1.0.0' },
      contextFiles: ['/path/to/ext2.md'],
    },
  ];

  it('should not filter extensions if --extensions flag is not used', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    const settings: Settings = {};
    const config = await loadCliConfig(
      settings,
      mockExtensions,
      'test-session',
      argv,
    );
    expect(config.getExtensionContextFilePaths()).toEqual([
      '/path/to/ext1.md',
      '/path/to/ext2.md',
    ]);
  });

  it('should filter extensions if --extensions flag is used', async () => {
    process.argv = ['node', 'script.js', '--extensions', 'ext1'];
    const argv = await parseArguments();
    const settings: Settings = {};
    const config = await loadCliConfig(
      settings,
      mockExtensions,
      'test-session',
      argv,
    );
    expect(config.getExtensionContextFilePaths()).toEqual(['/path/to/ext1.md']);
  });
});

describe('loadCliConfig ideMode', () => {
  const originalArgv = process.argv;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    process.env.GEMINI_API_KEY = 'test-api-key';
    delete process.env.SANDBOX;
    delete process.env.GEMINI_CLI_IDE_SERVER_PORT;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it('should be false by default', async () => {
    process.argv = ['node', 'script.js'];
    const settings: Settings = {};
    const argv = await parseArguments();
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getIdeMode()).toBe(false);
  });

  it('should be false when settings.ideMode is true, but SANDBOX is set', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments();
    process.env.TERM_PROGRAM = 'vscode';
    process.env.SANDBOX = 'true';
    const settings: Settings = { ideMode: true };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getIdeMode()).toBe(false);
  });
});
