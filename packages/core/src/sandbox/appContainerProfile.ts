/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AppContainer profile management.
 *
 * Wraps the PowerShell Appx cmdlets (`New-AppContainerProfile`,
 * `Remove-AppContainerProfile`, `Get-AppContainerProfile`) and
 * Windows ACL utilities (`icacls`) to create, configure, and
 * tear-down AppContainer profiles.
 *
 * All operations are no-ops on non-Windows platforms and emit a
 * console warning instead.
 */

import { execSync } from 'node:child_process';
import type { AppContainerCapability } from './appContainerCapabilities.js';
import { CapabilitySet } from './appContainerCapabilities.js';

/**
 * Represents a Windows AppContainer profile with its associated
 * security identifier and capability set.
 */
export interface AppContainerProfile {
  /** Unique profile name (must be valid for Windows SID naming). */
  name: string;
  /** Security Identifier (SID) assigned to the profile by Windows. */
  sid: string;
  /** Set of capabilities granted to this profile. */
  capabilities: AppContainerCapability[];
  /** File-system paths the profile has been granted explicit access to. */
  allowedPaths: string[];
}

/** Default timeout (ms) for PowerShell commands. */
const PS_TIMEOUT = 15_000;

/**
 * Runs a PowerShell command and returns trimmed stdout.
 * Throws on non-zero exit or timeout.
 */
function runPowerShell(command: string, timeout = PS_TIMEOUT): string {
  return execSync(
    `powershell.exe -NoProfile -NonInteractive -Command "${command}"`,
    { encoding: 'utf-8', timeout, stdio: ['ignore', 'pipe', 'pipe'] },
  ).trim();
}

/**
 * Returns `true` when running on Windows.
 */
function isWindows(): boolean {
  return process.platform === 'win32';
}

/**
 * Logs a warning and returns a default value when called on a
 * non-Windows platform.
 */
function nonWindowsWarning(operation: string): void {
  // eslint-disable-next-line no-console -- user-visible platform warning
  console.warn(
    `[AppContainer] ${operation} is only supported on Windows. Skipping.`,
  );
}

/**
 * Creates a new AppContainer profile via PowerShell.
 *
 * @param name - A unique name for the profile (e.g. `gemini-sandbox-<id>`).
 * @param capabilities - Optional capabilities to grant at creation time.
 * @returns The newly created profile descriptor.
 */
export async function createProfile(
  name: string,
  capabilities: AppContainerCapability[] = [],
): Promise<AppContainerProfile> {
  if (!isWindows()) {
    nonWindowsWarning('createProfile');
    return { name, sid: 'S-0-0-0', capabilities, allowedPaths: [] };
  }

  const capSet = new CapabilitySet(capabilities);
  const capsArg =
    capSet.size > 0 ? ` -Capabilities ${capSet.toPowerShellArray()}` : '';

  // Create the profile
  runPowerShell(
    `New-AppContainerProfile -Name '${name}' -DisplayName 'Gemini CLI Sandbox: ${name}'${capsArg}`,
  );

  // Retrieve the SID
  const sid = runPowerShell(
    `(Get-AppContainerProfile -Name '${name}').Sid.Value`,
  );

  return { name, sid, capabilities, allowedPaths: [] };
}

/**
 * Deletes an existing AppContainer profile.
 *
 * @param name - The profile name to remove.
 */
export async function deleteProfile(name: string): Promise<void> {
  if (!isWindows()) {
    nonWindowsWarning('deleteProfile');
    return;
  }

  try {
    runPowerShell(`Remove-AppContainerProfile -Name '${name}'`);
  } catch {
    // Profile may already have been removed -- swallow the error.
  }
}

/**
 * Grants the specified AppContainer profile read/write access to the
 * given file-system paths by updating their ACLs via `icacls`.
 *
 * @param profile - The profile whose SID will be added to the ACLs.
 * @param paths - Absolute file-system paths to grant access to.
 */
export async function grantFileAccess(
  profile: AppContainerProfile,
  paths: string[],
): Promise<void> {
  if (!isWindows()) {
    nonWindowsWarning('grantFileAccess');
    return;
  }

  for (const fsPath of paths) {
    try {
      execSync(`icacls "${fsPath}" /grant *${profile.sid}:(OI)(CI)F /T /Q`, {
        encoding: 'utf-8',
        timeout: PS_TIMEOUT,
        stdio: 'ignore',
      });
      if (!profile.allowedPaths.includes(fsPath)) {
        profile.allowedPaths.push(fsPath);
      }
    } catch (err) {
      // eslint-disable-next-line no-console -- user-visible ACL grant diagnostic
      console.warn(
        `[AppContainer] Failed to grant access to ${fsPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/**
 * Revokes the AppContainer profile's access from the given file-system
 * paths by removing its ACL entries via `icacls`.
 *
 * @param profile - The profile whose SID will be removed from ACLs.
 * @param paths - Absolute file-system paths to revoke access from.
 */
export async function revokeFileAccess(
  profile: AppContainerProfile,
  paths: string[],
): Promise<void> {
  if (!isWindows()) {
    nonWindowsWarning('revokeFileAccess');
    return;
  }

  for (const fsPath of paths) {
    try {
      execSync(`icacls "${fsPath}" /remove *${profile.sid} /T /Q`, {
        encoding: 'utf-8',
        timeout: PS_TIMEOUT,
        stdio: 'ignore',
      });
      const idx = profile.allowedPaths.indexOf(fsPath);
      if (idx !== -1) {
        profile.allowedPaths.splice(idx, 1);
      }
    } catch (err) {
      // eslint-disable-next-line no-console -- user-visible ACL revoke diagnostic
      console.warn(
        `[AppContainer] Failed to revoke access to ${fsPath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}

/**
 * Lists all AppContainer profiles currently registered on the system.
 *
 * @returns An array of profile descriptors (capabilities and allowedPaths
 *          will be empty because the system API does not expose them).
 */
export async function listProfiles(): Promise<AppContainerProfile[]> {
  if (!isWindows()) {
    nonWindowsWarning('listProfiles');
    return [];
  }

  try {
    const json = runPowerShell(
      `Get-AppContainerProfile | Select-Object Name, @{N='Sid';E={$_.Sid.Value}} | ConvertTo-Json -Compress`,
    );

    if (!json || json === '') {
      return [];
    }

    const parsed: unknown = JSON.parse(json);
    const items = Array.isArray(parsed) ? parsed : [parsed];

    return items.map(
      (item: { Name: string; Sid: string }) =>
        ({
          name: item.Name,
          sid: item.Sid,
          capabilities: [],
          allowedPaths: [],
        }) as AppContainerProfile,
    );
  } catch {
    return [];
  }
}
