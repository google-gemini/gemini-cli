/**
 * @license
 * Copyright 2026 Zoe Authors
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  type Capability,
  type PolicyAction,
  DEFAULT_CAPABILITY_MATRIX,
  CapabilityDeniedError,
} from './Capability.js';

export class PermissionManager {
  private matrix: Map<Capability, PolicyAction>;

  constructor(customMatrix?: Partial<Record<Capability, PolicyAction>>) {
    this.matrix = new Map(
      Object.entries(DEFAULT_CAPABILITY_MATRIX) as [Capability, PolicyAction][]
    );

    if (customMatrix) {
      for (const [cap, action] of Object.entries(customMatrix)) {
        if (action) {
          this.matrix.set(cap as Capability, action);
        }
      }
    }
  }

  public getPolicy(capability: Capability): PolicyAction {
    return this.matrix.get(capability) ?? 'DENY';
  }

  public setPolicy(capability: Capability, action: PolicyAction): void {
    this.matrix.set(capability, action);
  }

  public check(capability: Capability): PolicyAction {
    return this.getPolicy(capability);
  }

  public assertAllowed(capability: Capability): void {
    const policy = this.check(capability);
    if (policy === 'DENY') {
      throw new CapabilityDeniedError(capability);
    }
  }
}
