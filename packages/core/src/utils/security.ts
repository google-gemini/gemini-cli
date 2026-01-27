/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs/promises';
import { constants } from 'node:fs';
import * as os from 'node:os';
import { spawnAsync } from './shell-utils.js';

export interface SecurityCheckResult {
  secure: boolean;
  reason?: string;
}

export interface SecurityCheckOptions {
  /**
   * The expected owner of the directory.
   * - 'root': Owned by root (uid 0) on POSIX.
   * - 'user': Owned by the current user.
   * Defaults to 'root'.
   */
  owner?: 'root' | 'user';
  /**
   * Whether to allow symbolic links.
   * Defaults to false.
   */
  allowSymlinks?: boolean;
}

/**
 * Verifies if a directory is secure.
 *
 * For 'root' owner (default):
 * - POSIX: Owned by root (uid 0) and not writable by group or others.
 * - Windows: ACLs checked to ensure standard users/groups don't have write access.
 *
 * For 'user' owner:
 * - POSIX: Owned by current user and has restrictive permissions (0700).
 * - Windows: Verified as a directory and not a symbolic link.
 *
 * @param dirPath The path to the directory to check.
 * @param options Security check options.
 * @returns A promise that resolves to a SecurityCheckResult.
 */
export async function isDirectorySecure(
  dirPath: string,
  options: SecurityCheckOptions = {},
): Promise<SecurityCheckResult> {
  const { owner = 'root', allowSymlinks = false } = options;

  try {
    const stats = await fs.lstat(dirPath);

    if (!allowSymlinks && stats.isSymbolicLink()) {
      return { secure: false, reason: 'Directory is a symbolic link' };
    }

    if (!stats.isDirectory()) {
      return { secure: false, reason: 'Not a directory' };
    }

    if (os.platform() === 'win32') {
      if (owner === 'root') {
        try {
          // Check ACLs using PowerShell to ensure standard users don't have write access
          const escapedPath = dirPath.replace(/'/g, "''");
          const script = `
            $path = '${escapedPath}';
            $acl = Get-Acl -LiteralPath $path;
            $rules = $acl.Access | Where-Object { 
                $_.AccessControlType -eq 'Allow' -and 
                (($_.FileSystemRights -match 'Write') -or ($_.FileSystemRights -match 'Modify') -or ($_.FileSystemRights -match 'FullControl')) 
            };
            $insecureIdentity = $rules | Where-Object { 
                $_.IdentityReference.Value -match 'Users' -or $_.IdentityReference.Value -eq 'Everyone' 
            } | Select-Object -ExpandProperty IdentityReference;
            Write-Output ($insecureIdentity -join ', ');
          `;

          const { stdout } = await spawnAsync('powershell', [
            '-NoProfile',
            '-NonInteractive',
            '-Command',
            script,
          ]);

          const insecureGroups = stdout.trim();
          if (insecureGroups) {
            return {
              secure: false,
              reason: `Directory '${dirPath}' is insecure. The following user groups have write permissions: ${insecureGroups}. To fix this, remove Write and Modify permissions for these groups from the directory's ACLs.`,
            };
          }
        } catch (error) {
          return {
            secure: false,
            reason: `A security check for the system policy directory '${dirPath}' failed and could not be completed. Please file a bug report. Original error: ${(error as Error).message}`,
          };
        }
      }
      return { secure: true };
    }

    // POSIX checks
    if (owner === 'root') {
      // Check ownership: must be root (uid 0)
      if (stats.uid !== 0) {
        return {
          secure: false,
          reason: `Directory '${dirPath}' is not owned by root (uid 0). Current uid: ${stats.uid}. To fix this, run: sudo chown root:root "${dirPath}"`,
        };
      }

      // Check permissions: not writable by group (S_IWGRP) or others (S_IWOTH)
      const mode = stats.mode;
      if ((mode & (constants.S_IWGRP | constants.S_IWOTH)) !== 0) {
        return {
          secure: false,
          reason: `Directory '${dirPath}' is writable by group or others (mode: ${mode.toString(
            8,
          )}). To fix this, run: sudo chmod g-w,o-w "${dirPath}"`,
        };
      }
    } else {
      const userInfo = os.userInfo();
      if (stats.uid !== userInfo.uid) {
        return {
          secure: false,
          reason: `Directory is not owned by the current user (uid ${userInfo.uid})`,
        };
      }

      // Check for restrictive permissions (0700)
      const mode = stats.mode & 0o777;
      if (mode !== 0o700) {
        return {
          secure: false,
          reason: `Directory has insecure permissions: ${mode.toString(8)} (expected 0700)`,
        };
      }
    }

    return { secure: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { secure: true };
    }
    return {
      secure: false,
      reason: `Failed to access directory: ${(error as Error).message}`,
    };
  }
}
