/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

const mockPlatform = vi.hoisted(() => vi.fn<() => NodeJS.Platform>());
const mockSpawn = vi.hoisted(() => vi.fn());
const mockSpawnSync = vi.hoisted(() => vi.fn());

vi.mock('node:os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof import('node:os')>();
  return {
    ...actualOs,
    default: {
      ...actualOs,
      platform: mockPlatform,
    },
    platform: mockPlatform,
  };
});

vi.mock('node:child_process', () => ({
  spawn: mockSpawn,
  spawnSync: mockSpawnSync,
}));

import {
  CommandParseCache,
  getActiveCommandParseCache,
  runWithCommandParseCache,
} from './shell-parse-cache.js';
import {
  getCommandName,
  getCommandRootAsync,
  getCommandRoots,
  getCommandRootsAsync,
  hasRedirection,
  hasRedirectionAsync,
  initializeShellParsers,
  isInteractiveGeminiCommand,
  isInteractiveGeminiCommandAsync,
  isKnownInteractiveGeminiCommandSync,
  parseCommandDetails,
  parseCommandDetailsAsync,
  splitCommands,
  splitCommandsAsync,
} from './shell-utils.js';
import {
  isBuildOrTestCommandAsync,
  isRemoteContentCommandAsync,
} from './untrustedContextTracker.js';

interface FakeChildOptions {
  stdout?: string;
  stderr?: string;
  exitCode?: number | null;
  emitError?: Error;
  delayMs?: number;
  signal?: AbortSignal;
}

function createFakeChildProcess(options: FakeChildOptions) {
  const emitter = new EventEmitter();
  const stdoutStream = new PassThrough();
  const stderrStream = new PassThrough();
  const proc = Object.assign(emitter, {
    stdout: stdoutStream,
    stderr: stderrStream,
    pid: 4242,
    kill: () => true,
  });

  const delay = options.delayMs ?? 5;
  const timer = setTimeout(() => {
    if (options.emitError) {
      emitter.emit('error', options.emitError);
      return;
    }
    if (options.stderr) {
      stderrStream.write(options.stderr);
    }
    stderrStream.end();
    if (options.stdout !== undefined) {
      stdoutStream.write(options.stdout);
    }
    stdoutStream.end();
    emitter.emit('close', options.exitCode ?? 0);
  }, delay);

  if (options.signal) {
    const onAbort = () => {
      clearTimeout(timer);
      const abortErr = new Error('The operation was aborted');
      abortErr.name = 'AbortError';
      emitter.emit('error', abortErr);
    };
    if (options.signal.aborted) {
      queueMicrotask(onAbort);
    } else {
      options.signal.addEventListener('abort', onAbort, { once: true });
    }
  }

  return proc;
}

describe('CommandParseCache and async PowerShell parsing (#30249)', () => {
  beforeAll(async () => {
    mockPlatform.mockReturnValue('linux');
    await initializeShellParsers();
  });

  beforeEach(() => {
    mockPlatform.mockReturnValue('win32');
    vi.stubEnv(
      'ComSpec',
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    );
    mockSpawn.mockReset();
    mockSpawnSync.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('CommandParseCache scoping', () => {
    it('isolates independent scopes while sharing nested runWithCommandParseCache scopes', () => {
      expect(getActiveCommandParseCache()).toBeUndefined();

      let firstScopeCache: CommandParseCache | undefined;
      runWithCommandParseCache((outerCache) => {
        firstScopeCache = outerCache;
        expect(getActiveCommandParseCache()).toBe(outerCache);
        outerCache.setCompleted('powershell.exe', 'Get-ChildItem', {
          details: [
            { name: 'Get-ChildItem', text: 'Get-ChildItem', startIndex: 0 },
          ],
          hasError: false,
        });

        runWithCommandParseCache((innerCache) => {
          expect(innerCache).toBe(outerCache);
          expect(
            innerCache.getCompleted('powershell.exe', 'Get-ChildItem'),
          ).toBeDefined();
        });
      });

      expect(getActiveCommandParseCache()).toBeUndefined();

      runWithCommandParseCache((secondScopeCache) => {
        expect(secondScopeCache).not.toBe(firstScopeCache);
        expect(
          secondScopeCache.getCompleted('powershell.exe', 'Get-ChildItem'),
        ).toBeUndefined();
      });
    });

    it('separates entries by executable and exact command string', () => {
      const cache = new CommandParseCache();
      cache.setCompleted('pwsh.exe', 'Get-Date', {
        details: [{ name: 'Get-Date', text: 'Get-Date', startIndex: 0 }],
        hasError: false,
      });

      expect(cache.getCompleted('pwsh.exe', 'Get-Date')).toBeDefined();
      expect(cache.getCompleted('powershell.exe', 'Get-Date')).toBeUndefined();
      expect(cache.getCompleted('pwsh.exe', 'Get-Date ')).toBeUndefined();
    });
  });

  describe('Async PowerShell AST parsing and cache reuse', () => {
    it('parses pipelines via async spawn without calling spawnSync and reuses cached results across sync and async helpers', async () => {
      const cmd =
        'Get-ChildItem | Sort-Object LastWriteTime -Descending | Select-Object -First 5 Name';
      mockSpawn.mockImplementation(() =>
        createFakeChildProcess({
          stdout: JSON.stringify({
            success: true,
            commands: [
              {
                name: 'Get-ChildItem',
                text: 'Get-ChildItem',
                startIndex: 0,
                args: [],
              },
              {
                name: 'Sort-Object',
                text: 'Sort-Object LastWriteTime -Descending',
                startIndex: 16,
                args: ['LastWriteTime', '-Descending'],
              },
              {
                name: 'Select-Object',
                text: 'Select-Object -First 5 Name',
                startIndex: 56,
                args: ['-First', '5', 'Name'],
              },
            ],
            hasRedirection: false,
            hasCommandSubstitution: false,
          }),
        }),
      );

      await runWithCommandParseCache(async () => {
        const parsed = await parseCommandDetailsAsync(cmd);
        expect(parsed).toEqual({
          details: [
            {
              name: 'Get-ChildItem',
              text: 'Get-ChildItem',
              startIndex: 0,
              args: [],
            },
            {
              name: 'Sort-Object',
              text: 'Sort-Object LastWriteTime -Descending',
              startIndex: 16,
              args: ['LastWriteTime', '-Descending'],
            },
            {
              name: 'Select-Object',
              text: 'Select-Object -First 5 Name',
              startIndex: 56,
              args: ['-First', '5', 'Name'],
            },
          ],
          hasError: false,
          hasRedirection: false,
          hasCommandSubstitution: false,
        });

        // Subsequent async and sync helpers inside the same scope reuse the cached parse
        expect(await getCommandRootAsync(cmd)).toBe('Get-ChildItem');
        expect(await getCommandRootsAsync(cmd)).toEqual([
          'Get-ChildItem',
          'Sort-Object',
          'Select-Object',
        ]);
        expect(await splitCommandsAsync(cmd)).toEqual([
          'Get-ChildItem',
          'Sort-Object LastWriteTime -Descending',
          'Select-Object -First 5 Name',
        ]);
        expect(getCommandRoots(cmd)).toEqual([
          'Get-ChildItem',
          'Sort-Object',
          'Select-Object',
        ]);
        expect(splitCommands(cmd)).toEqual([
          'Get-ChildItem',
          'Sort-Object LastWriteTime -Descending',
          'Select-Object -First 5 Name',
        ]);
        expect(parseCommandDetails(cmd)?.details).toHaveLength(3);
        expect(isInteractiveGeminiCommand(cmd)).toBe(false);
        expect(await isInteractiveGeminiCommandAsync(cmd)).toBe(false);
        expect(await isBuildOrTestCommandAsync(cmd)).toBe(false);
        expect(await isRemoteContentCommandAsync(cmd)).toBe(false);
      });

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockSpawnSync).not.toHaveBeenCalled();
      expect(mockSpawn).toHaveBeenCalledWith(
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
        expect.arrayContaining([
          '-NoLogo',
          '-NoProfile',
          '-NonInteractive',
          '-EncodedCommand',
        ]),
        expect.objectContaining({
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      );
    });

    it('deduplicates concurrent in-flight async parses within the same cache scope', async () => {
      const cmd = 'Write-Output "a -> b"';
      mockSpawn.mockImplementation(() =>
        createFakeChildProcess({
          delayMs: 30,
          stdout: JSON.stringify({
            success: true,
            commands: {
              name: 'Write-Output',
              text: 'Write-Output "a -> b"',
              startIndex: 0,
              args: ['"a -> b"'],
            },
            hasRedirection: false,
            hasCommandSubstitution: false,
          }),
        }),
      );

      await runWithCommandParseCache(async () => {
        const [details, roots, redirected] = await Promise.all([
          parseCommandDetailsAsync(cmd),
          getCommandRootsAsync(cmd),
          hasRedirectionAsync(cmd),
        ]);

        expect(details?.hasError).toBe(false);
        expect(roots).toEqual(['Write-Output']);
        expect(redirected).toBe(false);
        expect(hasRedirection(cmd)).toBe(false);
      });

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('handles empty input without spawning PowerShell', async () => {
      const result = await parseCommandDetailsAsync('   ');
      expect(result).toEqual({ details: [], hasError: true });
      expect(await getCommandRootsAsync('')).toEqual([]);
      expect(await hasRedirectionAsync('Get-ChildItem')).toBe(false);
      expect(mockSpawn).not.toHaveBeenCalled();
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('falls back to Bash parser for simple commands when PowerShell spawn errors or exits non-zero', async () => {
      mockSpawn.mockImplementationOnce(() =>
        createFakeChildProcess({
          emitError: new Error('ENOENT'),
        }),
      );

      const fromSpawnError = await getCommandRootsAsync('git status && npm ci');
      expect(fromSpawnError).toEqual(['git', 'npm']);

      mockSpawn.mockImplementationOnce(() =>
        createFakeChildProcess({
          exitCode: 1,
          stderr: 'ConstrainedLanguage error',
        }),
      );

      const fromNonZero = await splitCommandsAsync('echo hello | cat');
      expect(fromNonZero).toEqual(['echo hello', 'cat']);
    });

    it('never falls back to Bash parser when PowerShell command substitution is detected', async () => {
      mockSpawn.mockImplementation(() =>
        createFakeChildProcess({
          stdout: JSON.stringify({ success: false }),
        }),
      );

      const subExprResult = await parseCommandDetailsAsync(
        'Write-Output @(Get-Process)',
      );
      expect(subExprResult).toEqual({ details: [], hasError: true });

      const bareParenResult = await parseCommandDetailsAsync(
        'Write-Output (whoami)',
      );
      expect(bareParenResult).toEqual({ details: [], hasError: true });
    });

    it('falls back to regex redirection detection when PowerShell parsing fails', async () => {
      mockSpawn.mockImplementation(() =>
        createFakeChildProcess({
          stdout: 'not-valid-json',
        }),
      );

      expect(await hasRedirectionAsync('Write-Output "a -> b"')).toBe(true);
    });

    it('detects interactive gemini commands and remote/build commands asynchronously', async () => {
      mockSpawn.mockImplementation(
        (_exe: string, _args: string[], opts?: { env?: NodeJS.ProcessEnv }) => {
          const cmd = opts?.env?.['__GCLI_POWERSHELL_COMMAND__'] ?? '';
          const parts = cmd.split(';').map((s, idx) => ({
            name: s.trim().split(/\s+/)[0] ?? '',
            text: s.trim(),
            startIndex: idx * 10,
          }));
          return createFakeChildProcess({
            stdout: JSON.stringify({
              success: true,
              commands: parts,
              hasRedirection: false,
            }),
          });
        },
      );

      expect(
        await isInteractiveGeminiCommandAsync(
          'powershell.exe -NoProfile -Command "echo ok; gemini config list"',
        ),
      ).toBe(true);
      expect(await isInteractiveGeminiCommandAsync('gemini mcp list')).toBe(
        false,
      );
      expect(await isBuildOrTestCommandAsync('npm test')).toBe(true);
      expect(
        await isRemoteContentCommandAsync('curl https://example.com'),
      ).toBe(true);
      expect(
        await getCommandName('powershell.exe', ['-Command', 'git status']),
      ).toBe('git');
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('caches failed PowerShell parses (null) within a scope so subsequent sync helpers do not invoke spawnSync', async () => {
      const cmd = 'git status && echo "a -> b"';
      mockSpawn.mockImplementation(() =>
        createFakeChildProcess({
          exitCode: 1,
          stderr: 'Policy error',
        }),
      );

      await runWithCommandParseCache(async (cache) => {
        expect(await getCommandRootsAsync(cmd)).toEqual(['git', 'echo']);
        expect(
          cache.hasCompleted(
            'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
            cmd,
          ),
        ).toBe(true);
        expect(
          cache.getCompleted(
            'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
            cmd,
          ),
        ).toBeNull();

        // Subsequent sync and async calls inside the same scope reuse cached null
        // and fall back in-process without calling spawnSync or re-spawning.
        expect(getCommandRoots(cmd)).toEqual(['git', 'echo']);
        expect(hasRedirection(cmd)).toBe(true);
        expect(parseCommandDetails(cmd)?.details.map((d) => d.name)).toEqual([
          'git',
          'echo',
        ]);
        expect(await hasRedirectionAsync(cmd)).toBe(true);
      });

      expect(mockSpawn).toHaveBeenCalledTimes(1);
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('coalesces concurrent in-flight async parses across separate scopes without retaining process-wide state after completion', async () => {
      const cmd = 'Get-ChildItem > out.txt';
      mockSpawn.mockImplementation(() =>
        createFakeChildProcess({
          delayMs: 30,
          stdout: JSON.stringify({
            success: true,
            commands: {
              name: 'Get-ChildItem',
              text: 'Get-ChildItem > out.txt',
              startIndex: 0,
              args: [],
            },
            hasRedirection: true,
            hasCommandSubstitution: false,
          }),
        }),
      );

      // Simulate Scheduler (inside CommandParseCache) and UI hook (outside cache)
      // requesting the exact same command parse concurrently.
      const [schedulerParsed, uiRedirected] = await Promise.all([
        runWithCommandParseCache(() => parseCommandDetailsAsync(cmd)),
        hasRedirectionAsync(cmd),
      ]);

      expect(schedulerParsed?.hasRedirection).toBe(true);
      expect(uiRedirected).toBe(true);
      expect(mockSpawn).toHaveBeenCalledTimes(1);

      // Once settled, global in-flight map is empty, so a later parse in a new
      // scope spawns fresh rather than reading stale process-wide state.
      await runWithCommandParseCache(() => parseCommandDetailsAsync(cmd));
      expect(mockSpawn).toHaveBeenCalledTimes(2);
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('short-circuits non-gemini and obvious interactive gemini commands without spawning and disambiguates ambiguous commands asynchronously', async () => {
      expect(isKnownInteractiveGeminiCommandSync('dir')).toBe(false);
      expect(isKnownInteractiveGeminiCommandSync('Get-ChildItem')).toBe(false);
      expect(isInteractiveGeminiCommand('Get-ChildItem')).toBe(false);
      expect(await isInteractiveGeminiCommandAsync('Get-ChildItem')).toBe(
        false,
      );
      expect(
        isKnownInteractiveGeminiCommandSync(
          'gemini config set default-model gemini-2.5 -y',
        ),
      ).toBe(true);
      expect(
        isInteractiveGeminiCommand(
          'powershell.exe -NoProfile -Command "echo ok; gemini"',
        ),
      ).toBe(true);
      expect(mockSpawn).not.toHaveBeenCalled();
      expect(mockSpawnSync).not.toHaveBeenCalled();

      // Ambiguous commands containing g..e..m..i..n..i return undefined from sync fast check
      expect(
        isKnownInteractiveGeminiCommandSync('Get-Content GEMINI.md'),
      ).toBeUndefined();

      mockSpawn.mockImplementationOnce(() =>
        createFakeChildProcess({
          stdout: JSON.stringify({
            success: true,
            commands: [
              {
                name: 'Get-Content',
                text: 'Get-Content GEMINI.md',
                startIndex: 0,
                args: ['GEMINI.md'],
              },
            ],
            hasRedirection: false,
          }),
        }),
      );
      expect(
        await isInteractiveGeminiCommandAsync('Get-Content GEMINI.md'),
      ).toBe(false);

      mockSpawn.mockImplementationOnce(() =>
        createFakeChildProcess({
          stdout: JSON.stringify({
            success: true,
            commands: [
              {
                name: 'Get-Item',
                text: 'Get-Item foo',
                startIndex: 0,
                args: ['foo'],
              },
              {
                name: 'gemini',
                text: 'gemini',
                startIndex: 31,
                args: [],
              },
            ],
            hasRedirection: false,
          }),
        }),
      );
      expect(
        await isInteractiveGeminiCommandAsync(
          'Get-Item foo | ForEach-Object { gemini }',
        ),
      ).toBe(true);
      expect(mockSpawn).toHaveBeenCalledTimes(2);
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('propagates AbortSignal to spawn and avoids caching null when aborted', async () => {
      const cmd = 'Get-ChildItem > aborted.txt';
      const preAborted = new AbortController();
      preAborted.abort();

      await runWithCommandParseCache(async (cache) => {
        expect(
          await parseCommandDetailsAsync(cmd, cache, preAborted.signal),
        ).toBeNull();
        expect(await hasRedirectionAsync(cmd, cache, preAborted.signal)).toBe(
          false,
        );
        expect(mockSpawn).not.toHaveBeenCalled();
        expect(
          cache.hasCompleted(
            'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
            cmd,
          ),
        ).toBe(false);
      });

      const inFlightAbort = new AbortController();
      mockSpawn.mockImplementationOnce(
        (_exe: string, _args: string[], opts?: { signal?: AbortSignal }) =>
          createFakeChildProcess({
            delayMs: 100,
            signal: opts?.signal,
            stdout: JSON.stringify({ success: true, commands: [] }),
          }),
      );

      await runWithCommandParseCache(async (cache) => {
        const pending = parseCommandDetailsAsync(
          cmd,
          cache,
          inFlightAbort.signal,
        );
        inFlightAbort.abort();
        expect(await pending).toBeNull();
        expect(mockSpawn).toHaveBeenCalledTimes(1);
        expect(mockSpawn).toHaveBeenLastCalledWith(
          'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
          expect.any(Array),
          expect.objectContaining({ signal: inFlightAbort.signal }),
        );
        // Aborted parse must not poison the cache with null
        expect(
          cache.hasCompleted(
            'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
            cmd,
          ),
        ).toBe(false);

        // Subsequent un-aborted parse in the same cache succeeds cleanly
        mockSpawn.mockImplementationOnce(() =>
          createFakeChildProcess({
            stdout: JSON.stringify({
              success: true,
              commands: [
                {
                  name: 'Get-ChildItem',
                  text: cmd,
                  startIndex: 0,
                  args: [],
                },
              ],
              hasRedirection: true,
            }),
          }),
        );
        expect(await hasRedirectionAsync(cmd, cache)).toBe(true);
        expect(mockSpawn).toHaveBeenCalledTimes(2);
      });

      expect(mockSpawnSync).not.toHaveBeenCalled();
    });

    it('runs isKnownInteractiveGeminiCommandSync in linear time on adversarial non-matching input and handles multiline subsequences', () => {
      // Adversarial input that triggers O(N^5) backtracking on /g[\s\S]*e[\s\S]*m[\s\S]*i[\s\S]*n[\s\S]*i/i
      const adversarial =
        'g'.repeat(10_000) +
        'e'.repeat(10_000) +
        'm'.repeat(10_000) +
        'i'.repeat(10_000) +
        'n'.repeat(10_000);

      const start = performance.now();
      expect(isKnownInteractiveGeminiCommandSync(adversarial)).toBe(false);
      const elapsedMs = performance.now() - start;
      expect(elapsedMs).toBeLessThan(200);

      // Multiline subsequence (e.g. PowerShell backtick-newline continuation) must still be considered a candidate
      expect(
        isKnownInteractiveGeminiCommandSync(
          'Write-Output "g`\ne`\nm`\ni`\nn`\ni"',
        ),
      ).toBeUndefined();
      // Non-candidate multiline command returns false immediately
      expect(
        isKnownInteractiveGeminiCommandSync('Get-ChildItem\nSort-Object Name'),
      ).toBe(false);
      // Direct interactive invocation still returns true synchronously
      expect(isKnownInteractiveGeminiCommandSync('GEMINI config list')).toBe(
        true,
      );
      expect(mockSpawn).not.toHaveBeenCalled();
      expect(mockSpawnSync).not.toHaveBeenCalled();
    });
  });
});
