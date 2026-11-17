/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { isStrictlyApproved } from './commandUtils.js';
import type { SandboxRequest } from '../../services/sandboxManager.js';

const createRequest = (command: string, args: string[]): SandboxRequest => ({
  command,
  args,
  cwd: process.cwd(),
  env: {},
});

describe('isStrictlyApproved', () => {
  it('returns false when no tools are approved', async () => {
    expect(await isStrictlyApproved(createRequest('ls', ['-la']), [])).toBe(
      false,
    );
    expect(await isStrictlyApproved(createRequest('ls', ['-la']))).toBe(false);
  });

  it('approves known read-only commands with literal arguments', async () => {
    expect(
      await isStrictlyApproved(createRequest('ls', ['-la']), ['cat']),
    ).toBe(true);
  });

  it('approves commands whose root tools are all explicitly approved', async () => {
    expect(
      await isStrictlyApproved(
        createRequest('bash', ['-c', 'find . {-delete,}']),
        ['find'],
      ),
    ).toBe(true);
  });

  it('does not approve unlisted tools whose arguments change after shell expansion', async () => {
    expect(
      await isStrictlyApproved(
        createRequest('bash', ['-c', 'find . {-delete,}']),
        ['cat'],
      ),
    ).toBe(false);
  });
});
