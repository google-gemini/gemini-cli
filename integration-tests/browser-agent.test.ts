/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Integration tests for the browser agent.
 *
 * These tests verify the complete end-to-end flow from CLI prompt through
 * browser_agent delegation to MCP/Chrome DevTools and back. Unlike the unit
 * tests in packages/core/src/agents/browser/ which mock all MCP components,
 * these tests launch real Chrome instances in headless mode.
 *
 * Tests are skipped on systems without Chrome/Chromium installed.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig, assertModelHasOutput } from './test-helper.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const chromeAvailable = (() => {
  try {
    if (process.platform === 'darwin') {
      execSync(
        'test -d "/Applications/Google Chrome.app"  || test -d "/Applications/Chromium.app"',
        {
          stdio: 'ignore',
        },
      );
    } else if (process.platform === 'linux') {
      execSync(
        'which google-chrome || which chromium-browser || which chromium',
        { stdio: 'ignore' },
      );
    } else if (process.platform === 'win32') {
      // Check standard Windows installation paths using Node.js fs
      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        `${process.env['LOCALAPPDATA'] ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
      ];
      const found = chromePaths.some((p) => existsSync(p));
      if (!found) {
        // Fall back to PATH check
        execSync('where chrome || where chromium', { stdio: 'ignore' });
      }
    } else {
      return false;
    }
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!chromeAvailable)('browser-agent', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => await rig.cleanup());

  it('should navigate to a page and capture accessibility tree', async () => {
    rig.setup('browser-navigate-and-snapshot', {
      fakeResponsesPath: join(
        __dirname,
        'browser-agent.navigate-snapshot.responses',
      ),
      settings: {
        agents: {
          browser_agent: {
            headless: true,
            sessionMode: 'isolated',
          },
        },
      },
    });

    const result = await rig.run({
      args: 'Open https://example.com in the browser and tell me the page title and main content.',
    });

    assertModelHasOutput(result);

    const toolLogs = rig.readToolLogs();
    const browserAgentCall = toolLogs.find(
      (t) => t.toolRequest.name === 'browser_agent',
    );
    expect(
      browserAgentCall,
      'Expected browser_agent to be called',
    ).toBeDefined();
  });

  it('should take screenshots of web pages', async () => {
    rig.setup('browser-screenshot', {
      fakeResponsesPath: join(__dirname, 'browser-agent.screenshot.responses'),
      settings: {
        agents: {
          browser_agent: {
            headless: true,
            sessionMode: 'isolated',
          },
        },
      },
    });

    const result = await rig.run({
      args: 'Navigate to https://example.com and take a screenshot.',
    });

    const toolLogs = rig.readToolLogs();
    const browserCalls = toolLogs.filter(
      (t) => t.toolRequest.name === 'browser_agent',
    );
    expect(browserCalls.length).toBeGreaterThan(0);

    assertModelHasOutput(result);
  });

  it('should interact with page elements', async () => {
    rig.setup('browser-interaction', {
      fakeResponsesPath: join(__dirname, 'browser-agent.interaction.responses'),
      settings: {
        agents: {
          browser_agent: {
            headless: true,
            sessionMode: 'isolated',
          },
        },
      },
    });

    const result = await rig.run({
      args: 'Go to https://example.com, find any links on the page, and describe them.',
    });

    const toolLogs = rig.readToolLogs();
    const browserAgentCall = toolLogs.find(
      (t) => t.toolRequest.name === 'browser_agent',
    );
    expect(
      browserAgentCall,
      'Expected browser_agent to be called',
    ).toBeDefined();

    assertModelHasOutput(result);
  });

  it('should clean up browser processes after completion', async () => {
    rig.setup('browser-cleanup', {
      fakeResponsesPath: join(__dirname, 'browser-agent.cleanup.responses'),
      settings: {
        agents: {
          browser_agent: {
            headless: true,
            sessionMode: 'isolated',
          },
        },
      },
    });

    await rig.run({
      args: 'Open https://example.com in the browser and check the page title.',
    });

    // Test passes if we reach here, relying on Vitest's timeout mechanism
    // to detect hanging browser processes.
  });

  it('should handle multiple browser operations in sequence', async () => {
    rig.setup('browser-sequential', {
      fakeResponsesPath: join(__dirname, 'browser-agent.sequential.responses'),
      settings: {
        agents: {
          browser_agent: {
            headless: true,
            sessionMode: 'isolated',
          },
        },
      },
    });

    const result = await rig.run({
      args: 'Navigate to https://example.com, take a snapshot of the accessibility tree, then take a screenshot.',
    });

    const toolLogs = rig.readToolLogs();
    const browserCalls = toolLogs.filter(
      (t) => t.toolRequest.name === 'browser_agent',
    );
    expect(browserCalls.length).toBeGreaterThan(0);

    // Should successfully complete all operations
    assertModelHasOutput(result);
  });

  it('should handle tool confirmation for write_file without crashing', async () => {
    rig.setup('tool-confirmation', {
      fakeResponsesPath: join(
        __dirname,
        'browser-agent.confirmation.responses',
      ),
      settings: {
        agents: {
          browser_agent: {
            headless: true,
            sessionMode: 'isolated',
          },
        },
      },
    });

    const run = await rig.runInteractive({ approvalMode: 'default' });

    await run.type('Write hello to test.txt');
    await run.type('\r');

    await run.expectText('Allow', 15000);

    await run.type('y');
    await run.type('\r');

    await run.expectText('successfully written', 15000);
  });
});
