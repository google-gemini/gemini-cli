/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Network isolation policy for Windows AppContainer sandboxes.
 *
 * Generates and applies Windows Firewall rules (`netsh advfirewall`)
 * scoped to a specific AppContainer profile SID. This allows fine-grained
 * control over which network endpoints the sandboxed process can reach.
 *
 * All operations are no-ops on non-Windows platforms.
 */

import { execSync } from 'node:child_process';

/** Describes a single network endpoint (host + port). */
export interface NetworkEndpoint {
  host: string;
  port: number;
}

/** Default timeout (ms) for netsh commands. */
const NETSH_TIMEOUT = 10_000;

/**
 * Prefix used for all firewall rule names created by this module so
 * they can be identified and cleaned up later.
 */
const RULE_PREFIX = 'GeminiCLI-AppContainer';

/**
 * Manages network access rules for an AppContainer sandbox.
 *
 * Usage:
 * ```ts
 * const policy = new NetworkPolicy();
 * policy.addAllowedEndpoint('api.example.com', 443);
 * policy.addBlockedEndpoint('evil.example.com', 80);
 * await policy.applyPolicy(profileSid);
 * // ... run sandboxed process ...
 * await policy.removePolicy(profileSid);
 * ```
 */
export class NetworkPolicy {
  private readonly allowed: NetworkEndpoint[] = [];
  private readonly blocked: NetworkEndpoint[] = [];

  /**
   * Adds an endpoint that the sandboxed process is allowed to reach.
   */
  addAllowedEndpoint(host: string, port: number): void {
    this.allowed.push({ host, port });
  }

  /**
   * Adds an endpoint that the sandboxed process is explicitly blocked
   * from reaching.
   */
  addBlockedEndpoint(host: string, port: number): void {
    this.blocked.push({ host, port });
  }

  /** Returns the current list of allowed endpoints. */
  getAllowed(): readonly NetworkEndpoint[] {
    return this.allowed;
  }

  /** Returns the current list of blocked endpoints. */
  getBlocked(): readonly NetworkEndpoint[] {
    return this.blocked;
  }

  /**
   * Generates `netsh advfirewall` commands that implement the policy.
   *
   * Block rules are created with a higher priority than allow rules
   * so explicit blocks always win.
   *
   * @param profileSid - The AppContainer profile SID to scope rules to.
   * @returns An array of netsh command strings.
   */
  toWindowsFirewallRules(profileSid: string): string[] {
    const rules: string[] = [];

    // Block rules first (processed before allow rules by netsh)
    for (const ep of this.blocked) {
      const ruleName = `${RULE_PREFIX}-Block-${profileSid.slice(-8)}-${ep.host}-${ep.port}`;
      rules.push(
        `netsh advfirewall firewall add rule name="${ruleName}" ` +
          `dir=out action=block protocol=TCP ` +
          `remoteip=${ep.host} remoteport=${ep.port} ` +
          `appcontainersid=${profileSid}`,
      );
    }

    // Allow rules
    for (const ep of this.allowed) {
      const ruleName = `${RULE_PREFIX}-Allow-${profileSid.slice(-8)}-${ep.host}-${ep.port}`;
      rules.push(
        `netsh advfirewall firewall add rule name="${ruleName}" ` +
          `dir=out action=allow protocol=TCP ` +
          `remoteip=${ep.host} remoteport=${ep.port} ` +
          `appcontainersid=${profileSid}`,
      );
    }

    return rules;
  }

  /**
   * Applies the policy by executing the generated firewall rules.
   *
   * @param profileSid - The AppContainer SID to apply rules for.
   */
  async applyPolicy(profileSid: string): Promise<void> {
    if (process.platform !== 'win32') {
      // eslint-disable-next-line no-console -- user-visible platform warning
      console.warn(
        '[AppContainer] NetworkPolicy.applyPolicy is only supported on Windows. Skipping.',
      );
      return;
    }

    const rules = this.toWindowsFirewallRules(profileSid);
    for (const rule of rules) {
      try {
        execSync(rule, {
          encoding: 'utf-8',
          timeout: NETSH_TIMEOUT,
          stdio: 'ignore',
        });
      } catch (err) {
        // eslint-disable-next-line no-console -- user-visible firewall-rule diagnostic
        console.warn(
          `[AppContainer] Failed to apply firewall rule: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * Removes all firewall rules previously applied for the given
   * AppContainer profile.
   *
   * @param profileSid - The AppContainer SID whose rules should be removed.
   */
  async removePolicy(profileSid: string): Promise<void> {
    if (process.platform !== 'win32') {
      // eslint-disable-next-line no-console -- user-visible platform warning
      console.warn(
        '[AppContainer] NetworkPolicy.removePolicy is only supported on Windows. Skipping.',
      );
      return;
    }

    // Remove all rules whose name starts with our prefix and contains
    // the tail of the SID.
    const sidTail = profileSid.slice(-8);
    const deleteCmd =
      `powershell.exe -NoProfile -NonInteractive -Command "` +
      `Get-NetFirewallRule | Where-Object { $_.DisplayName -like '${RULE_PREFIX}-*-${sidTail}-*' } | Remove-NetFirewallRule"`;

    try {
      execSync(deleteCmd, {
        encoding: 'utf-8',
        timeout: NETSH_TIMEOUT,
        stdio: 'ignore',
      });
    } catch {
      // Best-effort cleanup -- rules may already be gone.
    }
  }
}
