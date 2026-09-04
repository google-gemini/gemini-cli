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
import { spawnAsync } from './shell-utils.js';
import { isNodeError, getErrorMessage } from './errors.js';
import { createCache } from './cache.js';

export interface SecurityCheckResult {
  secure: boolean;
  reason?: string;
}

const securityCheckCache = createCache<string, SecurityCheckResult>({
  storage: 'map',
  defaultTtl: 10_000,
});

/**
 * Clears the path security cache. Used exclusively for test isolation.
 */
export function clearSecurityCheckCacheForTesting(): void {
  securityCheckCache.clear();
}

function buildPowerShellAclScript(): string {
  return `
    $path = $env:GEMINI_TARGET_PATH;
    $acl = Get-Acl -LiteralPath $path;

    $trustedSids = @('S-1-5-32-544', 'S-1-5-18', 'S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464');
    $trustedNames = @('administrators', 'builtin\\administrators', 'system', 'nt authority\\system', 'trustedinstaller', 'nt service\\trustedinstaller');

    # Check owner
    $ownerSid = '';
    try { $ownerSid = $acl.GetOwner([System.Security.Principal.SecurityIdentifier]).Value } catch {};
    $ownerName = $acl.Owner;
    $ownerIsTrusted = ($ownerSid -and ($trustedSids -contains $ownerSid)) -or
                      ($ownerName -and ($trustedNames -contains $ownerName.ToLower()));

    if (-not $ownerIsTrusted -and ($ownerName -or $ownerSid)) {
        Write-Output "InsecureOwner: $($ownerName)";
        exit 0;
    }

    $rules = $acl.Access | Where-Object { 
        $_.AccessControlType -eq 'Allow' -and 
        (($_.FileSystemRights -match 'Write') -or ($_.FileSystemRights -match 'Modify') -or ($_.FileSystemRights -match 'FullControl')) 
    };
    $insecureIdentity = $rules | Where-Object { 
        $_.IdentityReference.Value -match 'Users' -or $_.IdentityReference.Value -eq 'Everyone' 
    } | Select-Object -ExpandProperty IdentityReference;

    if (-not $insecureIdentity) {
        $insecureIdentity = $rules | Where-Object {
            $rSid = '';
            try { $rSid = $_.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value } catch {};
            $rName = $_.IdentityReference.Value;
            -not (
                ($rSid -and ($trustedSids -contains $rSid)) -or
                ($rName -and ($trustedNames -contains $rName.ToLower())) -or
                ($rSid -eq 'S-1-3-0') -or
                ($rName -eq 'CREATOR OWNER')
            )
        } | Select-Object -ExpandProperty IdentityReference;
    }

    Write-Output ($insecureIdentity -join ', ');
  `;
}

function evaluateWindowsSecurityOutput(
  stdout: string,
  targetPath: string,
): SecurityCheckResult {
  const output = stdout.trim();
  if (!output) {
    return { secure: true };
  }
  if (output.startsWith('InsecureOwner:')) {
    const owner = output.replace('InsecureOwner:', '').trim();
    return {
      secure: false,
      reason: `Path '${targetPath}' is insecure. Owner is untrusted: ${owner}. Only SYSTEM and Administrators may own system configuration paths.`,
    };
  }
  return {
    secure: false,
    reason: `Directory '${targetPath}' is insecure. The following user groups have write permissions: ${output}. To fix this, remove Write and Modify permissions for these groups from the directory's ACLs.`,
  };
}

function checkPosixStats(
  targetPath: string,
  stats: Stats,
): SecurityCheckResult {
  const pathType = stats.isDirectory() ? 'Directory' : 'File';
  // Check ownership: must be root (uid 0)
  if (stats.uid !== 0) {
    return {
      secure: false,
      reason: `${pathType} '${targetPath}' is not owned by root (uid 0). Current uid: ${stats.uid}. To fix this, run: sudo chown root:root "${targetPath}"`,
    };
  }

  // Check permissions: not writable by group (S_IWGRP) or others (S_IWOTH)
  const mode = stats.mode;
  if ((mode & (constants.S_IWGRP | constants.S_IWOTH)) !== 0) {
    return {
      secure: false,
      reason: `${pathType} '${targetPath}' is writable by group or others (mode: ${mode.toString(
        8,
      )}). To fix this, run: sudo chmod g-w,o-w "${targetPath}"`,
    };
  }

  return { secure: true };
}

function validateSinglePathSync(targetPath: string): SecurityCheckResult {
  try {
    const stats = fsSync.statSync(targetPath);

    if (os.platform() === 'win32') {
      try {
        const script = buildPowerShellAclScript();
        const { stdout, error, status } = spawnSync(
          'powershell',
          ['-NoProfile', '-NonInteractive', '-Command', script],
          {
            encoding: 'utf-8',
            env: { ...process.env, GEMINI_TARGET_PATH: targetPath },
          },
        );

        if (error || (status !== null && status !== 0)) {
          return {
            secure: false,
            reason: `A security check for the system policy directory '${targetPath}' failed and could not be completed. Please file a bug report. Original error: ${error?.message || `exit code ${status}`}`,
          };
        }

        return evaluateWindowsSecurityOutput(stdout || '', targetPath);
      } catch (error) {
        return {
          secure: false,
          reason: `A security check for the system policy directory '${targetPath}' failed and could not be completed. Please file a bug report. Original error: ${getErrorMessage(error)}`,
        };
      }
    }

    return checkPosixStats(targetPath, stats);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return { secure: true };
    }
    return {
      secure: false,
      reason: `Failed to access directory: ${getErrorMessage(error)}`,
    };
  }
}

async function validateSinglePathAsync(
  targetPath: string,
): Promise<SecurityCheckResult> {
  try {
    const stats = await fs.stat(targetPath);

    if (os.platform() === 'win32') {
      try {
        const script = buildPowerShellAclScript();
        const { stdout } = await spawnAsync(
          'powershell',
          ['-NoProfile', '-NonInteractive', '-Command', script],
          {
            env: { ...process.env, GEMINI_TARGET_PATH: targetPath },
          },
        );
        return evaluateWindowsSecurityOutput(stdout, targetPath);
      } catch (error) {
        return {
          secure: false,
          reason: `A security check for the system policy directory '${targetPath}' failed and could not be completed. Please file a bug report. Original error: ${getErrorMessage(error)}`,
        };
      }
    }

    return checkPosixStats(targetPath, stats);
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return { secure: true };
    }
    return {
      secure: false,
      reason: `Failed to access directory: ${getErrorMessage(error)}`,
    };
  }
}

/**
 * Synchronously verifies if a file or directory path is secure against unauthorized modification.
 * If targetPath is a file, both the file and its parent directory are validated.
 *
 * @param targetPath The path to check.
 * @returns A SecurityCheckResult.
 */
export function isPathSecureSync(targetPath: string): SecurityCheckResult {
  const cached = securityCheckCache.get(targetPath);
  if (cached) {
    return cached;
  }

  const result = (() => {
    const targetCheck = validateSinglePathSync(targetPath);
    if (!targetCheck.secure) {
      return targetCheck;
    }

    const pathHelper = os.platform() === 'win32' ? path.win32 : path;
    const parentDir = pathHelper.dirname(targetPath);
    if (parentDir && parentDir !== targetPath) {
      const parentCheck = validateSinglePathSync(parentDir);
      if (!parentCheck.secure) {
        return parentCheck;
      }
    }

    return { secure: true };
  })();

  securityCheckCache.set(targetPath, result);
  return result;
}

/**
 * Asynchronously verifies if a file or directory path is secure against unauthorized modification.
 * If targetPath is a file, both the file and its parent directory are validated.
 *
 * @param targetPath The path to check.
 * @returns A promise that resolves to a SecurityCheckResult.
 */
export async function isPathSecure(
  targetPath: string,
): Promise<SecurityCheckResult> {
  const cached = securityCheckCache.get(targetPath);
  if (cached) {
    return cached;
  }

  const targetCheck = await validateSinglePathAsync(targetPath);
  if (!targetCheck.secure) {
    securityCheckCache.set(targetPath, targetCheck);
    return targetCheck;
  }

  const pathHelper = os.platform() === 'win32' ? path.win32 : path;
  const parentDir = pathHelper.dirname(targetPath);
  if (parentDir && parentDir !== targetPath) {
    const parentCheck = await validateSinglePathAsync(parentDir);
    if (!parentCheck.secure) {
      securityCheckCache.set(targetPath, parentCheck);
      return parentCheck;
    }
  }

  const secureResult: SecurityCheckResult = { secure: true };
  securityCheckCache.set(targetPath, secureResult);
  return secureResult;
}

/**
 * Verifies if a directory is secure (owned by root and not writable by others).
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
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return { secure: true };
    }
    return {
      secure: false,
      reason: `Failed to access directory: ${getErrorMessage(error)}`,
    };
  }

  return validateSinglePathAsync(dirPath);
}

/**
 * Synchronously verifies if a directory is secure.
 *
 * @param dirPath The path to the directory to check.
 * @returns A SecurityCheckResult.
 */
export function isDirectorySecureSync(dirPath: string): SecurityCheckResult {
  try {
    const stats = fsSync.statSync(dirPath);

    if (!stats.isDirectory()) {
      return { secure: false, reason: 'Not a directory' };
    }
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') {
      return { secure: true };
    }
    return {
      secure: false,
      reason: `Failed to access directory: ${getErrorMessage(error)}`,
    };
  }

  return validateSinglePathSync(dirPath);
}
