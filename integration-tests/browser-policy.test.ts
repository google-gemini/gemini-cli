/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig, poll } from './test-helper.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import stripAnsi from 'strip-ansi';

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
      const chromePaths = [
        'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
        `${process.env['LOCALAPPDATA'] ?? ''}\\Google\\Chrome\\Application\\chrome.exe`,
      ];
      const found = chromePaths.some((p) => existsSync(p));
      if (!found) {
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

describe.skipIf(!chromeAvailable)('browser-policy', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should skip confirmation when "Allow all server tools for this session" is chosen', async () => {
    rig.setup('browser-policy-skip-confirmation', {
      fakeResponsesPath: join(__dirname, 'browser-policy.responses'),
      settings: {
        experimental: {
          enableAgents: true,
        },
        agents: {
          overrides: {
            browser_agent: {
              enabled: true,
            },
          },
          browser: {
            headless: true,
            sessionMode: 'isolated',
            allowedDomains: ['example.com'],
          },
        },
      },
    });

    // Manually trust the folder to avoid the dialog and enable option 3
    const geminiDir = join(rig.homeDir!, '.gemini');
    mkdirSync(geminiDir, { recursive: true });

    // Write to trustedFolders.json
    const trustedFoldersPath = join(geminiDir, 'trustedFolders.json');
    const trustedFolders = {
      [rig.testDir!]: 'TRUST_FOLDER',
    };
    writeFileSync(trustedFoldersPath, JSON.stringify(trustedFolders, null, 2));

    // Force confirmation for browser agent.
    // NOTE: We don't force confirm browser tools here because "Allow all server tools"
    // adds a rule with ALWAYS_ALLOW_PRIORITY (3.9x) which would be overshadowed by
    // a rule in the user tier (4.x) like the one from this TOML.
    // By removing the explicit mcp rule, the first MCP tool will still prompt
    // due to default approvalMode = 'default', and then "Allow all" will correctly
    // bypass subsequent tools.
    const policyFile = join(rig.testDir!, 'force-confirm.toml');
    writeFileSync(
      policyFile,
      `
[[rule]]
name = "Force confirm browser_agent"
toolName = "browser_agent"
decision = "ask_user"
priority = 200
`,
    );

    // Update settings.json in both project and home directories to point to the policy file
    for (const baseDir of [rig.testDir!, rig.homeDir!]) {
      const settingsPath = join(baseDir, '.gemini', 'settings.json');
      if (existsSync(settingsPath)) {
        const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
        settings.policyPaths = [policyFile];
        // Ensure folder trust is enabled
        settings.security = settings.security || {};
        settings.security.folderTrust = settings.security.folderTrust || {};
        settings.security.folderTrust.enabled = true;
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      }
    }

    const run = await rig.runInteractive({
      approvalMode: 'default',
      env: {
        GEMINI_CLI_INTEGRATION_TEST: 'true',
      },
    });

    await run.sendKeys(
      'Open https://example.com and check if there is a heading\r',
    );
    await run.sendKeys('\r');

    // Handle confirmations.
    // 1. Initial browser_agent delegation (likely only 3 options, so use option 1: Allow once)
    await poll(
      () => stripAnsi(run.output).toLowerCase().includes('action required'),
      60000,
      1000,
    );
    await run.sendKeys('1\r');
    await new Promise((r) => setTimeout(r, 2000));

    // Handle privacy notice
    await poll(
      () => stripAnsi(run.output).toLowerCase().includes('privacy notice'),
      5000,
      100,
    );
    await run.sendKeys('1\r');
    await new Promise((r) => setTimeout(r, 5000));

    // new_page (MCP tool, should have 4 options, use option 3: Allow all server tools)
    await poll(
      () => {
        const stripped = stripAnsi(run.output).toLowerCase();
        return (
          stripped.includes('new_page') &&
          stripped.includes('allow all server tools for this session')
        );
      },
      60000,
      1000,
    );

    // Select "Allow all server tools for this session" (option 3)
    await run.sendKeys('3\r');
    await new Promise((r) => setTimeout(r, 30000));

    const output = stripAnsi(run.output).toLowerCase();

    expect(output).toContain('browser_agent');
    expect(output).toContain('completed successfully');
  });

  it('should show the visible warning when browser agent starts in existing session mode', async () => {
    rig.setup('browser-session-warning', {
      fakeResponsesPath: join(__dirname, 'browser-agent.cleanup.responses'),
      settings: {
        experimental: {
          enableAgents: true,
        },
        general: {
          enableAutoUpdateNotification: false,
        },
        agents: {
          overrides: {
            browser_agent: {
              enabled: true,
            },
          },
          browser: {
            sessionMode: 'existing',
            headless: true,
          },
        },
      },
    });

    const stdout = await rig.runCommand(['Open https://example.com'], {
      env: {
        GEMINI_API_KEY: 'fake-key',
        GEMINI_TELEMETRY_DISABLED: 'true',
        DEV: 'true',
      },
    });

    expect(stdout).toContain('saved logins will be visible');
  });
});
