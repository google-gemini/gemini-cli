/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * File-system access control policy for Windows AppContainer sandboxes.
 *
 * Generates and applies `icacls` commands that grant or deny specific
 * file-system permissions to an AppContainer profile SID. This allows
 * the sandbox driver to restrict which directories the sandboxed
 * process can read from or write to.
 *
 * All operations are no-ops on non-Windows platforms.
 */

import { execSync } from 'node:child_process';

/** Types of file-system access that can be granted or denied. */
export enum FileAccessType {
  Read = 'read',
  Write = 'write',
  Deny = 'deny',
}

/** A single file-system access rule. */
export interface FileAccessRule {
  path: string;
  accessType: FileAccessType;
}

/** Default timeout (ms) for icacls commands. */
const ICACLS_TIMEOUT = 10_000;

/**
 * Manages file-system access rules for an AppContainer sandbox.
 *
 * Usage:
 * ```ts
 * const policy = new FileAccessPolicy();
 * policy.addReadAccess('C:\\project\\src');
 * policy.addWriteAccess('C:\\project\\output');
 * policy.addDenyAccess('C:\\Windows\\System32');
 * await policy.applyToProfile(profileSid);
 * ```
 */
export class FileAccessPolicy {
  private readonly rules: FileAccessRule[] = [];

  /**
   * Adds read-only access for the given path.
   *
   * @param path - Absolute file-system path.
   */
  addReadAccess(path: string): void {
    this.rules.push({ path, accessType: FileAccessType.Read });
  }

  /**
   * Adds read/write access for the given path.
   *
   * @param path - Absolute file-system path.
   */
  addWriteAccess(path: string): void {
    this.rules.push({ path, accessType: FileAccessType.Write });
  }

  /**
   * Explicitly denies access to the given path.
   *
   * @param path - Absolute file-system path.
   */
  addDenyAccess(path: string): void {
    this.rules.push({ path, accessType: FileAccessType.Deny });
  }

  /** Returns all configured rules. */
  getRules(): readonly FileAccessRule[] {
    return this.rules;
  }

  /**
   * Generates `icacls` command strings for each rule.
   *
   * - **Read**: grants `(OI)(CI)R` (read, recursive).
   * - **Write**: grants `(OI)(CI)F` (full control, recursive).
   * - **Deny**: denies `(OI)(CI)F` (full control, recursive).
   *
   * All commands operate recursively (`/T`) and quietly (`/Q`).
   *
   * @param profileSid - The AppContainer profile SID.
   * @returns An array of icacls command strings.
   */
  generateAclCommands(profileSid: string): string[] {
    return this.rules.map((rule) => {
      switch (rule.accessType) {
        case FileAccessType.Read:
          return `icacls "${rule.path}" /grant *${profileSid}:(OI)(CI)R /T /Q`;

        case FileAccessType.Write:
          return `icacls "${rule.path}" /grant *${profileSid}:(OI)(CI)F /T /Q`;

        case FileAccessType.Deny:
          return `icacls "${rule.path}" /deny *${profileSid}:(OI)(CI)F /T /Q`;

        default: {
          const _exhaustive: never = rule.accessType;
          throw new Error(`Unknown FileAccessType: ${String(_exhaustive)}`);
        }
      }
    });
  }

  /**
   * Applies all file-system access rules to the given AppContainer profile.
   *
   * Deny rules are applied last so they take precedence over grants.
   *
   * @param profileSid - The AppContainer profile SID.
   */
  async applyToProfile(profileSid: string): Promise<void> {
    if (process.platform !== 'win32') {
      // eslint-disable-next-line no-console -- user-visible platform warning
      console.warn(
        '[AppContainer] FileAccessPolicy.applyToProfile is only supported on Windows. Skipping.',
      );
      return;
    }

    // Sort so deny rules run after grant rules (deny wins).
    const sorted = [...this.rules].sort((a, b) => {
      if (a.accessType === FileAccessType.Deny) return 1;
      if (b.accessType === FileAccessType.Deny) return -1;
      return 0;
    });

    for (const rule of sorted) {
      const cmd = this.buildCommand(profileSid, rule);
      try {
        execSync(cmd, {
          encoding: 'utf-8',
          timeout: ICACLS_TIMEOUT,
          stdio: 'ignore',
        });
      } catch (err) {
        // eslint-disable-next-line no-console -- user-visible ACL failure diagnostic
        console.warn(
          `[AppContainer] Failed to apply ACL for ${rule.path} (${rule.accessType}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
  }

  /**
   * Builds a single icacls command string for a rule.
   */
  private buildCommand(profileSid: string, rule: FileAccessRule): string {
    switch (rule.accessType) {
      case FileAccessType.Read:
        return `icacls "${rule.path}" /grant *${profileSid}:(OI)(CI)R /T /Q`;
      case FileAccessType.Write:
        return `icacls "${rule.path}" /grant *${profileSid}:(OI)(CI)F /T /Q`;
      case FileAccessType.Deny:
        return `icacls "${rule.path}" /deny *${profileSid}:(OI)(CI)F /T /Q`;
      default: {
        const _exhaustive: never = rule.accessType;
        throw new Error(`Unknown FileAccessType: ${String(_exhaustive)}`);
      }
    }
  }
}
