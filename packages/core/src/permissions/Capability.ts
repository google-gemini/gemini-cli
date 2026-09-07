/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

export type Capability =
  | 'filesystem.read'
  | 'filesystem.search'
  | 'filesystem.write'
  | 'shell.inspect'
  | 'shell.execute'
  | 'git.status'
  | 'git.diff'
  | 'git.log'
  | 'git.commit'
  | 'tests.run'
  | 'code.patch'
  | 'code.generate';

export type PolicyAction = 'ALLOW' | 'ASK' | 'DENY';

export const DEFAULT_CAPABILITY_MATRIX: Record<Capability, PolicyAction> = {
  'filesystem.read': 'ALLOW',
  'filesystem.search': 'ALLOW',
  'filesystem.write': 'DENY',
  'shell.inspect': 'ALLOW',
  'shell.execute': 'ASK',
  'git.status': 'ALLOW',
  'git.diff': 'ALLOW',
  'git.log': 'ALLOW',
  'git.commit': 'DENY',
  'tests.run': 'ALLOW',
  'code.patch': 'DENY',
  'code.generate': 'DENY',
};

export class CapabilityDeniedError extends Error {
  public readonly capability: Capability;

  constructor(capability: Capability, reason?: string) {
    super(
      `Capability "${capability}" is DENIED by Zoe's engineering security policy. ${reason || 'Zoe operates as a read-only architectural mentor and will not modify files.'}`
    );
    this.name = 'CapabilityDeniedError';
    this.capability = capability;
  }
}
