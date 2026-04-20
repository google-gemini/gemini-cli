/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Windows compatibility utilities for the Gemini CLI.
 *
 * This module provides cross-platform helpers that address Windows-specific
 * issues including path handling, process management, shell detection,
 * terminal rendering, and file system operations.
 */

import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

/** True when running on Windows (any version). */
export const IS_WINDOWS = process.platform === 'win32';

/**
 * Returns the Windows build number, or 0 on non-Windows platforms.
 * Windows 11 starts at build 22000.
 */
export function getWindowsBuildNumber(): number {
  if (!IS_WINDOWS) return 0;
  const parts = os.release().split('.');
  return parts.length >= 3 ? parseInt(parts[2], 10) || 0 : 0;
}

/** True when the host is Windows 11 (build >= 22000). */
export function isWindows11(): boolean {
  return IS_WINDOWS && getWindowsBuildNumber() >= 22000;
}

/** True when the process runs inside Windows Terminal. */
export function isWindowsTerminal(): boolean {
  return IS_WINDOWS && Boolean(process.env['WT_SESSION']);
}

/** True when running inside legacy conhost (not Windows Terminal). */
export function isLegacyConHost(): boolean {
  return IS_WINDOWS && !isWindowsTerminal();
}

/**
 * Detect the active Windows shell type from environment hints.
 *
 * Inspects `ComSpec`, `PSModulePath`, and the `SHELL` environment variable
 * (set by Git Bash / MSYS2) to determine whether the user is likely running
 * PowerShell, cmd.exe, or a Bash-compatible shell.
 */
export type WindowsShellKind = 'powershell' | 'cmd' | 'bash' | 'unknown';

export function detectWindowsShell(): WindowsShellKind {
  if (!IS_WINDOWS) return 'unknown';

  // Git Bash / MSYS2 sets SHELL
  const shellEnv = process.env['SHELL'];
  if (shellEnv && /bash/i.test(shellEnv)) {
    return 'bash';
  }

  // PowerShell sets PSModulePath in its environment
  if (process.env['PSModulePath']) {
    return 'powershell';
  }

  const comSpec = (process.env['ComSpec'] ?? '').toLowerCase();
  if (comSpec.endsWith('powershell.exe') || comSpec.endsWith('pwsh.exe')) {
    return 'powershell';
  }
  if (comSpec.endsWith('cmd.exe')) {
    return 'cmd';
  }

  return 'unknown';
}

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

/**
 * Normalizes a file path for the current platform.
 *
 * - Converts forward slashes to back-slashes on Windows.
 * - On POSIX, returns the path unchanged.
 * - Always resolves to an absolute path.
 */
export function normalizePlatformPath(p: string): string {
  return path.resolve(p);
}

/**
 * Checks whether `child` is contained within `parent`, handling
 * case-insensitivity on Windows.
 */
export function isPathWithin(parent: string, child: string): boolean {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);

  const parentNorm = IS_WINDOWS ? resolvedParent.toLowerCase() : resolvedParent;
  const childNorm = IS_WINDOWS ? resolvedChild.toLowerCase() : resolvedChild;

  if (childNorm === parentNorm) return true;
  return childNorm.startsWith(parentNorm + path.sep);
}

/**
 * Converts a path to use forward slashes, which is useful for display purposes
 * or when constructing URLs/globs on Windows.
 */
export function toForwardSlashes(p: string): string {
  return p.replace(/\\/g, '/');
}

/**
 * Returns `os.tmpdir()` as a fully resolved path. This should always be used
 * instead of hard-coding `/tmp` which does not exist on Windows.
 */
export function getTempDir(): string {
  return path.resolve(os.tmpdir());
}

/**
 * Windows has a historical MAX_PATH limit of 260 characters.
 * Modern Windows (10 1607+) can opt into long path support via the registry
 * or a manifest flag, but many tools still break on paths near this limit.
 *
 * Returns true when the given path exceeds the safe threshold.
 */
export const WIN_MAX_PATH = 260;

export function isLongPath(p: string): boolean {
  if (!IS_WINDOWS) return false;
  return path.resolve(p).length >= WIN_MAX_PATH;
}

/**
 * Applies the `\\?\` long-path prefix on Windows when needed.
 * On POSIX platforms the path is returned unchanged.
 */
export function toLongPath(p: string): string {
  if (!IS_WINDOWS) return p;
  const resolved = path.resolve(p);
  if (resolved.startsWith('\\\\?\\')) return resolved;
  if (resolved.length >= WIN_MAX_PATH) {
    return '\\\\?\\' + resolved;
  }
  return resolved;
}

// ---------------------------------------------------------------------------
// File system helpers
// ---------------------------------------------------------------------------

/**
 * Retries an async file-system operation when it fails with EBUSY, EPERM, or
 * EACCES, which are common on Windows due to antivirus scanners, search
 * indexers, or lingering file locks.
 *
 * @param fn     The async operation to attempt.
 * @param opts   Retry behaviour configuration.
 */
export async function retryOnLock<T>(
  fn: () => Promise<T>,
  opts: { retries?: number; delayMs?: number } = {},
): Promise<T> {
  const { retries = 3, delayMs = 100 } = opts;
  const retryableCodes = new Set(['EBUSY', 'EPERM', 'EACCES']);

  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const code =
        err instanceof Error ? (err as NodeJS.ErrnoException).code : undefined;
      if (code && retryableCodes.has(code) && attempt < retries) {
        await new Promise((r) => setTimeout(r, delayMs * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Sets restrictive file permissions portably.
 *
 * - On POSIX: calls `fs.chmod(filePath, 0o600)`.
 * - On Windows: `chmod` is largely a no-op, so we use `icacls` to remove
 *   inheritance and grant access only to the current user.
 *   Falls back silently if `icacls` is not available.
 */
export async function setOwnerOnlyPermissions(filePath: string): Promise<void> {
  if (!IS_WINDOWS) {
    await fs.chmod(filePath, 0o600);
    return;
  }

  try {
    const username = process.env['USERNAME'] ?? os.userInfo().username;
    // Remove inherited permissions and grant Full Control only to current user
    spawnSync(
      'icacls',
      [filePath, '/inheritance:r', '/grant:r', `${username}:(F)`],
      {
        windowsHide: true,
        timeout: 5000,
      },
    );
  } catch {
    // Best-effort: if icacls fails we fall back to the Node chmod which at
    // least marks the read-only bit appropriately.
    try {
      await fs.chmod(filePath, 0o600);
    } catch {
      // Ignore
    }
  }
}

// ---------------------------------------------------------------------------
// Process / shell helpers
// ---------------------------------------------------------------------------

/**
 * Kills a process tree on Windows using `taskkill /f /t`.
 * On non-Windows platforms, falls back to `process.kill(-pid, signal)`.
 *
 * @param pid    The root process ID.
 * @param signal Signal to send on POSIX (ignored on Windows).
 */
export function killProcessTree(
  pid: number,
  signal: NodeJS.Signals = 'SIGTERM',
): void {
  if (IS_WINDOWS) {
    try {
      spawnSync('taskkill', ['/pid', pid.toString(), '/f', '/t'], {
        windowsHide: true,
        timeout: 5000,
      });
    } catch {
      // Ignore errors for already-dead processes
    }
  } else {
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        process.kill(pid, signal);
      } catch {
        // Ignore
      }
    }
  }
}

/**
 * Returns the correct executable name for `npx` on the current platform.
 * On Windows, `npx` must be invoked as `npx.cmd` to work with `spawn`.
 */
export function npxCommand(): string {
  return IS_WINDOWS ? 'npx.cmd' : 'npx';
}

/**
 * Returns the correct executable name for `npm` on the current platform.
 */
export function npmCommand(): string {
  return IS_WINDOWS ? 'npm.cmd' : 'npm';
}

// ---------------------------------------------------------------------------
// Terminal / ANSI helpers
// ---------------------------------------------------------------------------

/**
 * Detects whether the current Windows terminal supports VT (ANSI) escape
 * sequences. Windows Terminal and modern ConHost (Win10 1511+) support VT,
 * but very old console hosts do not.
 */
export function supportsAnsiEscapes(): boolean {
  if (!IS_WINDOWS) return true;

  // Windows Terminal always supports ANSI
  if (isWindowsTerminal()) return true;

  // ConHost on Win10 1511+ (build 10586) supports ANSI
  if (getWindowsBuildNumber() >= 10586) return true;

  return false;
}

/**
 * Wraps ANSI codes so they are only emitted when the terminal supports them.
 * On terminals without VT support the codes are stripped.
 */
export function safeAnsi(code: string): string {
  return supportsAnsiEscapes() ? code : '';
}

/**
 * Returns the appropriate newline sequence. Git and many Unix tools
 * always produce `\n`, but some Windows tools expect `\r\n`.
 */
export function platformEol(): string {
  return IS_WINDOWS ? '\r\n' : '\n';
}

// ---------------------------------------------------------------------------
// Environment variable helpers
// ---------------------------------------------------------------------------

/**
 * Looks up an environment variable by name, handling the case-insensitive
 * nature of environment variables on Windows.
 *
 * On POSIX, environment variables are case-sensitive, so an exact match is
 * required.
 */
export function getEnvVar(name: string): string | undefined {
  if (!IS_WINDOWS) {
    return process.env[name];
  }

  // On Windows, env vars are case-insensitive
  const upperName = name.toUpperCase();
  for (const key of Object.keys(process.env)) {
    if (key.toUpperCase() === upperName) {
      return process.env[key];
    }
  }
  return undefined;
}

/**
 * Expands Windows-style `%VAR%` environment variable references.
 * On POSIX platforms, returns the string unchanged.
 */
export function expandWindowsEnvVars(str: string): string {
  if (!IS_WINDOWS) return str;
  return str.replace(
    /%(\w+)%/g,
    (_match, name: string) => getEnvVar(name) ?? '',
  );
}
