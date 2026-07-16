/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const utilsDir = path.dirname(fileURLToPath(import.meta.url));

/**
 * Strip SBPL comments (`; ...` to end of line) so assertions run against the
 * actual sandbox rules rather than any keywords that happen to appear in the
 * explanatory comments.
 */
function readRules(profile: string): string {
  return readFileSync(path.join(utilsDir, profile), 'utf8')
    .split('\n')
    .map((line) => {
      const commentStart = line.indexOf(';');
      return commentStart === -1 ? line : line.slice(0, commentStart);
    })
    .join('\n');
}

const PERMISSIVE_PROFILES = [
  'sandbox-macos-permissive-open.sb',
  'sandbox-macos-permissive-proxied.sb',
];

// These two profiles are the default macOS Seatbelt profiles, so the invariants
// below must never silently regress. Keep them deny-default and confirm the
// reviewed allow-list stays in place.
describe('macOS permissive Seatbelt profiles', () => {
  describe.each(PERMISSIVE_PROFILES)('%s', (profile) => {
    const rules = readRules(profile);

    it('uses a deny-default foundation', () => {
      expect(rules).toContain('(deny default)');
    });

    it('does not use an allow-default foundation', () => {
      expect(rules).not.toContain('(allow default)');
    });

    it('does not permit filesystem (un)mounts', () => {
      expect(rules).not.toMatch(/file-mount/);
      expect(rules).not.toMatch(/file-unmount/);
    });

    it('does not grant broad service lookups', () => {
      expect(rules).not.toMatch(/launchd/);
      expect(rules).not.toMatch(/launchservices/i);
    });

    it('allows binding local ports for dev/test servers', () => {
      expect(rules).toContain('(allow network-bind (local ip "*:*"))');
    });
  });

  it('permissive-open keeps broad inbound and outbound network', () => {
    const rules = readRules('sandbox-macos-permissive-open.sb');
    expect(rules).toContain('(allow network-inbound (local ip "*:*"))');
    expect(rules).toMatch(/\(allow network-outbound\)/);
  });

  it('permissive-proxied confines outbound to the proxy', () => {
    const rules = readRules('sandbox-macos-permissive-proxied.sb');
    expect(rules).toContain(
      '(allow network-outbound (remote tcp "localhost:8877"))',
    );
    // Proxied mode must never grant unrestricted outbound network.
    expect(rules).not.toMatch(/\(allow network-outbound\)/);
  });
});
