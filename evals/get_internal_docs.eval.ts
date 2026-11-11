/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { appEvalTest } from './app-test-helper.js';

describe.sequential('get_internal_docs', () => {
  appEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent uses get_internal_docs when asked about Gemini CLI internal documentation and features',
    prompt:
      'What internal CLI documentation is available regarding Gemini CLI authentication and setup?',
    setup: async (rig) => {
      rig.setBreakpoint([
        'get_internal_docs',
        'web_fetch',
        'google_web_search',
      ]);
    },
    assert: async (rig) => {
      const confirmation = await rig.waitForPendingConfirmation(
        ['get_internal_docs', 'web_fetch', 'google_web_search'],
        30000,
      );

      expect(confirmation, 'Expected a tool call confirmation').toBeDefined();
      expect(
        confirmation.toolName,
        'Agent should use get_internal_docs to fetch built-in CLI docs instead of web tools',
      ).toBe('get_internal_docs');

      await rig.resolveTool(confirmation);
      await rig.waitForIdle(30000);
    },
  });
});
