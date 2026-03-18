/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */

/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import toml from '@iarna/toml';
import { SandboxProfile } from './sandboxManager.js';
import { debugLogger } from '../utils/debugLogger.js';

export interface ExecPolicyRule {
  prefix: string[];
  profile: SandboxProfile;
}

export class ExecPolicyEngine {
  private rules: ExecPolicyRule[] = [];

  constructor(private readonly configDir: string) {
    this.loadPolicy();
  }

  loadPolicy() {
    this.rules = [];
    const policyPath = path.join(this.configDir, 'execpolicy.toml');
    if (fs.existsSync(policyPath)) {
      try {
        const content = fs.readFileSync(policyPath, 'utf8');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const parsed = toml.parse(content) as any;
        if (parsed && Array.isArray(parsed.rules)) {
          for (const rule of parsed.rules) {
            if (Array.isArray(rule.prefix) && typeof rule.profile === 'string') {
              const profile =
                rule.profile === 'WorkspaceWrite'
                  ? SandboxProfile.WORKSPACE_WRITE
                  : SandboxProfile.READ_ONLY;
              this.rules.push({
                prefix: rule.prefix,
                profile,
              });
            }
          }
        }
      } catch (_error) {
        debugLogger.error('Failed to parse execpolicy.toml:', _error);
      }
    }
  }

  getProfileForCommand(commandStr: string): SandboxProfile {
    // Basic tokenization by space.
    // In a real shell parser, this would handle quotes, but this is a prototype.
    const tokens = commandStr.trim().split(/\s+/);
    
    let bestMatchLength = -1;
    let bestMatchProfile = SandboxProfile.READ_ONLY; // Default

    for (const rule of this.rules) {
      if (rule.prefix.length > tokens.length) {
        continue;
      }
      let match = true;
      for (let i = 0; i < rule.prefix.length; i++) {
        if (rule.prefix[i] !== tokens[i]) {
          match = false;
          break;
        }
      }
      if (match && rule.prefix.length > bestMatchLength) {
        bestMatchLength = rule.prefix.length;
        bestMatchProfile = rule.profile;
      }
    }

    return bestMatchProfile;
  }

  public async addRule(prefix: string[], profile: SandboxProfile) {
    this.rules.push({ prefix, profile });
    const policyPath = path.join(this.configDir, 'execpolicy.toml');

    let parsed: { rules: any[] } = { rules: [] };
    if (fs.existsSync(policyPath)) {
      try {
        const content = fs.readFileSync(policyPath, 'utf8');
        const tomlParsed = toml.parse(content);
        parsed = tomlParsed as unknown as { rules: any[] };
        if (!Array.isArray(parsed.rules)) {
          parsed.rules = [];
        }
      } catch (_error) {
        // Ignore parse errors, just overwrite
      }
    }

    const profileStr =
      profile === SandboxProfile.WORKSPACE_WRITE
        ? 'WorkspaceWrite'
        : 'ReadOnly';

    // Check if the rule already exists to avoid duplicates
    let exists = false;
    for (const r of parsed.rules) {
       if (Array.isArray(r.prefix) && r.prefix.length === prefix.length && r.prefix.every((val: string, index: number) => val === prefix[index])) {
           r.profile = profileStr;
           exists = true;
           break;
       }
    }
    
    if (!exists) {
        parsed.rules.push({
          prefix,
          profile: profileStr,
        });
    }

    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    fs.writeFileSync(policyPath, toml.stringify(parsed as any));
  }
}
