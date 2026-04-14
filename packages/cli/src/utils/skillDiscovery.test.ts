/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi } from 'vitest';
import { getDiscoveryReportForSkill } from './skillDiscovery.js';

vi.mock('@google/gemini-cli-core', () => ({
  isSubpath: (parentPath: string, childPath: string) =>
    childPath === parentPath || childPath.startsWith(`${parentPath}/`),
  resolveToRealPath: (pathStr: string) => pathStr,
}));

describe('getDiscoveryReportForSkill', () => {
  it('prefers the longest matching source directory', () => {
    const reports = [
      {
        source_dir: '/skills',
        total_duration_ms: 10,
        glob_duration_ms: 2,
      },
      {
        source_dir: '/skills/network',
        total_duration_ms: 25,
        glob_duration_ms: 5,
      },
    ];

    expect(
      getDiscoveryReportForSkill('/skills/network/tool/SKILL.md', reports),
    ).toEqual(reports[1]);
  });

  it('does not match sibling paths that only share a string prefix', () => {
    const reports = [
      {
        source_dir: '/skills/foo',
        total_duration_ms: 10,
        glob_duration_ms: 2,
      },
    ];

    expect(
      getDiscoveryReportForSkill('/skills/foobar/SKILL.md', reports),
    ).toBeUndefined();
  });
});
