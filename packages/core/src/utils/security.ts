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

    if (os.platform() === 'win32') {
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

        return { secure: true };
      } catch (error) {
        return {
          secure: false,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
          reason: `A security check for the system policy directory '${dirPath}' failed and could not be completed. Please file a bug report. Original error: ${(error as Error).message}`,
        };
      }
    }

    // POSIX checks
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

    return { secure: true };
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
