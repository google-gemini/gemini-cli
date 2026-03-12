/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { appEvalTest } from './app-test-helper.js';
import {
  userText,
  mockGenerateContentStreamText,
} from '@google/gemini-cli-core';

describe('Auto-Distillation Behavioral Evals', () => {
  appEvalTest('USUALLY_PASSES', {
    name: 'Agent successfully navigates truncated output using the structural map to extract a secret',
    timeout: 180000,
    configOverrides: {},
    setup: async (rig) => {
      const testDir = rig.getTestDir();

      const mockData: any = {
        system_info: {
          version: '1.0.0',
          uptime: 999999,
          environment: 'production',
        },
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

      const massiveString = JSON.stringify(mockData, null, 2);

      fs.writeFileSync(
        path.join(testDir, 'server_state_dump.json'),
        massiveString,
      );
    },
    script: [
      userText('We have a critical error in production. Are you ready to help?'),
      mockGenerateContentStreamText(
        'I am ready. Please provide the details of the error.',
      ),
    ],
    prompt: `My application crashed with: "FATAL: Subject-89 held for review in quarantine". \n\nPlease run \`cat server_state_dump.json\` to investigate. The file is massive, so your tool output will be automatically truncated and you will receive a structural map instead. Use that structural map to determine the right command to extract the \`secret_token\` for Subject-89. Please state the exact secret token when you find it.`,
    assert: async (rig) => {
      await rig.waitForIdle(120000);

      const finalOutput = rig.getStaticOutput();

      // Ensure the agent correctly extracted the secret token after navigating the distilled output
      expect(finalOutput).toContain('the_cake_is_a_lie');
    },
  });
});
