/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import { constants, type Stats } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { spawnSync } from 'node:child_process';
import { LRUCache } from 'mnemonist';
import { spawnAsync } from './shell-utils.js';
import { stripExtendedLengthPrefix } from './paths.js';

export interface SecurityCheckResult {
  secure: boolean;
  reason?: string;
}

export type PathSecurityCache = LRUCache<string, SecurityCheckResult>;

/**
 * Creates an isolated LRU cache for path security check results.
 */
export function createPathSecurityCache(maxSize = 1000): PathSecurityCache {
  return new LRUCache<string, SecurityCheckResult>(maxSize);
}

/**
 * Backwards-compatibility helper for test isolation.
 */
export function clearSecurityCacheForTesting(): void {
  // No-op: caches are instance- or session-scoped rather than module-level globals.
}

/**
 * SecurityValidator provides instance-scoped security validation with an isolated cache.
 */
export class SecurityValidator {
  private readonly cache: PathSecurityCache;

  constructor(cache?: PathSecurityCache) {
    this.cache = cache ?? createPathSecurityCache();
  }

  clearCache(): void {
    this.cache.clear();
  }

  getCache(): PathSecurityCache {
    return this.cache;
  }

  isPathSecureSync(
    targetPath: string,
    expectedType?: 'file' | 'directory',
  ): SecurityCheckResult {
    return isPathSecureSync(targetPath, expectedType, this.cache);
  }

  isFileAndDirectorySecureSync(filePath: string): SecurityCheckResult {
    return isFileAndDirectorySecureSync(filePath, this.cache);
  }
}

function getWindowsPowerShellPath(): string {
  let systemRoot =
    process.env['SystemRoot'] ||
    process.env['systemroot'] ||
    process.env['windir'] ||
    process.env['WINDIR'] ||
    'C:\\Windows';

  // Securely validate systemRoot to prevent UNC path injection or path traversal
  if (!/^[a-zA-Z]:\\/.test(systemRoot)) {
    systemRoot = 'C:\\Windows';
  }

  const pathModule = os.platform() === 'win32' ? path.win32 : path.posix;
  return pathModule.join(
    systemRoot,
    'System32',
    'WindowsPowerShell',
    'v1.0',
    'powershell.exe',
  );
}

function buildWindowsAclScript(paths: string[]): string {
  const pathsArray = paths.map((p) => `'${p}'`).join(', ');
  return `
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8;
    $paths = @(${pathsArray});
    foreach ($path in $paths) {
      Write-Output "PATH:$path";
      $acl = $null;
      try {
        $acl = Get-Acl -LiteralPath $path;
      } catch {
        Write-Output "ERROR:$($_.Exception.Message)";
        continue;
      }

      $owner = $acl.Owner;
      $ownerSid = '';
      try {
        $ownerSid = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value;
      } catch {}

      $isTrustedOwner = (
        ($owner -like '*\\Administrators' -or $owner -eq 'Administrators') -or
        ($owner -like '*\\SYSTEM' -or $owner -eq 'SYSTEM') -or
        ($owner -like '*\\TrustedInstaller' -or $owner -eq 'TrustedInstaller') -or
        ($owner -like '*\\CREATOR OWNER' -or $owner -eq 'CREATOR OWNER') -or
        ($owner -like '*\\CREATOR GROUP' -or $owner -eq 'CREATOR GROUP') -or
        $ownerSid -eq 'S-1-5-32-544' -or
        $ownerSid -eq 'S-1-5-18' -or
        $ownerSid -like 'S-1-5-80-*' -or
        $ownerSid -eq 'S-1-3-0' -or
        $ownerSid -eq 'S-1-3-1'
      );

      if (-not $isTrustedOwner) {
        Write-Output "OWNER:$owner";
      }

      $rules = $acl.Access | Where-Object { 
          $_.AccessControlType -eq 'Allow' -and 
          ($_.FileSystemRights -match 'Write|Modify|FullControl|CreateFiles|AppendData|CreateDirectories|Delete|TakeOwnership|ChangePermissions')
      };
      $insecureIdentity = $rules | Where-Object {
          $rule = $_;
          $isTrustedWriter = $false;
          try {
              $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value;
              $isTrustedWriter = (
                  $sid -eq 'S-1-5-32-544' -or
                  $sid -eq 'S-1-5-18' -or
                  $sid -like 'S-1-5-80-*' -or
                  $sid -eq 'S-1-3-0' -or
                  $sid -eq 'S-1-3-1'
              );
          } catch {
              $id = $rule.IdentityReference.Value;
              $isTrustedWriter = (
                  ($id -like '*\\Administrators' -or $id -eq 'Administrators') -or
                  ($id -like '*\\SYSTEM' -or $id -eq 'SYSTEM') -or
                  ($id -like '*\\TrustedInstaller' -or $id -eq 'TrustedInstaller') -or
                  ($id -like '*\\CREATOR OWNER' -or $id -eq 'CREATOR OWNER') -or
                  ($id -like '*\\CREATOR GROUP' -or $id -eq 'CREATOR GROUP')
              );
          }
          -not $isTrustedWriter;
      } | Select-Object -ExpandProperty IdentityReference;

      if ($insecureIdentity) {
        Write-Output "PERMS:$($insecureIdentity -join ', ')";
      }
    }
  `;
}

interface ParsedPathViolation {
  ownerViolation?: string;
  permsViolation?: string;
  error?: string;
}

function parseWindowsSecurityOutput(
  stdout: string,
  targetPath: string,
  isDirectory: boolean,
): SecurityCheckResult {
  const map = parseWindowsBatchSecurityOutput(stdout, [targetPath]);
  const parsed = map.get(targetPath) ?? {};
  return formatWindowsSecurityResult(parsed, targetPath, isDirectory);
}

function parseWindowsBatchSecurityOutput(
  stdout: string,
  targetPaths: string[],
): Map<string, ParsedPathViolation> {
  const results = new Map<string, ParsedPathViolation>();

  // Initialize all paths to a failed/error state by default (fail secure)
  for (const p of targetPaths) {
    results.set(p, { error: 'Security check output missing or incomplete' });
  }

  const trimmed = stdout.trim();
  if (!trimmed) {
    return results;
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let currentPath: string | undefined;
  let currentOwner: string | undefined;
  let currentPerms: string | undefined;
  let currentError: string | undefined;
  let hasPathMarker = false;

  const flush = () => {
    if (currentPath) {
      const matchedPath =
        targetPaths.find(
          (tp) => tp.toLowerCase() === currentPath!.toLowerCase(),
        ) ?? currentPath;
      results.set(matchedPath, {
        ownerViolation: currentOwner,
        permsViolation: currentPerms,
        error: currentError,
      });
    }
    currentOwner = undefined;
    currentPerms = undefined;
    currentError = undefined;
  };

  for (const line of lines) {
    if (line.startsWith('PATH:')) {
      hasPathMarker = true;
      flush();
      currentPath = line.substring(5).trim();
    } else if (line.startsWith('OWNER:')) {
      currentOwner = line.substring(6).trim();
    } else if (line.startsWith('PERMS:')) {
      currentPerms = line.substring(6).trim();
    } else if (line.startsWith('ERROR:')) {
      currentError = line.substring(6).trim();
    }
  }
  flush();

  // For backwards compatibility with legacy test mocks that don't output PATH:
  if (!hasPathMarker && targetPaths.length === 1) {
    let ownerViolation: string | undefined;
    let permsViolation: string | undefined;
    let error: string | undefined;
    let foundViolationOrError = false;
    for (const line of lines) {
      if (line.startsWith('OWNER:')) {
        ownerViolation = line.substring(6).trim();
        foundViolationOrError = true;
      } else if (line.startsWith('PERMS:')) {
        permsViolation = line.substring(6).trim();
        foundViolationOrError = true;
      } else if (line.startsWith('ERROR:')) {
        error = line.substring(6).trim();
        foundViolationOrError = true;
      }
    }
    if (foundViolationOrError) {
      results.set(targetPaths[0], { ownerViolation, permsViolation, error });
    }
  }

  return results;
}

function formatWindowsSecurityResult(
  parsed: ParsedPathViolation,
  targetPath: string,
  isDirectory: boolean,
): SecurityCheckResult {
  if (parsed.error) {
    return {
      secure: false,
      reason: `A security check for '${targetPath}' failed and could not be completed. Please file a bug report. Original error: ${parsed.error}`,
    };
  }

  const itemType = isDirectory ? 'Directory' : 'File';
  const reasons: string[] = [];

  if (parsed.ownerViolation !== undefined) {
    reasons.push(
      `${itemType} '${targetPath}' is not owned by a trusted administrator or SYSTEM account. Current owner: ${parsed.ownerViolation}.`,
    );
  }

  if (parsed.permsViolation !== undefined) {
    reasons.push(
      `${itemType} '${targetPath}' is insecure. The following user groups have write permissions: ${parsed.permsViolation}. To fix this, remove Write and Modify permissions for these groups from the directory's ACLs.`,
    );
  }

  if (reasons.length === 0) {
    return { secure: true };
  }

  return {
    secure: false,
    reason: reasons.join(' '),
  };
}

function batchCheckWindowsPathsSync(
  paths: string[],
  cache: PathSecurityCache,
): void {
  const uncached = paths.filter((p) => !cache.has(p));
  if (uncached.length === 0) return;

  try {
    const escapedPaths = uncached.map((p) => p.replace(/'/g, "''"));
    const script = buildWindowsAclScript(escapedPaths);
    const powershellPath = getWindowsPowerShellPath();

    const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
    const res = spawnSync(
      powershellPath,
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encodedScript,
      ],
      { encoding: 'utf-8', timeout: 5000 },
    );

    if (res.error) {
      if ((res.error as NodeJS.ErrnoException).code === 'ETIMEDOUT') {
        throw new Error(`Security validation timed out after 5000ms`);
      }
      throw res.error;
    }

    if (res.status !== 0) {
      throw new Error(
        `PowerShell execution failed with status ${res.status}: ${res.stderr || res.stdout}`,
      );
    }

    const batchResults = parseWindowsBatchSecurityOutput(
      res.stdout ?? '',
      uncached,
    );

    for (const p of uncached) {
      const parsed = batchResults.get(p) ?? {};
      let isDir = false;
      try {
        isDir = fsSync.statSync(p).isDirectory();
      } catch {
        // Leave isDir false if stat fails
      }
      const result = formatWindowsSecurityResult(parsed, p, isDir);
      cache.set(p, result);
    }
  } catch (error) {
    for (const p of uncached) {
      cache.set(p, {
        secure: false,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        reason: `A security check for '${p}' failed and could not be completed. Please file a bug report. Original error: ${(error as Error).message}`,
      });
    }
  }
}

function checkPosixStatsSecurity(
  stats: Stats,
  targetPath: string,
  isDirectory: boolean,
): SecurityCheckResult {
  const itemType = isDirectory ? 'Directory' : 'File';

  // Check ownership: must be root (uid 0)
  if (stats.uid !== 0) {
    return {
      secure: false,
      reason: `${itemType} '${targetPath}' is not owned by root (uid 0). Current uid: ${stats.uid}. To fix this, run: sudo chown root:root "${targetPath}"`,
    };
  }

  // Check permissions: not writable by group (S_IWGRP) or others (S_IWOTH)
  const S_IWGRP = constants?.S_IWGRP ?? 0o020;
  const S_IWOTH = constants?.S_IWOTH ?? 0o002;
  const mode = stats.mode;
  if ((mode & (S_IWGRP | S_IWOTH)) !== 0) {
    return {
      secure: false,
      reason: `${itemType} '${targetPath}' is writable by group or others (mode: ${mode.toString(
        8,
      )}). To fix this, run: sudo chmod g-w,o-w "${targetPath}"`,
    };
  }

  return { secure: true };
}

/**
 * Verifies if a directory is secure (owned by root/admins and not writable by unprivileged users).
 *
 * @param dirPath The path to the directory to check.
 * @returns A promise that resolves to a SecurityCheckResult.
 */
export async function isDirectorySecure(
  dirPath: string,
): Promise<SecurityCheckResult> {
  try {
    const stats = await fs.stat(dirPath);

    if (!stats.isDirectory()) {
      return { secure: false, reason: 'Not a directory' };
    }

    if (os.platform() === 'win32') {
      try {
        const escapedPath = dirPath.replace(/'/g, "''");
        const script = buildWindowsAclScript([escapedPath]);
        const powershellPath = getWindowsPowerShellPath();

        const encodedScript = Buffer.from(script, 'utf16le').toString('base64');
        const { stdout } = await spawnAsync(
          powershellPath,
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-EncodedCommand',
            encodedScript,
          ],
          { timeout: 5000 },
        );

        return parseWindowsSecurityOutput(stdout, dirPath, true);
      } catch (error) {
        return {
          secure: false,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          reason: `A security check for the system policy directory '${dirPath}' failed and could not be completed. Please file a bug report. Original error: ${(error as Error).message}`,
        };
      }
    }

    // POSIX checks:
    try {
      const lstats = await fs.lstat(dirPath);
      if (lstats.isSymbolicLink() && lstats.uid !== 0) {
        return {
          secure: false,
          reason: `Symlink '${dirPath}' is not owned by root (uid 0). Current uid: ${lstats.uid}. To fix this, run: sudo chown -h root:root "${dirPath}"`,
        };
      }
    } catch {
      // Ignore lstat failure if stat succeeded
    }

    return checkPosixStatsSecurity(stats, dirPath, true);
  } catch (error) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { secure: true };
    }
    return {
      secure: false,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      reason: `Failed to access directory: ${(error as Error).message}`,
    };
  }
}

/**
 * Resolves and normalizes a path for security checks across Windows and POSIX.
 * On Windows, strips extended-length prefixes (\\?\ and \\?\UNC\) and converts to lowercase
 * to prevent security bypasses and ensure PowerShell Get-Acl compatibility.
 *
 * @param targetPath The path to normalize.
 * @returns The normalized path.
 */
export function normalizeSecurityPath(targetPath: string): string {
  const isWin = os.platform() === 'win32';
  const pathModule = isWin ? path.win32 : path.posix;
  const stripped = isWin ? stripExtendedLengthPrefix(targetPath) : targetPath;
  let resolved = pathModule.resolve(stripped);
  if (isWin) {
    resolved = stripExtendedLengthPrefix(resolved).toLowerCase();
  }
  return resolved;
}

/**
 * Synchronously verifies if a file or directory is secure.
 *
 * @param targetPath The path to check.
 * @param expectedType Optional constraint ('file' or 'directory').
 * @returns A SecurityCheckResult.
 */
export function isPathSecureSync(
  targetPath: string,
  expectedType?: 'file' | 'directory',
  cache?: PathSecurityCache,
): SecurityCheckResult {
  const normalizedPath = normalizeSecurityPath(targetPath);

  try {
    let stats: Stats;
    try {
      stats = fsSync.statSync(normalizedPath);
    } catch (error) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { secure: true };
      }
      const result = {
        secure: false,
        // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
        reason: `Failed to access path: ${(error as Error).message}`,
      };
      cache?.set(normalizedPath, result);
      return result;
    }

    const isDir = stats.isDirectory();
    if (expectedType === 'directory' && !isDir) {
      return { secure: false, reason: 'Not a directory' };
    }
    if (expectedType === 'file' && !stats.isFile()) {
      return { secure: false, reason: 'Not a file' };
    }

    if (cache?.has(normalizedPath)) {
      return cache.get(normalizedPath)!;
    }

    if (os.platform() === 'win32') {
      const effectiveCache = cache ?? createPathSecurityCache(1);
      batchCheckWindowsPathsSync([normalizedPath], effectiveCache);
      const winResult = effectiveCache.get(normalizedPath);
      if (winResult) {
        cache?.set(normalizedPath, winResult);
        return winResult;
      }
      return {
        secure: false,
        reason:
          'Security validation failed on Windows for path ' + normalizedPath,
      };
    }

    // POSIX checks:
    // If it's a symlink, verify that the symlink itself is owned by root (uid === 0).
    // Note: On POSIX systems, symlinks always have mode 0777 in lstat, and permission bits
    // are ignored during path resolution, so we only check uid for the symlink itself.
    try {
      const lstats = fsSync.lstatSync(normalizedPath);
      if (lstats.isSymbolicLink()) {
        if (lstats.uid !== 0) {
          const lstatCheck: SecurityCheckResult = {
            secure: false,
            reason: `Symlink '${normalizedPath}' is not owned by root (uid 0). Current uid: ${lstats.uid}. To fix this, run: sudo chown -h root:root "${normalizedPath}"`,
          };
          cache?.set(normalizedPath, lstatCheck);
          return lstatCheck;
        }
      }
    } catch {
      // Ignore lstat failure if stat succeeded
    }

    const posixCheck = checkPosixStatsSecurity(stats, normalizedPath, isDir);
    cache?.set(normalizedPath, posixCheck);
    return posixCheck;
  } catch (error) {
    return {
      secure: false,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      reason: `Failed to access path: ${(error as Error).message}`,
    };
  }
}

/**
 * Synchronously checks that a configuration file AND all its parent/ancestor directories are secure.
 * If the file does not exist, it is considered safe since nothing is loaded.
 *
 * @param filePath The file path to validate.
 * @param cache Optional cache for session or instance isolation.
 * @returns A SecurityCheckResult.
 */
export function isFileAndDirectorySecureSync(
  filePath: string,
  cache?: PathSecurityCache,
): SecurityCheckResult {
  const isWin = os.platform() === 'win32';
  const pathModule = isWin ? path.win32 : path.posix;
  const normalizedFilePath = normalizeSecurityPath(filePath);

  // If the file does not exist, nothing will be loaded, so it is safe.
  // If existsSync throws an error, fail closed (secure = false) to prevent security bypasses.
  try {
    if (!fsSync.existsSync(normalizedFilePath)) {
      return { secure: true };
    }
  } catch (error) {
    return {
      secure: false,
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
      reason: `Failed to verify existence of path: ${(error as Error).message}`,
    };
  }

  const effectiveCache = cache ?? createPathSecurityCache(50);
  const parentDir = pathModule.dirname(normalizedFilePath);

  // Resolve symbolic links to canonical real path first to prevent parent/grandparent symlink bypasses
  let canonicalFilePath = normalizedFilePath;
  try {
    const real = fsSync.realpathSync(normalizedFilePath);
    if (typeof real === 'string' && real.length > 0) {
      canonicalFilePath = normalizeSecurityPath(real);
    }
  } catch {
    // If realpathSync fails, keep normalizedFilePath
  }

  const canonicalParentDir = pathModule.dirname(canonicalFilePath);
  const pathsEqual = canonicalFilePath === normalizedFilePath;

  const getAncestors = (dir: string): string[] => {
    const ancestors: string[] = [];
    let current = dir;
    while (true) {
      const next = pathModule.dirname(current);
      const isRoot = next === current;
      if (!(isWin && isRoot)) {
        ancestors.push(current);
      }
      if (isRoot || !next || next === '.') {
        break;
      }
      current = next;
    }
    return ancestors;
  };

  const normalizedAncestors = getAncestors(parentDir);
  const canonicalAncestors = !pathsEqual
    ? getAncestors(canonicalParentDir)
    : [];

  // On Windows, batch all uncached paths into a single PowerShell check
  if (isWin) {
    const pathsToCheck = [normalizedFilePath, ...normalizedAncestors];
    if (!pathsEqual) {
      pathsToCheck.push(...canonicalAncestors, canonicalFilePath);
    }
    const uniquePaths = Array.from(new Set(pathsToCheck));
    const uncached = uniquePaths.filter((p) => !effectiveCache.has(p));
    if (uncached.length > 0) {
      batchCheckWindowsPathsSync(uncached, effectiveCache);
    }
  }

  // 1. Verify that any parent/grandparent directories of normalizedFilePath that are symlinks are owned by root
  for (const dir of normalizedAncestors) {
    try {
      const lstat = fsSync.lstatSync(dir);
      if (lstat.isSymbolicLink()) {
        const symlinkCheck = isPathSecureSync(dir, 'directory', effectiveCache);
        if (!symlinkCheck.secure) {
          return {
            secure: false,
            reason: `Parent directory symlink '${dir}' is insecure: ${symlinkCheck.reason}`,
          };
        }
      }
    } catch {
      // If lstat fails, subsequent checks will handle it
    }
  }

  // 2. Check the immediate parent directory and all its ancestors up to the root
  for (const ancestor of normalizedAncestors) {
    const parentCheck = isPathSecureSync(ancestor, 'directory', effectiveCache);
    if (!parentCheck.secure) {
      return {
        secure: false,
        reason: `Parent directory '${ancestor}' is insecure: ${parentCheck.reason}`,
      };
    }
  }

  // 3. Check the file itself
  const fileCheck = isPathSecureSync(
    normalizedFilePath,
    'file',
    effectiveCache,
  );
  if (!fileCheck.secure) {
    return {
      secure: false,
      reason: `File is insecure: ${fileCheck.reason}`,
    };
  }

  // 4. If the canonical path differs (symlink in leaf or parent), verify canonical target file and all ancestors up to root
  if (!pathsEqual) {
    const realFileCheck = isPathSecureSync(
      canonicalFilePath,
      'file',
      effectiveCache,
    );
    if (!realFileCheck.secure) {
      return {
        secure: false,
        reason: `Resolved target file is insecure: ${realFileCheck.reason}`,
      };
    }

    for (const canonicalAncestor of canonicalAncestors) {
      const realParentCheck = isPathSecureSync(
        canonicalAncestor,
        'directory',
        effectiveCache,
      );
      if (!realParentCheck.secure) {
        return {
          secure: false,
          reason: `Resolved target parent directory '${canonicalAncestor}' is insecure: ${realParentCheck.reason}`,
        };
      }
    }
  }

  return { secure: true };
}
