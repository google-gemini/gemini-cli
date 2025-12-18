/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import type { ToolCallConfirmationDetails } from '../tools/tools.js';
import { RemoteAgentInvocation } from './remote-invocation.js';
import type { RemoteAgentDefinition } from './types.js';

class TestableRemoteAgentInvocation extends RemoteAgentInvocation {
  override async getConfirmationDetails(
    abortSignal: AbortSignal,
  ): Promise<ToolCallConfirmationDetails | false> {
    return super.getConfirmationDetails(abortSignal);
  }
}

describe('RemoteAgentInvocation', () => {
  const mockDefinition: RemoteAgentDefinition = {
    kind: 'remote',
    name: 'test-remote-agent',
    description: 'A test remote agent',
    displayName: 'Test Remote Agent',
    agentCardUrl: 'https://example.com/agent-card',
    inputConfig: {
      inputs: {},
    },
  };

  it('should be instantiated with correct params', () => {
    const invocation = new RemoteAgentInvocation(mockDefinition, {});
    expect(invocation).toBeDefined();
    expect(invocation.getDescription()).toBe(
      'Calling remote agent Test Remote Agent',
    );
  });

  it('should return false for confirmation details (not yet implemented)', async () => {
    const invocation = new TestableRemoteAgentInvocation(mockDefinition, {});
    const details = await invocation.getConfirmationDetails(
      new AbortController().signal,
    );
    expect(details).toBe(false);
  });
});
