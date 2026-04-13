/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import {
  describe,
  it,
  expect,
  beforeAll,
  beforeEach,
  afterEach,
  afterAll,
} from 'vitest';
import { createSandboxManager } from './sandboxManagerFactory.js';
import { ShellExecutionService } from './shellExecutionService.js';
import { getSecureSanitizationConfig } from './environmentSanitization.js';
import {
  type SandboxManager,
  type SandboxedCommand,
  GOVERNANCE_FILES,
} from './sandboxManager.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

/**
 * Cross-platform command wrappers using Node.js inline scripts.
 * Ensures consistent execution behavior and reliable exit codes across
 * different host operating systems and restricted sandbox environments.
 */
const Platform = {
  isWindows: os.platform() === 'win32',
  isMac: os.platform() === 'darwin',

  /** Returns a command to create an empty file. */
  touch(filePath: string) {
    return {
      command: process.execPath,
      args: [
        '-e',
        `require("node:fs").writeFileSync(${JSON.stringify(filePath)}, "")`,
      ],
    };
  },

  /** Returns a command to read a file's content. */
  cat(filePath: string) {
    return {
      command: process.execPath,
      args: [
        '-e',
        `console.log(require("node:fs").readFileSync(${JSON.stringify(filePath)}, "utf8"))`,
      ],
    };
  },

  /** Returns a command to echo a string. */
  echo(text: string) {
    return {
      command: process.execPath,
      args: ['-e', `console.log(${JSON.stringify(text)})`],
    };
  },

  /** Returns a command to perform a network request. */
  curl(url: string) {
    return {
      command: process.execPath,
      args: [
        '-e',
        `require("node:http").get(${JSON.stringify(url)}, (res) => { res.on("data", (d) => process.stdout.write(d)); res.on("end", () => process.exit(0)); }).on("error", () => process.exit(1));`,
      ],
    };
  },

  /** Returns a command that checks if the current terminal is interactive. */
  isPty() {
    // ShellExecutionService.execute expects a raw shell string
    return `"${process.execPath}" -e "console.log(process.stdout.isTTY ? 'True' : 'False')"`;
  },

  /** Returns a path that is strictly outside the workspace and likely blocked. */
  getExternalBlockedPath() {
    return this.isWindows
      ? 'C:\\Windows\\System32\\drivers\\etc\\hosts'
      : '/Users/Shared/.gemini_test_blocked';
  },
};

async function runCommand(command: SandboxedCommand) {
  try {
    const { stdout, stderr } = await promisify(execFile)(
      command.program,
      command.args,
      {
        cwd: command.cwd,
        env: command.env,
        encoding: 'utf-8',
      },
    );
    return { status: 0, stdout, stderr };
  } catch (error: unknown) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
    return {
      status: err.code ?? 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? '',
    };
  }
}

/**
 * Asserts the result of a sandboxed command execution, and provides detailed
 * diagnostics on failure.
 */
function assertResult(
  result: { status: number; stdout: string; stderr: string },
  command: SandboxedCommand,
  expected: 'success' | 'failure',
) {
  const isSuccess = result.status === 0;
  const shouldBeSuccess = expected === 'success';

  if (isSuccess === shouldBeSuccess) {
    if (shouldBeSuccess) {
      expect(result.status).toBe(0);
    } else {
      expect(result.status).not.toBe(0);
    }
    return;
  }

  const commandLine = `${command.program} ${command.args.join(' ')}`;
  const message = `Command ${
    shouldBeSuccess ? 'failed' : 'succeeded'
  } unexpectedly.
Command: ${commandLine}
CWD: ${command.cwd || 'N/A'}
Status: ${result.status} (expected ${expected})${
    result.stdout ? `\nStdout: ${result.stdout.trim()}` : ''
  }${result.stderr ? `\nStderr: ${result.stderr.trim()}` : ''}`;

  throw new Error(message);
}

describe('SandboxManager Integration', () => {
  let tempDirectories: string[] = [];

  /**
   * Creates a temporary directory and tracks it for automatic cleanup after each test.
   * - macOS: Created in process.cwd() to avoid the seatbelt profile's global os.tmpdir() whitelist.
   * - Win/Linux: Created in os.tmpdir() because enforcing sandbox restrictions inside a large directory can be very slow.
   */
  function createTempDir(prefix = 'gemini-sandbox-test-'): string {
    const baseDir = Platform.isMac
      ? path.join(process.cwd(), `.${prefix}`)
      : path.join(os.tmpdir(), prefix);

    const dir = fs.mkdtempSync(baseDir);
    tempDirectories.push(dir);
    return dir;
  }

  let workspace: string;
  let manager: SandboxManager;

  beforeEach(() => {
    tempDirectories = [];
    // Create a fresh, isolated workspace for every test to prevent state
    // leakage from causing intermittent or order-dependent test failures.
    workspace = createTempDir('workspace-');
    manager = createSandboxManager({ enabled: true }, { workspace });
  });

  afterEach(() => {
    for (const dir of tempDirectories) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort cleanup
      }
    }
    tempDirectories = [];
  });

  describe('Execution & Environment', () => {
    describe('Basic Execution', () => {
      it('allows workspace execution', async () => {
        const { command, args } = Platform.echo('sandbox test');
        const sandboxed = await manager.prepareCommand({
          command,
          args,
          cwd: workspace,
          env: process.env,
        });

        const result = await runCommand(sandboxed);
        assertResult(result, sandboxed, 'success');
        expect(result.stdout.trim()).toBe('sandbox test');
      });

      // The Windows sandbox wrapper (GeminiSandbox.exe) uses standard pipes
      // for I/O interception, which breaks ConPTY pseudo-terminal inheritance.
      it.skipIf(Platform.isWindows)(
        'supports interactive terminals',
        async () => {
          const handle = await ShellExecutionService.execute(
            Platform.isPty(),
            workspace,
            () => {},
            new AbortController().signal,
            true,
            {
              sanitizationConfig: getSecureSanitizationConfig(),
              sandboxManager: manager,
            },
          );

          const result = await handle.result;
          expect(result.exitCode).toBe(0);
          expect(result.output).toContain('True');
        },
      );
    });

    describe('Virtual Commands', () => {
      it('handles virtual read commands', async () => {
        const testFile = path.join(workspace, 'read-virtual.txt');
        fs.writeFileSync(testFile, 'virtual read success');

        const sandboxed = await manager.prepareCommand({
          command: '__read',
          args: [testFile],
          cwd: workspace,
          env: process.env,
        });

        const result = await runCommand(sandboxed);
        assertResult(result, sandboxed, 'success');
        expect(result.stdout.trim()).toBe('virtual read success');
      });

      it('handles virtual write commands', async () => {
        const testFile = path.join(workspace, 'write-virtual.txt');

        const sandboxed = await manager.prepareCommand({
          command: '__write',
          args: [testFile],
          cwd: workspace,
          env: process.env,
        });

        // Executing __write directly via runCommand hangs because 'cat' waits for stdin.
        // Instead, we verify the command was translated correctly.
        if (Platform.isWindows) {
          // On Windows, the native helper handles '__write'
          expect(sandboxed.args.includes('__write')).toBe(true);
        } else {
          // On macOS/Linux, it is translated to a shell command with 'tee -- "$@" > /dev/null'
          expect(sandboxed.args.join(' ')).toContain('tee --');
        }
      });
    });

    describe('Environment Sanitization', () => {
      it('scrubs sensitive environment variables', async () => {
        const checkEnvCmd = {
          command: process.execPath,
          args: [
            '-e',
            'console.log(process.env.TEST_SECRET_TOKEN || "MISSING")',
          ],
        };

        const sandboxed = await manager.prepareCommand({
          ...checkEnvCmd,
          cwd: workspace,
          env: { ...process.env, TEST_SECRET_TOKEN: 'super-secret-value' },
          policy: {
            sanitizationConfig: {
              enableEnvironmentVariableRedaction: true,
              blockedEnvironmentVariables: ['TEST_SECRET_TOKEN'],
            },
          },
        });

        const result = await runCommand(sandboxed);
        assertResult(result, sandboxed, 'success');
        // By default, environment sanitization drops non-allowlisted vars or vars that look like secrets.
        // Assuming TEST_SECRET_TOKEN is scrubbed:
        expect(result.stdout.trim()).toBe('MISSING');
      });
    });
  });

  describe('Sandbox Policies & Modes', () => {
    describe('Plan Mode Transitions', () => {
      it('allows writing plans in plan mode', async () => {
        // In Plan Mode, modeConfig sets readonly: true, allowOverrides: true
        const planManager = createSandboxManager(
          { enabled: true },
          { workspace, modeConfig: { readonly: true, allowOverrides: true } },
        );

        const plansDir = path.join(workspace, '.gemini/tmp/session-123/plans');
        fs.mkdirSync(plansDir, { recursive: true });
        const planFile = path.join(plansDir, 'feature-plan.md');

        // The WriteFile tool requests explicit write access for the plan file path
        const { command, args } = Platform.touch(planFile);

        const sandboxed = await planManager.prepareCommand({
          command,
          args,
          cwd: workspace,
          env: process.env,
          policy: { allowedPaths: [plansDir] },
        });

        const result = await runCommand(sandboxed);
        assertResult(result, sandboxed, 'success');
        expect(fs.existsSync(planFile)).toBe(true);
      });

      it('allows workspace writes after exiting plan mode', async () => {
        // Upon exiting Plan Mode, the sandbox transitions to autoEdit/accepting_edits
        // which sets readonly: false, allowOverrides: true
        const editManager = createSandboxManager(
          { enabled: true },
          { workspace, modeConfig: { readonly: false, allowOverrides: true } },
        );

        const taskFile = path.join(workspace, 'src/tasks/task.ts');
        const taskDir = path.dirname(taskFile);
        fs.mkdirSync(taskDir, { recursive: true });

        // Simulate a generic edit anywhere in the workspace
        const { command, args } = Platform.touch(taskFile);

        const sandboxed = await editManager.prepareCommand({
          command,
          args,
          cwd: workspace,
          env: process.env,
          policy: { allowedPaths: [taskDir] },
        });

        const result = await runCommand(sandboxed);
        assertResult(result, sandboxed, 'success');
        expect(fs.existsSync(taskFile)).toBe(true);
      });
    });

    describe('Workspace Write Policies', () => {
      it('enforces read-only mode', async () => {
        const testFile = path.join(workspace, 'readonly-test.txt');
        const { command, args } = Platform.touch(testFile);

        const readonlyManager = createSandboxManager(
          { enabled: true },
          {
            workspace,
            modeConfig: { readonly: true, allowOverrides: true },
          },
        );

        const sandboxed = await readonlyManager.prepareCommand({
          command,
          args,
          cwd: workspace,
          env: process.env,
        });

        const result = await runCommand(sandboxed);
        assertResult(result, sandboxed, 'failure');
      });

      it('allows writes for approved tools', async () => {
        const testFile = path.join(workspace, 'approved-test.txt');
        const command = Platform.isWindows ? 'cmd.exe' : 'sh';
        const args = Platform.isWindows
          ? ['/c', `echo test > ${testFile}`]
          : ['-c', `echo test > "${testFile}"`];

        // The shell wrapper is stripped by getCommandRoots, so the root command evaluated is 'echo'
        const approvedTool = 'echo';

        const approvedManager = createSandboxManager(
          { enabled: true },
          {
            workspace,
            modeConfig: {
              readonly: true,
              allowOverrides: true,
              approvedTools: [approvedTool],
            },
          },
        );

        const sandboxed = await approvedManager.prepareCommand({
          command,
          args,
          cwd: workspace,
          env: process.env,
        });

        const result = await runCommand(sandboxed);
        assertResult(result, sandboxed, 'success');
        expect(fs.existsSync(testFile)).toBe(true);
      });

      it('allows writes in YOLO mode', async () => {
        const testFile = path.join(workspace, 'yolo-test.txt');
        const { command, args } = Platform.touch(testFile);

        const yoloManager = createSandboxManager(
          { enabled: true },
          {
            workspace,
            modeConfig: { readonly: true, yolo: true, allowOverrides: true },
          },
        );

        const sandboxed = await yoloManager.prepareCommand({
          command,
          args,
          cwd: workspace,
          env: process.env,
        });

        const result = await runCommand(sandboxed);
        assertResult(result, sandboxed, 'success');
        expect(fs.existsSync(testFile)).toBe(true);
      });
    });
  });

  describe('File System Security', () => {
    describe('File System Access', () => {
      it('prevents out-of-bounds access', async () => {
        const blockedPath = Platform.getExternalBlockedPath();
        const { command, args } = Platform.touch(blockedPath);

        const sandboxed = await manager.prepareCommand({
          command,
          args,
          cwd: workspace,
          env: process.env,
        });

        const result = await runCommand(sandboxed);
        assertResult(result, sandboxed, 'failure');
      });

      it('supports dynamic permission expansion', async () => {
        const tempDir = createTempDir('expansion-');
        const testFile = path.join(tempDir, 'test.txt');
        const { command, args } = Platform.touch(testFile);

        // First attempt: fails due to sandbox restrictions
        const sandboxed1 = await manager.prepareCommand({
          command,
          args,
          cwd: workspace,
          env: process.env,
        });
        const result1 = await runCommand(sandboxed1);
        assertResult(result1, sandboxed1, 'failure');
        expect(fs.existsSync(testFile)).toBe(false);

        // Second attempt: succeeds with additional permissions
        const sandboxed2 = await manager.prepareCommand({
          command,
          args,
          cwd: workspace,
          env: process.env,
          policy: { allowedPaths: [tempDir] },
        });
        const result2 = await runCommand(sandboxed2);
        assertResult(result2, sandboxed2, 'success');
        expect(fs.existsSync(testFile)).toBe(true);
      });

      it('allows access to authorized paths', async () => {
        const allowedDir = createTempDir('allowed-');
        const testFile = path.join(allowedDir, 'test.txt');

        const { command, args } = Platform.touch(testFile);
        const sandboxed = await manager.prepareCommand({
          command,
          args,
          cwd: workspace,
          env: process.env,
          policy: { allowedPaths: [allowedDir] },
        });

        const result = await runCommand(sandboxed);
        assertResult(result, sandboxed, 'success');
        expect(fs.existsSync(testFile)).toBe(true);
      });

      it('protects forbidden paths from writes', async () => {
        const tempWorkspace = createTempDir('workspace-');
        const forbiddenDir = path.join(tempWorkspace, 'forbidden');
        const testFile = path.join(forbiddenDir, 'test.txt');
        fs.mkdirSync(forbiddenDir);

        const osManager = createSandboxManager(
          { enabled: true },
          {
            workspace: tempWorkspace,
            forbiddenPaths: async () => [forbiddenDir],
          },
        );
        const { command, args } = Platform.touch(testFile);

        const sandboxed = await osManager.prepareCommand({
          command,
          args,
          cwd: tempWorkspace,
          env: process.env,
        });

        const result = await runCommand(sandboxed);
        assertResult(result, sandboxed, 'failure');
      });

      // Windows icacls does not reliably block read-up access for Low Integrity
      // processes, so we skip read-specific assertions on Windows. The internal
      // tool architecture prevents read bypasses via the C# wrapper and __read.
      it.skipIf(Platform.isWindows)(
        'protects forbidden paths from reads',
        async () => {
          const tempWorkspace = createTempDir('workspace-');
          const forbiddenDir = path.join(tempWorkspace, 'forbidden');
          const testFile = path.join(forbiddenDir, 'test.txt');
          fs.mkdirSync(forbiddenDir);
          fs.writeFileSync(testFile, 'secret data');

          const osManager = createSandboxManager(
            { enabled: true },
            {
              workspace: tempWorkspace,
              forbiddenPaths: async () => [forbiddenDir],
            },
          );

          const { command, args } = Platform.cat(testFile);

          const sandboxed = await osManager.prepareCommand({
            command,
            args,
            cwd: tempWorkspace,
            env: process.env,
          });

          const result = await runCommand(sandboxed);
          assertResult(result, sandboxed, 'failure');
        },
      );

      it('protects forbidden directories recursively', async () => {
        const tempWorkspace = createTempDir('workspace-');
        const forbiddenDir = path.join(tempWorkspace, 'forbidden');
        const nestedDir = path.join(forbiddenDir, 'nested');
        const nestedFile = path.join(nestedDir, 'test.txt');

        // Create the base forbidden directory first so the manager can restrict access to it.
        fs.mkdirSync(forbiddenDir);

        const osManager = createSandboxManager(
          { enabled: true },
          {
            workspace: tempWorkspace,
            forbiddenPaths: async () => [forbiddenDir],
          },
        );

        // Execute a dummy command so the manager initializes its restrictions.
        const dummyCommand = await osManager.prepareCommand({
          ...Platform.echo('init'),
          cwd: tempWorkspace,
          env: process.env,
        });
        await runCommand(dummyCommand);

        // Now create the nested items. They will inherit the sandbox restrictions from their parent.
        fs.mkdirSync(nestedDir, { recursive: true });
        fs.writeFileSync(nestedFile, 'secret');

        const { command, args } = Platform.touch(nestedFile);

        const sandboxed = await osManager.prepareCommand({
          command,
          args,
          cwd: tempWorkspace,
          env: process.env,
        });

        const result = await runCommand(sandboxed);
        assertResult(result, sandboxed, 'failure');
      });

      it('prioritizes denials over allowances', async () => {
        const tempWorkspace = createTempDir('workspace-');
        const conflictDir = path.join(tempWorkspace, 'conflict');
        const testFile = path.join(conflictDir, 'test.txt');
        fs.mkdirSync(conflictDir);

        const osManager = createSandboxManager(
          { enabled: true },
          {
            workspace: tempWorkspace,
            forbiddenPaths: async () => [conflictDir],
          },
        );
        const { command, args } = Platform.touch(testFile);

        const sandboxed = await osManager.prepareCommand({
          command,
          args,
          cwd: tempWorkspace,
          env: process.env,
          policy: {
            allowedPaths: [conflictDir],
          },
        });

        const result = await runCommand(sandboxed);
        assertResult(result, sandboxed, 'failure');
      });

      it('handles missing paths gracefully', async () => {
        const tempWorkspace = createTempDir('workspace-');
        const nonExistentPath = path.join(tempWorkspace, 'does-not-exist');

        const osManager = createSandboxManager(
          { enabled: true },
          {
            workspace: tempWorkspace,
            forbiddenPaths: async () => [nonExistentPath],
          },
        );
        const { command, args } = Platform.echo('survived');
        const sandboxed = await osManager.prepareCommand({
          command,
          args,
          cwd: tempWorkspace,
          env: process.env,
          policy: {
            allowedPaths: [nonExistentPath],
          },
        });

        const result = await runCommand(sandboxed);
        assertResult(result, sandboxed, 'success');
        expect(result.stdout.trim()).toBe('survived');
      });

      it('prevents creation of forbidden files', async () => {
        const tempWorkspace = createTempDir('workspace-');
        const nonExistentFile = path.join(tempWorkspace, 'never-created.txt');

        const osManager = createSandboxManager(
          { enabled: true },
          {
            workspace: tempWorkspace,
            forbiddenPaths: async () => [nonExistentFile],
          },
        );

        // We use touch to attempt creation of the file
        const { command: cmdTouch, args: argsTouch } =
          Platform.touch(nonExistentFile);

        const sandboxedCmd = await osManager.prepareCommand({
          command: cmdTouch,
          args: argsTouch,
          cwd: tempWorkspace,
          env: process.env,
        });

        // Execute the command, we expect it to fail (permission denied or read-only file system)
        const result = await runCommand(sandboxedCmd);

        assertResult(result, sandboxedCmd, 'failure');
        expect(fs.existsSync(nonExistentFile)).toBe(false);
      });

      it('restricts symlinks to forbidden targets', async () => {
        const tempWorkspace = createTempDir('workspace-');
        const targetFile = path.join(tempWorkspace, 'target.txt');
        const symlinkFile = path.join(tempWorkspace, 'link.txt');

        fs.writeFileSync(targetFile, 'secret data');
        fs.symlinkSync(targetFile, symlinkFile);

        const osManager = createSandboxManager(
          { enabled: true },
          {
            workspace: tempWorkspace,
            forbiddenPaths: async () => [symlinkFile],
          },
        );

        // Attempt to write to the target file directly
        const { command: cmdTarget, args: argsTarget } =
          Platform.touch(targetFile);
        const commandTarget = await osManager.prepareCommand({
          command: cmdTarget,
          args: argsTarget,
          cwd: tempWorkspace,
          env: process.env,
        });

        const resultTarget = await runCommand(commandTarget);
        assertResult(resultTarget, commandTarget, 'failure');

        // Attempt to write via the symlink
        const { command: cmdLink, args: argsLink } =
          Platform.touch(symlinkFile);
        const commandLink = await osManager.prepareCommand({
          command: cmdLink,
          args: argsLink,
          cwd: tempWorkspace,
          env: process.env,
        });

        const resultLink = await runCommand(commandLink);
        assertResult(resultLink, commandLink, 'failure');
      });
    });

    describe('Governance Files', () => {
      it('prevents modification of governance files', async () => {
        // Ensure workspace is initialized and governance files are created
        const { command: echoCmd, args: echoArgs } = Platform.echo('test');
        await manager.prepareCommand({
          command: echoCmd,
          args: echoArgs,
          cwd: workspace,
          env: process.env,
          // Even if the entire workspace is explicitly allowed, governance files must be protected
          policy: { allowedPaths: [workspace] },
        });

        for (const file of GOVERNANCE_FILES) {
          const filePath = path.join(workspace, file.path);
          // Try to append to/overwrite the file or create a file inside the directory
          const { command, args } = file.isDirectory
            ? Platform.touch(path.join(filePath, 'evil.txt'))
            : Platform.touch(filePath);

          const sandboxed = await manager.prepareCommand({
            command,
            args,
            cwd: workspace,
            env: process.env,
          });

          const result = await runCommand(sandboxed);
          assertResult(result, sandboxed, 'failure');
        }
      });
    });

    describe('Git Worktree Support', () => {
      it('supports git worktrees', async () => {
        const mainRepo = createTempDir('main-repo-');
        const worktreeDir = createTempDir('worktree-');

        const mainGitDir = path.join(mainRepo, '.git');
        fs.mkdirSync(mainGitDir, { recursive: true });
        fs.writeFileSync(
          path.join(mainGitDir, 'config'),
          '[core]\n\trepositoryformatversion = 0\n',
        );

        const worktreeGitDir = path.join(
          mainGitDir,
          'worktrees',
          'test-worktree',
        );
        fs.mkdirSync(worktreeGitDir, { recursive: true });

        // Create the .git file in the worktree directory pointing to the worktree git dir
        fs.writeFileSync(
          path.join(worktreeDir, '.git'),
          `gitdir: ${worktreeGitDir}\n`,
        );

        // Create the backlink from worktree git dir to the worktree's .git file
        const backlinkPath = path.join(worktreeGitDir, 'gitdir');
        fs.writeFileSync(backlinkPath, path.join(worktreeDir, '.git'));

        // Create a file in the worktree git dir that we want to access
        const secretFile = path.join(worktreeGitDir, 'secret.txt');
        fs.writeFileSync(secretFile, 'git-secret');

        const osManager = createSandboxManager(
          { enabled: true },
          { workspace: worktreeDir },
        );

        const { command, args } = Platform.cat(secretFile);
        const sandboxed = await osManager.prepareCommand({
          command,
          args,
          cwd: worktreeDir,
          env: process.env,
        });

        const result = await runCommand(sandboxed);
        assertResult(result, sandboxed, 'success');
        expect(result.stdout.trim()).toBe('git-secret');
      });

      it('protects git worktree metadata', async () => {
        const mainRepo = createTempDir('main-repo-');
        const worktreeDir = createTempDir('worktree-');

        const mainGitDir = path.join(mainRepo, '.git');
        fs.mkdirSync(mainGitDir, { recursive: true });

        const worktreeGitDir = path.join(
          mainGitDir,
          'worktrees',
          'test-worktree',
        );
        fs.mkdirSync(worktreeGitDir, { recursive: true });

        fs.writeFileSync(
          path.join(worktreeDir, '.git'),
          `gitdir: ${worktreeGitDir}\n`,
        );
        fs.writeFileSync(
          path.join(worktreeGitDir, 'gitdir'),
          path.join(worktreeDir, '.git'),
        );

        const targetFile = path.join(worktreeGitDir, 'secret.txt');

        const osManager = createSandboxManager(
          { enabled: true },
          // Use YOLO mode to ensure the workspace is fully writable, but git worktrees should still be read-only
          { workspace: worktreeDir, modeConfig: { yolo: true } },
        );

        const { command, args } = Platform.touch(targetFile);
        const sandboxed = await osManager.prepareCommand({
          command,
          args,
          cwd: worktreeDir,
          env: process.env,
        });

        const result = await runCommand(sandboxed);
        assertResult(result, sandboxed, 'failure');
        expect(fs.existsSync(targetFile)).toBe(false);
      });
    });
  });

  describe('Network Security', () => {
    describe('Network Access', () => {
      let server: http.Server;
      let url: string;

      beforeAll(async () => {
        server = http.createServer((_, res) => {
          res.setHeader('Connection', 'close');
          res.writeHead(200);
          res.end('ok');
        });
        await new Promise<void>((resolve, reject) => {
          server.on('error', reject);
          server.listen(0, '127.0.0.1', () => {
            const addr = server.address() as import('net').AddressInfo;
            url = `http://127.0.0.1:${addr.port}`;
            resolve();
          });
        });
      });

      afterAll(async () => {
        if (server) await new Promise<void>((res) => server.close(() => res()));
      });

      // Windows Job Object rate limits exempt loopback (127.0.0.1) traffic,
      // so this test cannot verify loopback blocking on Windows.
      it.skipIf(Platform.isWindows)(
        'prevents unauthorized network access',
        async () => {
          const { command, args } = Platform.curl(url);
          const sandboxed = await manager.prepareCommand({
            command,
            args,
            cwd: workspace,
            env: process.env,
          });

          const result = await runCommand(sandboxed);
          assertResult(result, sandboxed, 'failure');
        },
      );

      it('allows authorized network access', async () => {
        const { command, args } = Platform.curl(url);
        const sandboxed = await manager.prepareCommand({
          command,
          args,
          cwd: workspace,
          env: process.env,
          policy: { networkAccess: true },
        });

        const result = await runCommand(sandboxed);
        assertResult(result, sandboxed, 'success');
        if (!Platform.isWindows) {
          expect(result.stdout.trim()).toBe('ok');
        }
      });
    });
  });
});
