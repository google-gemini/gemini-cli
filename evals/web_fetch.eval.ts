/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect } from 'vitest';
import { appEvalTest } from './app-test-helper.js';

describe.sequential('web_fetch', () => {
  appEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent fetches URL when asked for summary of webpage and avoids shell curl or web search',
    prompt:
      'Please fetch the webpage at https://example.com/status and summarize its content for me.',
    setup: async (rig) => {
      rig.setBreakpoint([
        'web_fetch',
        'run_shell_command',
        'google_web_search',
      ]);
    },
    assert: async (rig) => {
      const confirmation = await rig.waitForPendingConfirmation(
        ['web_fetch', 'run_shell_command', 'google_web_search'],
        30000,
      );

      expect(confirmation, 'Expected a tool call confirmation').toBeDefined();
      expect(
        confirmation.toolName,
        'Agent should use web_fetch instead of shell curl or google search',
      ).toBe('web_fetch');

      const toolCalls = (rig as any).getToolCalls();
      const webFetchCall = toolCalls.find(
        (call: any) => call.request?.name === 'web_fetch',
      );
      expect(
        webFetchCall,
        'Expected web_fetch call in tool logs',
      ).toBeDefined();

      const args = webFetchCall.request?.args;
      const hasUrl =
        args?.url?.includes('example.com/status') ||
        args?.prompt?.includes('example.com/status');
      expect(hasUrl, 'Expected target URL in web_fetch args').toBe(true);

      // Resolve the tool to allow the turn to complete successfully
      await rig.resolveTool(confirmation);
      await rig.waitForIdle(30000);
    },
  });

  appEvalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'Agent does NOT fetch web content when asked for local repo details',
    files: {
      'README.md': '# My Cool Local Project\nThis is local repository content.',
    },
    prompt: 'Summarize the content of README.md in this project.',
    setup: async (rig) => {
      rig.setBreakpoint(['read_file', 'web_fetch']);
    },
    assert: async (rig) => {
      const confirmation = await rig.waitForPendingConfirmation(
        ['read_file', 'web_fetch'],
        30000,
      );
      expect(confirmation).toBeDefined();
      expect(
        confirmation.toolName,
        'Agent should read local file instead of fetching external URLs',
      ).toBe('read_file');

      // Resolve the tool to allow the turn to complete successfully
      await rig.resolveTool(confirmation);
      await rig.waitForIdle(30000);
    },
  });
});
