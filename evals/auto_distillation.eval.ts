/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { appEvalTest } from './app-test-helper.js';

describe('Auto-Distillation Behavioral Evals', () => {
  appEvalTest('ALWAYS_PASSES', {
    name: 'Agent successfully navigates truncated output using the structural map to extract a secret',
    timeout: 120000,
    configOverrides: {},
    setup: async (rig) => {
      const testDir = rig.getTestDir();

      const mockData: any = {
        system_info: {
          version: '1.0.0',
          uptime: 999999,
          environment: 'production',
        },
        // Pad with enough active sessions to push the next section past the 8,000 character 'head'
        // 300 sessions * ~80 chars = ~24,000 characters
        active_sessions: [],
        quarantined_payloads: [
          { id: 'Subject-01', status: 'cleared' },
          {
            id: 'Subject-89',
            secret_token: 'the_cake_is_a_lie',
            status: 'held_for_review',
          },
          { id: 'Subject-99', status: 'cleared' },
        ],
        // Pad with enough metrics to push the total file size well past 60,000 characters
        // 2000 metrics * ~70 chars = ~140,000 characters
        archived_metrics: [],
      };

      for (let i = 0; i < 300; i++) {
        mockData.active_sessions.push({
          session_id: `sess_${i.toString().padStart(4, '0')}`,
          duration_ms: Math.floor(Math.random() * 10000),
          bytes_transferred: Math.floor(Math.random() * 50000),
        });
      }

      for (let i = 0; i < 2000; i++) {
        mockData.archived_metrics.push({
          timestamp: Date.now() - i * 1000,
          cpu_load: parseFloat(Math.random().toFixed(4)),
          mem_usage: parseFloat(Math.random().toFixed(4)),
        });
      }

      fs.writeFileSync(
        path.join(testDir, 'server_state_dump.json'),
        JSON.stringify(mockData, null, 2),
      );
    },
    prompt:
      'A massive log dump is located at server_state_dump.json. First, you MUST run the shell command `cat server_state_dump.json` to view it. The output will likely be truncated. Read the structural map provided in the output, and then figure out a way to extract the secret_token for the quarantined payload "Subject-89".',
    assert: async (rig) => {
      await rig.waitForIdle(120000);

      const finalOutput = rig.getStaticOutput();
      const curatedHistory = rig.getCuratedHistory();

      // Ensure truncation occurred
      const stringifiedHistory = JSON.stringify(curatedHistory);
      expect(stringifiedHistory).toContain('Output too large. Showing first');

      // Ensure the structural map summarizer was triggered
      expect(stringifiedHistory).toContain(
        '--- Structural Map of Truncated Content ---',
      );

      // Ensure the agent correctly extracted the secret token
      expect(finalOutput).toContain('the_cake_is_a_lie');
    },
  });
});
