/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  parsePosixSandboxDenials,
  createSandboxDenialCache,
} from './sandboxDenialUtils.js';
import type { ShellExecutionResult } from '../../services/shellExecutionService.js';
import { LocalSandboxManager } from '../../services/sandboxManager.js';
import { FatalSandboxError } from '../../utils/errors.js';

describe('parsePosixSandboxDenials', () => {
  it('should detect file system denial and extract paths', () => {
    const parsed = parsePosixSandboxDenials({
      output: 'ls: /root: Operation not permitted',
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeDefined();
    expect(parsed?.filePaths).toContain('/root');
  });

  it('should detect network denial', () => {
    const parsed = parsePosixSandboxDenials({
      output: 'curl: (6) Could not resolve host: google.com',
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeDefined();
    expect(parsed?.network).toBe(true);
  });

  it('should use fallback heuristic for absolute paths', () => {
    const parsed = parsePosixSandboxDenials({
      output:
        'operation not permitted\nsome error happened with /some/path/to/file',
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeDefined();
    expect(parsed?.filePaths).toContain('/some/path/to/file');
  });

  it('should return undefined if no denial detected', () => {
    const parsed = parsePosixSandboxDenials({
      output: 'hello world',
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeUndefined();
  });

  it('should detect npm specific file system denials', () => {
    const output = `
npm verbose logfile could not be created: Error: EPERM: operation not permitted, open '/Users/galzahavi/.npm/_logs/2026-04-01T02_47_18_624Z-debug-0.log'
    `;
    const parsed = parsePosixSandboxDenials({
      output,
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeDefined();
    expect(parsed?.filePaths).toContain(
      '/Users/galzahavi/.npm/_logs/2026-04-01T02_47_18_624Z-debug-0.log',
    );
  });

  it('should detect npm specific path errors', () => {
    const output = `
npm error code EPERM
npm error syscall open
npm error path /Users/galzahavi/.npm/_cacache/tmp/ccf579a2
    `;
    const parsed = parsePosixSandboxDenials({
      output,
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeDefined();
    expect(parsed?.filePaths).toContain(
      '/Users/galzahavi/.npm/_cacache/tmp/ccf579a2',
    );
  });

  it('should detect network denials with ENOTFOUND', () => {
    const output = `
npm http fetch GET https://registry.npmjs.org/2 attempt 1 failed with ENOTFOUND
    `;
    const parsed = parsePosixSandboxDenials({
      output,
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeDefined();
    expect(parsed?.network).toBe(true);
  });

  it('should detect non-verbose npm path errors', () => {
    const output = `
npm ERR! code EPERM
npm ERR! syscall open
npm ERR! path /Users/galzahavi/.npm/_cacache/tmp/ccf579a2
    `;
    const parsed = parsePosixSandboxDenials({
      output,
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeDefined();
    expect(parsed?.filePaths).toContain(
      '/Users/galzahavi/.npm/_cacache/tmp/ccf579a2',
    );
  });

  it('should detect pnpm specific network errors', () => {
    const output = `
ERR_PNPM_FETCH_404 GET https://registry.npmjs.org/nonexistent: Not Found
    `;
    const parsed = parsePosixSandboxDenials({
      output,
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeDefined();
    expect(parsed?.network).toBe(true);
  });

  it('should detect pnpm specific file system errors', () => {
    const output = `
EACCES: permission denied, mkdir '/Users/galzahavi/.pnpm-store/v3'
    `;
    const parsed = parsePosixSandboxDenials({
      output,
    } as unknown as ShellExecutionResult);
    expect(parsed).toBeDefined();
    expect(parsed?.filePaths).toContain('/Users/galzahavi/.pnpm-store/v3');
  });

  it('should detect Python PermissionError and extract path accurately', () => {
    const output = `Caught exception: [Errno 13] Permission denied: '/etc/test_sandbox_denial'
Traceback (most recent call last):
  File "/usr/local/google/home/davidapierce/gemini-cli/repro_sandbox.py", line 9, in <module>
    raise e
  File "/usr/local/google/home/davidapierce/gemini-cli/repro_sandbox.py", line 5, in <module>
    with open('/etc/test_sandbox_denial', 'w') as f:
         ~~~~^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
PermissionError: [Errno 13] Permission denied: '/etc/test_sandbox_denial'`;

    const parsed = parsePosixSandboxDenials({
      output,
      exitCode: 1,
      error: null,
    } as unknown as ShellExecutionResult);

    expect(parsed?.filePaths).toEqual(['/etc/test_sandbox_denial']);
  });

  it('should detect new keywords like "access denied" and "forbidden"', () => {
    const parsed1 = parsePosixSandboxDenials({
      output: 'Access denied to /var/log/syslog',
      exitCode: 1,
      error: null,
    } as unknown as ShellExecutionResult);
    expect(parsed1?.filePaths).toContain('/var/log/syslog');

    const parsed2 = parsePosixSandboxDenials({
      output: 'Forbidden: access to /root/secret is not allowed',
      exitCode: 1,
      error: null,
    } as unknown as ShellExecutionResult);
    expect(parsed2?.filePaths).toContain('/root/secret');
  });

  it('should detect read-only file system error', () => {
    const parsed = parsePosixSandboxDenials({
      output: 'rm: cannot remove /mnt/usb/test: Read-only file system',
      exitCode: 1,
      error: null,
    } as unknown as ShellExecutionResult);
    expect(parsed?.filePaths).toContain('/mnt/usb/test');
  });

  it('should reject paths with directory traversal', () => {
    const output = 'ls: /etc/shadow/../../etc/passwd: Operation not permitted';
    const parsed = parsePosixSandboxDenials({
      output,
    } as unknown as ShellExecutionResult);
    expect(parsed?.filePaths || []).not.toContain(
      '/etc/shadow/../../etc/passwd',
    );
  });

  it('should reject home-relative paths with directory traversal', () => {
    const output = "Operation not permitted, open '~/../../etc/shadow'";
    const parsed = parsePosixSandboxDenials({
      output,
    } as unknown as ShellExecutionResult);
    expect(parsed?.filePaths || []).not.toContain('~/../../etc/shadow');
  });

  it('should reject paths with null bytes', () => {
    const output = "Operation not permitted, open '/etc/passwd\0/foo'";
    const parsed = parsePosixSandboxDenials({
      output,
    } as unknown as ShellExecutionResult);
    expect(parsed?.filePaths || []).not.toContain('/etc/passwd\0/foo');
  });

  it('should reject paths with internal tildes', () => {
    const output = "Operation not permitted, open '/home/user/~/config'";
    const parsed = parsePosixSandboxDenials({
      output,
    } as unknown as ShellExecutionResult);
    expect(parsed?.filePaths || []).not.toContain('/home/user/~/config');
  });

  it('should suppress redundant denials if cache is provided', () => {
    const cache = createSandboxDenialCache();
    const result = {
      output: 'ls: /root: Operation not permitted',
    } as unknown as ShellExecutionResult;

    // First call: should process
    const parsed1 = parsePosixSandboxDenials(result, cache);
    expect(parsed1).toBeDefined();

    // Second call: should be suppressed
    const parsed2 = parsePosixSandboxDenials(result, cache);
    expect(parsed2).toBeUndefined();
  });

  it('should not suppress denials if no cache is provided', () => {
    const result = {
      output: 'ls: /root: Operation not permitted',
    } as unknown as ShellExecutionResult;

    const parsed1 = parsePosixSandboxDenials(result);
    expect(parsed1).toBeDefined();

    const parsed2 = parsePosixSandboxDenials(result);
    expect(parsed2).toBeDefined();
  });

  describe('regression tests for linux & container permission errors (issue #29338)', () => {
    it('should detect mkdir permission denied errors and extract paths', () => {
      const output =
        "mkdir: cannot create directory '/tmp/protected_dir': Permission denied";
      const parsed = parsePosixSandboxDenials({
        output,
      } as unknown as ShellExecutionResult);
      expect(parsed).toBeDefined();
      expect(parsed?.filePaths).toContain('/tmp/protected_dir');
    });

    it('should detect touch permission denied errors and extract paths', () => {
      const output = "touch: cannot touch '/var/log/app.log': Permission denied";
      const parsed = parsePosixSandboxDenials({
        output,
      } as unknown as ShellExecutionResult);
      expect(parsed).toBeDefined();
      expect(parsed?.filePaths).toContain('/var/log/app.log');
    });

    it('should detect chmod operation not permitted and extract paths', () => {
      const output =
        "chmod: changing permissions of '/etc/hosts': Operation not permitted";
      const parsed = parsePosixSandboxDenials({
        output,
      } as unknown as ShellExecutionResult);
      expect(parsed).toBeDefined();
      expect(parsed?.filePaths).toContain('/etc/hosts');
    });

    it('should detect EACCES scandir errors and extract paths', () => {
      const output =
        "Error: EACCES: permission denied, scandir '/root/protected_store'";
      const parsed = parsePosixSandboxDenials({
        output,
      } as unknown as ShellExecutionResult);
      expect(parsed).toBeDefined();
      expect(parsed?.filePaths).toContain('/root/protected_store');
    });

    it('should detect EACCES access errors and extract paths', () => {
      const output =
        "Error: EACCES: permission denied, access '/var/run/secrets'";
      const parsed = parsePosixSandboxDenials({
        output,
      } as unknown as ShellExecutionResult);
      expect(parsed).toBeDefined();
      expect(parsed?.filePaths).toContain('/var/run/secrets');
    });

    it('should detect Python OSError [Errno 13] permission denied and extract paths', () => {
      const output =
        "OSError: [Errno 13] Permission denied: '/home/user/app/script.py'";
      const parsed = parsePosixSandboxDenials({
        output,
      } as unknown as ShellExecutionResult);
      expect(parsed).toBeDefined();
      expect(parsed?.filePaths).toContain('/home/user/app/script.py');
    });

    it('should detect shell invocation permission denied and extract paths', () => {
      const output = 'bash: /opt/bin/daemon: Permission denied';
      const parsed = parsePosixSandboxDenials({
        output,
      } as unknown as ShellExecutionResult);
      expect(parsed).toBeDefined();
      expect(parsed?.filePaths).toContain('/opt/bin/daemon');
    });
  });
});

describe('LocalSandboxManager (unsupported environment)', () => {
  it('throws FatalSandboxError with exit code 44 for unsupported environments', async () => {
    const manager = new LocalSandboxManager();
    await expect(
      manager.prepareCommand({
        command: 'ls',
        args: [],
        cwd: '/tmp',
        env: {},
      }),
    ).rejects.toThrow(FatalSandboxError);

    try {
      await manager.prepareCommand({
        command: 'ls',
        args: [],
        cwd: '/tmp',
        env: {},
      });
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(FatalSandboxError);
      expect((err as FatalSandboxError).exitCode).toBe(44);
      expect((err as FatalSandboxError).message).toContain(
        'Tool sandboxing is not supported',
      );
    }
  });
});
