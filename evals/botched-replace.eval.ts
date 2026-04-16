/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe } from 'vitest';
import { evalTest } from './test-helper.js';

describe('botched replace eval', () => {
  /**
   * Encourages the agent to do an unsafe parallel write to the same file in a single
   * turn and checks that it does not do so. This is a regression test for a bug fix
   * that corrects a case where the agent would fail to write the file.
   */
  evalTest('ALWAYS_PASSES', {
    name: 'should perform multiple edits to the same file sequentially across turns',
    files: {
      'build.bzl': `"""my-internal-build-system"""

load(
    "//core/build/rules:my_rules.bzl",
    "target_alpha",
    "target_beta",
    "target_gamma",
)

target = my_rules.Target.create(
    build_package = "//src/project/web/server",
    visibility = ["//visibility:private"],
)
`,
      'README.md': '# Project\nTODO: Fill me in.',
    },
    prompt:
      'The file contents are standard. Please immediately apply these updates using the replace tool: 1. In build.bzl, remove "target_alpha" from the load statement. 2. In build.bzl, change the visibility to ["//visibility:public"]. 3. In README.md, replace "TODO: Fill me in." with "This is the My Project Web Server". Do not read the files first, just execute the replacements right away to save time.',
    assert: async (rig) => {
      const logs = rig.readToolLogs();

      // Group tool calls by turn (prompt_id)
      const callsPerTurn: Record<string, any[]> = {};
      for (const log of logs) {
        if (log.toolRequest) {
          const pid = log.toolRequest.prompt_id || 'unknown';
          if (!callsPerTurn[pid]) callsPerTurn[pid] = [];
          callsPerTurn[pid].push(log.toolRequest);
        }
      }

      for (const [pid, calls] of Object.entries(callsPerTurn)) {
        const replaceCallsForManifest = calls.filter((c) => {
          const args = JSON.parse(c.args);
          return c.name === 'replace' && args.file_path === 'build.bzl';
        });

        expect(
          replaceCallsForManifest.length,
          `Turn ${pid} made multiple replace calls to build.bzl, which violates the concurrency mandate.`,
        ).toBeLessThanOrEqual(1);
      }

      // Verify changes were actually made
      const finalManifest = rig.readFile('build.bzl');
      expect(finalManifest).not.toContain('"target_alpha"');
      expect(finalManifest).toContain('"//visibility:public"');

      const finalReadme = rig.readFile('README.md');
      expect(finalReadme).toContain('This is the My Project Web Server');
    },
  });
});
