/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { CommandKind } from './types.js';
import { cyberScanCommand } from './cyberScanCommand.js';
import { createMockCommandContext } from '../../test-utils/mockCommandContext.js';

describe('cyberScanCommand', () => {
  it('should expose expected command metadata', () => {
    expect(cyberScanCommand.name).toBe('scan');
    expect(cyberScanCommand.kind).toBe(CommandKind.BUILT_IN);
  });

  it('should return a submit_prompt action with target context', async () => {
    const context = createMockCommandContext();
    const result = await cyberScanCommand.action!(context, 'scanme.nmap.org');

    expect(result).toMatchObject({
      type: 'submit_prompt',
    });
    if (result?.type === 'submit_prompt') {
      expect(result.content).toContain('Target: scanme.nmap.org');
      expect(result.content).toContain('hats_chain_scan');
    }
  });
});
