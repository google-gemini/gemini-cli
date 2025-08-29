/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from 'vitest';
import * as os from 'node:os';
import * as path from 'node:path';
import { ShellTool, EditTool, WriteFileTool } from '@google/gemini-cli-core';
import { loadCliConfig, parseArguments, type CliArgs } from './config.js';
import type { Settings } from './settings.js';
import type { Extension } from './extension.js';
import * as ServerConfig from '@google/gemini-cli-core';
import { isWorkspaceTrusted } from './trustedFolders.js';

vi.mock('./trustedFolders.js', () => ({
  isWorkspaceTrusted: vi.fn().mockReturnValue(true), // Default to trusted
}));

vi.mock('fs', async (importOriginal) => {
  const actualFs = await importOriginal<typeof import('fs')>();
  const pathMod = await import('node:path');
  const mockHome = '/mock/home/user';
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
      return (actualFs as typeof import('fs')).statSync(p as unknown as string);
    }),
    realpathSync: vi.fn((p) => p),
  };
});

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
      getInstance: vi.fn().mockResolvedValue({
        getConnectionStatus: vi.fn(),
        initialize: vi.fn(),
        shutdown: vi.fn(),
      }),
    },
    loadEnvironment: vi.fn(),
    loadServerHierarchicalMemory: vi.fn(
      (cwd, dirs, debug, fileService, extensionPaths, _maxDirs) =>
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

    await expect(parseArguments({} as Settings)).rejects.toThrow(
      'process.exit called',
    );

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

    await expect(parseArguments({} as Settings)).rejects.toThrow(
      'process.exit called',
    );

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
    const argv = await parseArguments({} as Settings);
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
    const argv = await parseArguments({} as Settings);
    expect(argv.promptInteractive).toBe('interactive prompt');
    expect(argv.prompt).toBeUndefined();
  });

  it('should allow -i flag as alias for --prompt-interactive', async () => {
    process.argv = ['node', 'script.js', '-i', 'interactive prompt'];
    const argv = await parseArguments({} as Settings);
    expect(argv.promptInteractive).toBe('interactive prompt');
    expect(argv.prompt).toBeUndefined();
  });

  it('should throw an error when both --yolo and --approval-mode are used together', async () => {
    process.argv = [
      'node',
      'script.js',
      '--yolo',
      '--approval-mode',
      'default',
    ];

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    const mockConsoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(parseArguments({} as Settings)).rejects.toThrow(
      'process.exit called',
    );

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining(
        'Cannot use both --yolo (-y) and --approval-mode together. Use --approval-mode=yolo instead.',
      ),
    );

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('should throw an error when using short flags -y and --approval-mode together', async () => {
    process.argv = ['node', 'script.js', '-y', '--approval-mode', 'yolo'];

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    const mockConsoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(parseArguments({} as Settings)).rejects.toThrow(
      'process.exit called',
    );

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining(
        'Cannot use both --yolo (-y) and --approval-mode together. Use --approval-mode=yolo instead.',
      ),
    );

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });

  it('should allow --approval-mode without --yolo', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'auto_edit'];
    const argv = await parseArguments({} as Settings);
    expect(argv.approvalMode).toBe('auto_edit');
    expect(argv.yolo).toBe(false);
  });

  it('should allow --yolo without --approval-mode', async () => {
    process.argv = ['node', 'script.js', '--yolo'];
    const argv = await parseArguments({} as Settings);
    expect(argv.yolo).toBe(true);
    expect(argv.approvalMode).toBeUndefined();
  });

  it('should reject invalid --approval-mode values', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'invalid'];

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    const mockConsoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(parseArguments({} as Settings)).rejects.toThrow(
      'process.exit called',
    );

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid values:'),
    );

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
  });
});

describe('loadCliConfig', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should set showMemoryUsage to true when --show-memory-usage flag is present', async () => {
    process.argv = ['node', 'script.js', '--show-memory-usage'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getShowMemoryUsage()).toBe(true);
  });

  it('should set showMemoryUsage to false when --memory flag is not present', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getShowMemoryUsage()).toBe(false);
  });

  it('should set showMemoryUsage to false by default from settings if CLI flag is not present', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = { ui: { showMemoryUsage: false } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getShowMemoryUsage()).toBe(false);
  });

  it('should prioritize CLI flag over settings for showMemoryUsage (CLI true, settings false)', async () => {
    process.argv = ['node', 'script.js', '--show-memory-usage'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = { ui: { showMemoryUsage: false } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getShowMemoryUsage()).toBe(true);
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
      const argv = await parseArguments({} as Settings);
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
        vi.stubEnv(input.env_name, input.proxy_url);
        process.argv = ['node', 'script.js'];
        const argv = await parseArguments({} as Settings);
        const settings: Settings = {};
        const config = await loadCliConfig(settings, [], 'test-session', argv);
        expect(config.getProxy()).toBe(expected);
      });
    });

    it('should set proxy when --proxy flag is present', async () => {
      process.argv = ['node', 'script.js', '--proxy', 'http://localhost:7890'];
      const argv = await parseArguments({} as Settings);
      const settings: Settings = {};
      const config = await loadCliConfig(settings, [], 'test-session', argv);
      expect(config.getProxy()).toBe('http://localhost:7890');
    });

    it('should prioritize CLI flag over environment variable for proxy (CLI http://localhost:7890, environment variable http://localhost:7891)', async () => {
      vi.stubEnv('http_proxy', 'http://localhost:7891');
      process.argv = ['node', 'script.js', '--proxy', 'http://localhost:7890'];
      const argv = await parseArguments({} as Settings);
      const settings: Settings = {};
      const config = await loadCliConfig(settings, [], 'test-session', argv);
      expect(config.getProxy()).toBe('http://localhost:7890');
    });
  });
});

describe('loadCliConfig telemetry', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should set telemetry to false by default when no flag or setting is present', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(false);
  });

  it('should set telemetry to true when --telemetry flag is present', async () => {
    process.argv = ['node', 'script.js', '--telemetry'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(true);
  });

  it('should set telemetry to false when --no-telemetry flag is present', async () => {
    process.argv = ['node', 'script.js', '--no-telemetry'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(false);
  });

  it('should use telemetry value from settings if CLI flag is not present (settings true)', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = { telemetry: { enabled: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(true);
  });

  it('should use telemetry value from settings if CLI flag is not present (settings false)', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = { telemetry: { enabled: false } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(false);
  });

  it('should prioritize --telemetry CLI flag (true) over settings (false)', async () => {
    process.argv = ['node', 'script.js', '--telemetry'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = { telemetry: { enabled: false } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(true);
  });

  it('should prioritize --no-telemetry CLI flag (false) over settings (true)', async () => {
    process.argv = ['node', 'script.js', '--no-telemetry'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = { telemetry: { enabled: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryEnabled()).toBe(false);
  });

  it('should use telemetry OTLP endpoint from settings if CLI flag is not present', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
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
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {
      telemetry: { otlpEndpoint: 'http://settings.example.com' },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryOtlpEndpoint()).toBe('http://cli.example.com');
  });

  it('should use default endpoint if no OTLP endpoint is provided via CLI or settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = { telemetry: { enabled: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryOtlpEndpoint()).toBe('http://localhost:4317');
  });

  it('should use telemetry target from settings if CLI flag is not present', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
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
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {
      telemetry: { target: ServerConfig.DEFAULT_TELEMETRY_TARGET },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryTarget()).toBe('gcp');
  });

  it('should use default target if no target is provided via CLI or settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = { telemetry: { enabled: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryTarget()).toBe(
      ServerConfig.DEFAULT_TELEMETRY_TARGET,
    );
  });

  it('should use telemetry log prompts from settings if CLI flag is not present', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = { telemetry: { logPrompts: false } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryLogPromptsEnabled()).toBe(false);
  });

  it('should prioritize --telemetry-log-prompts CLI flag (true) over settings (false)', async () => {
    process.argv = ['node', 'script.js', '--telemetry-log-prompts'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = { telemetry: { logPrompts: false } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
  });

  it('should prioritize --no-telemetry-log-prompts CLI flag (false) over settings (true)', async () => {
    process.argv = ['node', 'script.js', '--no-telemetry-log-prompts'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = { telemetry: { logPrompts: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryLogPromptsEnabled()).toBe(false);
  });

  it('should use default log prompts (true) if no value is provided via CLI or settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = { telemetry: { enabled: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryLogPromptsEnabled()).toBe(true);
  });

  it('should use telemetry OTLP protocol from settings if CLI flag is not present', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {
      telemetry: { otlpProtocol: 'http' },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryOtlpProtocol()).toBe('http');
  });

  it('should prioritize --telemetry-otlp-protocol CLI flag over settings', async () => {
    process.argv = ['node', 'script.js', '--telemetry-otlp-protocol', 'http'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {
      telemetry: { otlpProtocol: 'grpc' },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryOtlpProtocol()).toBe('http');
  });

  it('should use default protocol if no OTLP protocol is provided via CLI or settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = { telemetry: { enabled: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getTelemetryOtlpProtocol()).toBe('grpc');
  });

  it('should reject invalid --telemetry-otlp-protocol values', async () => {
    process.argv = [
      'node',
      'script.js',
      '--telemetry-otlp-protocol',
      'invalid',
    ];

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    const mockConsoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});

    await expect(parseArguments({} as Settings)).rejects.toThrow(
      'process.exit called',
    );

    expect(mockConsoleError).toHaveBeenCalledWith(
      expect.stringContaining('Invalid values:'),
    );

    mockExit.mockRestore();
    mockConsoleError.mockRestore();
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
        path: '/path/to/ext1',
        config: {
          name: 'ext1',
          version: '1.0.0',
        },
        contextFiles: ['/path/to/ext1/GEMINI.md'],
      },
      {
        path: '/path/to/ext2',
        config: {
          name: 'ext2',
          version: '1.0.0',
        },
        contextFiles: [],
      },
      {
        path: '/path/to/ext3',
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
    const argv = await parseArguments({} as Settings);
    await loadCliConfig(settings, extensions, 'session-id', argv);
    expect(ServerConfig.loadServerHierarchicalMemory).toHaveBeenCalledWith(
      expect.any(String),
      [],
      false,
      expect.any(Object),
      [
        '/path/to/ext1/GEMINI.md',
        '/path/to/ext3/context1.md',
        '/path/to/ext3/context2.md',
      ],
      'tree',
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
  it.skip('should correctly use mocked homedir for global path', async () => {
    const MOCK_GEMINI_DIR_LOCAL = path.join('/mock/home/user', '.gemini');
    const MOCK_GLOBAL_PATH_LOCAL = path.join(
      MOCK_GEMINI_DIR_LOCAL,
      'GEMINI.md',
    );
    mockFs({
      [MOCK_GLOBAL_PATH_LOCAL]: { type: 'file', content: 'GlobalContentOnly' },
    });
    const memory = await loadHierarchicalGeminiMemory('/some/other/cwd', false);
    expect(memory).toBe('GlobalContentOnly');
    expect(vi.mocked(os.homedir)).toHaveBeenCalled();
    expect(fsPromises.readFile).toHaveBeenCalledWith(
      MOCK_GLOBAL_PATH_LOCAL,
      'utf-8',
    );
  });
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
        path: '/path/to/ext1',
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
    const argv = await parseArguments({} as Settings);
    await loadCliConfig(settings, extensions, 'test-session', argv);
    expect(settings).toEqual(originalSettings);
  });
});

describe('mergeExcludeTools', () => {
  const defaultExcludes = [ShellTool.Name, EditTool.Name, WriteFileTool.Name];
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    process.stdin.isTTY = true;
  });

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY;
  });

  it('should merge excludeTools from settings and extensions', async () => {
    const settings: Settings = { tools: { exclude: ['tool1', 'tool2'] } };
    const extensions: Extension[] = [
      {
        path: '/path/to/ext1',
        config: {
          name: 'ext1',
          version: '1.0.0',
          excludeTools: ['tool3', 'tool4'],
        },
        contextFiles: [],
      },
      {
        path: '/path/to/ext2',
        config: {
          name: 'ext2',
          version: '1.0.0',
          excludeTools: ['tool5'],
        },
        contextFiles: [],
      },
    ];
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
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
    const settings: Settings = { tools: { exclude: ['tool1', 'tool2'] } };
    const extensions: Extension[] = [
      {
        path: '/path/to/ext1',
        config: {
          name: 'ext1',
          version: '1.0.0',
          excludeTools: ['tool2', 'tool3'],
        },
        contextFiles: [],
      },
    ];
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
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
    const settings: Settings = { tools: { exclude: ['tool1'] } };
    const extensions: Extension[] = [
      {
        path: '/path/to/ext1',
        config: {
          name: 'ext1',
          version: '1.0.0',
          excludeTools: ['tool2', 'tool3'],
        },
        contextFiles: [],
      },
      {
        path: '/path/to/ext2',
        config: {
          name: 'ext2',
          version: '1.0.0',
          excludeTools: ['tool3', 'tool4'],
        },
        contextFiles: [],
      },
    ];
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
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

  it('should return an empty array when no excludeTools are specified and it is interactive', async () => {
    process.stdin.isTTY = true;
    const settings: Settings = {};
    const extensions: Extension[] = [];
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).toEqual([]);
  });

  it('should return default excludes when no excludeTools are specified and it is not interactive', async () => {
    process.stdin.isTTY = false;
    const settings: Settings = {};
    const extensions: Extension[] = [];
    process.argv = ['node', 'script.js', '-p', 'test'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );
    expect(config.getExcludeTools()).toEqual(defaultExcludes);
  });

  it('should handle settings with excludeTools but no extensions', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = { tools: { exclude: ['tool1', 'tool2'] } };
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
        path: '/path/to/ext',
        config: {
          name: 'ext1',
          version: '1.0.0',
          excludeTools: ['tool1', 'tool2'],
        },
        contextFiles: [],
      },
    ];
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
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
    const settings: Settings = { tools: { exclude: ['tool1'] } };
    const extensions: Extension[] = [
      {
        path: '/path/to/ext',
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
    const argv = await parseArguments({} as Settings);
    await loadCliConfig(settings, extensions, 'test-session', argv);
    expect(settings).toEqual(originalSettings);
  });
});

describe('Approval mode tool exclusion logic', () => {
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    process.stdin.isTTY = false; // Ensure non-interactive mode
    vi.mocked(isWorkspaceTrusted).mockReturnValue(true);
  });

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY;
  });

  it('should exclude all interactive tools in non-interactive mode with default approval mode', async () => {
    process.argv = ['node', 'script.js', '-p', 'test'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {};
    const extensions: Extension[] = [];

    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );

    const excludedTools = config.getExcludeTools();
    expect(excludedTools).toContain(ShellTool.Name);
    expect(excludedTools).toContain(EditTool.Name);
    expect(excludedTools).toContain(WriteFileTool.Name);
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
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {};
    const extensions: Extension[] = [];

    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );

    const excludedTools = config.getExcludeTools();
    expect(excludedTools).toContain(ShellTool.Name);
    expect(excludedTools).toContain(EditTool.Name);
    expect(excludedTools).toContain(WriteFileTool.Name);
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
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {};
    const extensions: Extension[] = [];

    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );

    const excludedTools = config.getExcludeTools();
    expect(excludedTools).toContain(ShellTool.Name);
    expect(excludedTools).not.toContain(EditTool.Name);
    expect(excludedTools).not.toContain(WriteFileTool.Name);
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
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {};
    const extensions: Extension[] = [];

    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );

    const excludedTools = config.getExcludeTools();
    expect(excludedTools).not.toContain(ShellTool.Name);
    expect(excludedTools).not.toContain(EditTool.Name);
    expect(excludedTools).not.toContain(WriteFileTool.Name);
  });

  it('should exclude no interactive tools in non-interactive mode with legacy yolo flag', async () => {
    process.argv = ['node', 'script.js', '--yolo', '-p', 'test'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {};
    const extensions: Extension[] = [];

    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );

    const excludedTools = config.getExcludeTools();
    expect(excludedTools).not.toContain(ShellTool.Name);
    expect(excludedTools).not.toContain(EditTool.Name);
    expect(excludedTools).not.toContain(WriteFileTool.Name);
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
      const argv = await parseArguments({} as Settings);
      const settings: Settings = {};
      const extensions: Extension[] = [];

      const config = await loadCliConfig(
        settings,
        extensions,
        'test-session',
        argv,
      );

      const excludedTools = config.getExcludeTools();
      expect(excludedTools).not.toContain(ShellTool.Name);
      expect(excludedTools).not.toContain(EditTool.Name);
      expect(excludedTools).not.toContain(WriteFileTool.Name);
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
    const argv = await parseArguments({} as Settings);
    const settings: Settings = { tools: { exclude: ['custom_tool'] } };
    const extensions: Extension[] = [];

    const config = await loadCliConfig(
      settings,
      extensions,
      'test-session',
      argv,
    );

    const excludedTools = config.getExcludeTools();
    expect(excludedTools).toContain('custom_tool'); // From settings
    expect(excludedTools).toContain(ShellTool.Name); // From approval mode
    expect(excludedTools).not.toContain(EditTool.Name); // Should be allowed in auto_edit
    expect(excludedTools).not.toContain(WriteFileTool.Name); // Should be allowed in auto_edit
  });

  it('should throw an error for invalid approval mode values in loadCliConfig', async () => {
    // Create a mock argv with an invalid approval mode that bypasses argument parsing validation
    const invalidArgv: Partial<CliArgs> & { approvalMode: string } = {
      approvalMode: 'invalid_mode',
      promptInteractive: '',
      prompt: '',
      yolo: false,
    };

    const settings: Settings = {};
    const extensions: Extension[] = [];

    await expect(
      loadCliConfig(
        settings,
        extensions,
        'test-session',
        invalidArgv as CliArgs,
      ),
    ).rejects.toThrow(
      'Invalid approval mode: invalid_mode. Valid values are: yolo, auto_edit, default',
    );
  });
});

describe('loadCliConfig with allowed-mcp-server-names', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
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
    const argv = await parseArguments({} as Settings);
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
    const argv = await parseArguments({} as Settings);
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
    const argv = await parseArguments({} as Settings);
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
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig(baseSettings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({
      server1: { url: 'http://localhost:8080' },
    });
  });

  it('should allow no MCP servers if the flag is provided but empty', async () => {
    process.argv = ['node', 'script.js', '--allowed-mcp-server-names', ''];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig(baseSettings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({});
  });

  it('should read allowMCPServers from settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {
      ...baseSettings,
      mcp: { allowed: ['server1', 'server2'] },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({
      server1: { url: 'http://localhost:8080' },
      server2: { url: 'http://localhost:8081' },
    });
  });

  it('should read excludeMCPServers from settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {
      ...baseSettings,
      mcp: { excluded: ['server1', 'server2'] },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({
      server3: { url: 'http://localhost:8082' },
    });
  });

  it('should override allowMCPServers with excludeMCPServers if overlapping', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {
      ...baseSettings,
      mcp: {
        excluded: ['server1'],
        allowed: ['server1', 'server2'],
      },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({
      server2: { url: 'http://localhost:8081' },
    });
  });

  it('should prioritize mcp server flag if set', async () => {
    process.argv = [
      'node',
      'script.js',
      '--allowed-mcp-server-names',
      'server1',
    ];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {
      ...baseSettings,
      mcp: {
        excluded: ['server1'],
        allowed: ['server2'],
      },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({
      server1: { url: 'http://localhost:8080' },
    });
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
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {
      ...baseSettings,
      mcp: {
        allowed: ['server1', 'server2'], // Should be ignored
        excluded: ['server3'], // Should be ignored
      },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getMcpServers()).toEqual({
      server2: { url: 'http://localhost:8081' },
      server3: { url: 'http://localhost:8082' },
    });
  });
});

describe('loadCliConfig extensions', () => {
  const mockExtensions: Extension[] = [
    {
      path: '/path/to/ext1',
      config: { name: 'ext1', version: '1.0.0' },
      contextFiles: ['/path/to/ext1.md'],
    },
    {
      path: '/path/to/ext2',
      config: { name: 'ext2', version: '1.0.0' },
      contextFiles: ['/path/to/ext2.md'],
    },
  ];

  it('should not filter extensions if --extensions flag is not used', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
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
    const argv = await parseArguments({} as Settings);
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

describe('loadCliConfig model selection', () => {
  it('selects a model from settings.json if provided', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig(
      {
        model: {
          name: 'gemini-9001-ultra',
        },
      },
      [],
      'test-session',
      argv,
    );

    expect(config.getModel()).toBe('gemini-9001-ultra');
  });

  it('uses the default gemini model if nothing is set', async () => {
    process.argv = ['node', 'script.js']; // No model set.
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig(
      {
        // No model set.
      },
      [],
      'test-session',
      argv,
    );

    expect(config.getModel()).toBe('gemini-2.5-pro');
  });

  it('always prefers model from argvs', async () => {
    process.argv = ['node', 'script.js', '--model', 'gemini-8675309-ultra'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig(
      {
        model: {
          name: 'gemini-9001-ultra',
        },
      },
      [],
      'test-session',
      argv,
    );

    expect(config.getModel()).toBe('gemini-8675309-ultra');
  });

  it('selects the model from argvs if provided', async () => {
    process.argv = ['node', 'script.js', '--model', 'gemini-8675309-ultra'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig(
      {
        // No model provided via settings.
      },
      [],
      'test-session',
      argv,
    );

    expect(config.getModel()).toBe('gemini-8675309-ultra');
  });
});

describe('loadCliConfig folderTrustFeature', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should be false by default', async () => {
    process.argv = ['node', 'script.js'];
    const settings: Settings = {};
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getFolderTrustFeature()).toBe(false);
  });

  it('should be true when settings.folderTrustFeature is true', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {
      security: { folderTrust: { featureEnabled: true } },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getFolderTrustFeature()).toBe(true);
  });
});

describe('loadCliConfig folderTrust', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should be false if folderTrustFeature is false and folderTrust is false', async () => {
    process.argv = ['node', 'script.js'];
    const settings: Settings = {
      security: {
        folderTrust: {
          featureEnabled: false,
          enabled: false,
        },
      },
    };
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getFolderTrust()).toBe(false);
  });

  it('should be false if folderTrustFeature is true and folderTrust is false', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {
      security: {
        folderTrust: {
          featureEnabled: true,
          enabled: false,
        },
      },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getFolderTrust()).toBe(false);
  });

  it('should be false if folderTrustFeature is false and folderTrust is true', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {
      security: {
        folderTrust: {
          featureEnabled: false,
          enabled: true,
        },
      },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getFolderTrust()).toBe(false);
  });

  it('should be true when folderTrustFeature is true and folderTrust is true', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {
      security: {
        folderTrust: {
          featureEnabled: true,
          enabled: true,
        },
      },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getFolderTrust()).toBe(true);
  });
});

describe('loadCliConfig with includeDirectories', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    vi.spyOn(process, 'cwd').mockReturnValue(
      path.resolve(path.sep, 'home', 'user', 'project'),
    );
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
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
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {
      context: {
        includeDirectories: [
          path.resolve(path.sep, 'settings', 'path1'),
          path.join(os.homedir(), 'settings', 'path2'),
          path.join(mockCwd, 'settings', 'path3'),
        ],
      },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    const expected = [
      mockCwd,
      path.resolve(path.sep, 'cli', 'path1'),
      path.join(mockCwd, 'cli', 'path2'),
      path.resolve(path.sep, 'settings', 'path1'),
      path.join(os.homedir(), 'settings', 'path2'),
      path.join(mockCwd, 'settings', 'path3'),
    ];
    expect(config.getWorkspaceContext().getDirectories()).toEqual(
      expect.arrayContaining(expected),
    );
    expect(config.getWorkspaceContext().getDirectories()).toHaveLength(
      expected.length,
    );
  });
});

describe('loadCliConfig chatCompression', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should pass chatCompression settings to the core config', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {
      model: {
        chatCompression: {
          contextPercentageThreshold: 0.5,
        },
      },
    };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getChatCompression()).toEqual({
      contextPercentageThreshold: 0.5,
    });
  });

  it('should have undefined chatCompression if not in settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getChatCompression()).toBeUndefined();
  });
});

describe('loadCliConfig useRipgrep', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should be false by default when useRipgrep is not set in settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = {};
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getUseRipgrep()).toBe(false);
  });

  it('should be true when useRipgrep is set to true in settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = { tools: { useRipgrep: true } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getUseRipgrep()).toBe(true);
  });

  it('should be false when useRipgrep is explicitly set to false in settings', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const settings: Settings = { tools: { useRipgrep: false } };
    const config = await loadCliConfig(settings, [], 'test-session', argv);
    expect(config.getUseRipgrep()).toBe(false);
  });
});

describe('loadCliConfig tool exclusions', () => {
  const originalArgv = process.argv;
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    process.stdin.isTTY = true;
    vi.mocked(isWorkspaceTrusted).mockReturnValue(true);
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.stdin.isTTY = originalIsTTY;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should not exclude interactive tools in interactive mode without YOLO', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig({}, [], 'test-session', argv);
    expect(config.getExcludeTools()).not.toContain('run_shell_command');
    expect(config.getExcludeTools()).not.toContain('replace');
    expect(config.getExcludeTools()).not.toContain('write_file');
  });

  it('should not exclude interactive tools in interactive mode with YOLO', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js', '--yolo'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig({}, [], 'test-session', argv);
    expect(config.getExcludeTools()).not.toContain('run_shell_command');
    expect(config.getExcludeTools()).not.toContain('replace');
    expect(config.getExcludeTools()).not.toContain('write_file');
  });

  it('should exclude interactive tools in non-interactive mode without YOLO', async () => {
    process.stdin.isTTY = false;
    process.argv = ['node', 'script.js', '-p', 'test'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig({}, [], 'test-session', argv);
    expect(config.getExcludeTools()).toContain('run_shell_command');
    expect(config.getExcludeTools()).toContain('replace');
    expect(config.getExcludeTools()).toContain('write_file');
  });

  it('should not exclude interactive tools in non-interactive mode with YOLO', async () => {
    process.stdin.isTTY = false;
    process.argv = ['node', 'script.js', '-p', 'test', '--yolo'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig({}, [], 'test-session', argv);
    expect(config.getExcludeTools()).not.toContain('run_shell_command');
    expect(config.getExcludeTools()).not.toContain('replace');
    expect(config.getExcludeTools()).not.toContain('write_file');
  });
});

describe('loadCliConfig interactive', () => {
  const originalArgv = process.argv;
  const originalIsTTY = process.stdin.isTTY;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    process.stdin.isTTY = true;
  });

  afterEach(() => {
    process.argv = originalArgv;
    process.stdin.isTTY = originalIsTTY;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should be interactive if isTTY and no prompt', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig({}, [], 'test-session', argv);
    expect(config.isInteractive()).toBe(true);
  });

  it('should be interactive if prompt-interactive is set', async () => {
    process.stdin.isTTY = false;
    process.argv = ['node', 'script.js', '--prompt-interactive', 'test'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig({}, [], 'test-session', argv);
    expect(config.isInteractive()).toBe(true);
  });

  it('should not be interactive if not isTTY and no prompt', async () => {
    process.stdin.isTTY = false;
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig({}, [], 'test-session', argv);
    expect(config.isInteractive()).toBe(false);
  });

  it('should not be interactive if prompt is set', async () => {
    process.stdin.isTTY = true;
    process.argv = ['node', 'script.js', '--prompt', 'test'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig({}, [], 'test-session', argv);
    expect(config.isInteractive()).toBe(false);
  });
});

describe('loadCliConfig approval mode', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    process.argv = ['node', 'script.js']; // Reset argv for each test
    vi.mocked(isWorkspaceTrusted).mockReturnValue(true);
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('should default to DEFAULT approval mode when no flags are set', async () => {
    process.argv = ['node', 'script.js'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig({}, [], 'test-session', argv);
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
  });

  it('should set YOLO approval mode when --yolo flag is used', async () => {
    process.argv = ['node', 'script.js', '--yolo'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig({}, [], 'test-session', argv);
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.YOLO);
  });

  it('should set YOLO approval mode when -y flag is used', async () => {
    process.argv = ['node', 'script.js', '-y'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig({}, [], 'test-session', argv);
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.YOLO);
  });

  it('should set DEFAULT approval mode when --approval-mode=default', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'default'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig({}, [], 'test-session', argv);
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
  });

  it('should set AUTO_EDIT approval mode when --approval-mode=auto_edit', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'auto_edit'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig({}, [], 'test-session', argv);
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.AUTO_EDIT);
  });

  it('should set YOLO approval mode when --approval-mode=yolo', async () => {
    process.argv = ['node', 'script.js', '--approval-mode', 'yolo'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig({}, [], 'test-session', argv);
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.YOLO);
  });

  it('should prioritize --approval-mode over --yolo when both would be valid (but validation prevents this)', async () => {
    // Note: This test documents the intended behavior, but in practice the validation
    // prevents both flags from being used together
    process.argv = ['node', 'script.js', '--approval-mode', 'default'];
    const argv = await parseArguments({} as Settings);
    // Manually set yolo to true to simulate what would happen if validation didn't prevent it
    argv.yolo = true;
    const config = await loadCliConfig({}, [], 'test-session', argv);
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
  });

  it('should fall back to --yolo behavior when --approval-mode is not set', async () => {
    process.argv = ['node', 'script.js', '--yolo'];
    const argv = await parseArguments({} as Settings);
    const config = await loadCliConfig({}, [], 'test-session', argv);
    expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.YOLO);
  });

  // --- Untrusted Folder Scenarios ---
  describe('when folder is NOT trusted', () => {
    beforeEach(() => {
      vi.mocked(isWorkspaceTrusted).mockReturnValue(false);
    });

    it('should override --approval-mode=yolo to DEFAULT', async () => {
      process.argv = ['node', 'script.js', '--approval-mode', 'yolo'];
      const argv = await parseArguments({} as Settings);
      const config = await loadCliConfig({}, [], 'test-session', argv);
      expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
    });

    it('should override --approval-mode=auto_edit to DEFAULT', async () => {
      process.argv = ['node', 'script.js', '--approval-mode', 'auto_edit'];
      const argv = await parseArguments({} as Settings);
      const config = await loadCliConfig({}, [], 'test-session', argv);
      expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
    });

    it('should override --yolo flag to DEFAULT', async () => {
      process.argv = ['node', 'script.js', '--yolo'];
      const argv = await parseArguments({} as Settings);
      const config = await loadCliConfig({}, [], 'test-session', argv);
      expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
    });

    it('should remain DEFAULT when --approval-mode=default', async () => {
      process.argv = ['node', 'script.js', '--approval-mode', 'default'];
      const argv = await parseArguments({} as Settings);
      const config = await loadCliConfig({}, [], 'test-session', argv);
      expect(config.getApprovalMode()).toBe(ServerConfig.ApprovalMode.DEFAULT);
    });
  });
});

describe('loadCliConfig trustedFolder', () => {
  const originalArgv = process.argv;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue('/mock/home/user');
    vi.stubEnv('GEMINI_API_KEY', 'test-api-key');
    process.argv = ['node', 'script.js']; // Reset argv for each test
  });

  afterEach(() => {
    process.argv = originalArgv;
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  const testCases = [
    // Cases where folderTrustFeature is false (feature disabled)
    {
      folderTrustFeature: false,
      folderTrust: true,
      isWorkspaceTrusted: true,
      expectedFolderTrust: false,
      expectedIsTrustedFolder: true,
      description:
        'feature disabled, folderTrust true, workspace trusted -> behave as trusted',
    },
    {
      folderTrustFeature: false,
      folderTrust: true,
      isWorkspaceTrusted: false,
      expectedFolderTrust: false,
      expectedIsTrustedFolder: true,
      description:
        'feature disabled, folderTrust true, workspace not trusted -> behave as trusted',
    },
    {
      folderTrustFeature: false,
      folderTrust: false,
      isWorkspaceTrusted: true,
      expectedFolderTrust: false,
      expectedIsTrustedFolder: true,
      description:
        'feature disabled, folderTrust false, workspace trusted -> behave as trusted',
    },
    {
      folderTrustFeature: false,
      folderTrust: false,
      isWorkspaceTrusted: false,
      expectedFolderTrust: false,
      expectedIsTrustedFolder: true,
      description:
        'feature disabled, folderTrust false, workspace not trusted -> behave as trusted',
    },
    // Cases where folderTrustFeature is true (feature enabled)
    {
      folderTrustFeature: true,
      folderTrust: true,
      isWorkspaceTrusted: true,
      expectedFolderTrust: true,
      expectedIsTrustedFolder: true,
      description:
        'feature enabled, folderTrust true, workspace trusted -> behave as trusted',
    },
    {
      folderTrustFeature: true,
      folderTrust: true,
      isWorkspaceTrusted: false,
      expectedFolderTrust: true,
      expectedIsTrustedFolder: false,
      description:
        'feature enabled, folderTrust true, workspace not trusted -> behave as not trusted',
    },
    {
      folderTrustFeature: true,
      folderTrust: true,
      isWorkspaceTrusted: undefined,
      expectedFolderTrust: true,
      expectedIsTrustedFolder: true,
      description:
        'feature enabled, folderTrust false, workspace trust unknown -> behave as trusted',
    },
    {
      folderTrustFeature: true,
      folderTrust: false,
      isWorkspaceTrusted: true,
      expectedFolderTrust: false,
      expectedIsTrustedFolder: true,
      description:
        'feature enabled, folderTrust false, workspace trusted -> behave as trusted',
    },
    {
      folderTrustFeature: true,
      folderTrust: false,
      isWorkspaceTrusted: false,
      expectedFolderTrust: false,
      expectedIsTrustedFolder: true,
      description:
        'feature enabled, folderTrust false, workspace not trusted -> behave as trusted',
    },
  ];

  for (const {
    folderTrustFeature,
    folderTrust,
    isWorkspaceTrusted: isWorkspaceTrustedValue,
    expectedFolderTrust,
    expectedIsTrustedFolder,
    description,
  } of testCases) {
    it(`should correctly set folderTrust and isTrustedFolder when ${description}`, async () => {
      (isWorkspaceTrusted as Mock).mockImplementation((settings: Settings) => {
        const folderTrustFeature =
          settings.security?.folderTrust?.featureEnabled ?? false;
        const folderTrustSetting =
          settings.security?.folderTrust?.enabled ?? true;
        const folderTrustEnabled = folderTrustFeature && folderTrustSetting;

        if (!folderTrustEnabled) {
          return true;
        }
        return isWorkspaceTrustedValue; // This is the part that comes from the test case
      });
      const argv = await parseArguments({} as Settings);
      const settings: Settings = {
        security: {
          folderTrust: {
            featureEnabled: folderTrustFeature,
            enabled: folderTrust,
          },
        },
      };
      const config = await loadCliConfig(settings, [], 'test-session', argv);

      expect(config.getFolderTrust()).toBe(expectedFolderTrust);
      expect(config.isTrustedFolder()).toBe(expectedIsTrustedFolder);
    });
  }
});
