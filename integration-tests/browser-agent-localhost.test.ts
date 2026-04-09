/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TestRig, assertModelHasOutput } from './test-helper.js';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('browser-agent-localhost', () => {
  let rig: TestRig;

  const browserSettings = {
    agents: {
      overrides: {
        browser_agent: {
          enabled: true,
        },
      },
      browser: {
        headless: true,
        sessionMode: 'isolated' as const,
      },
    },
  };

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    await rig.cleanup();
  });

  it('should navigate to localhost fixture and read page content', async () => {
    rig.setup('localhost-navigate', {
      fakeResponsesPath: join(
        __dirname,
        'browser-agent-localhost.navigate.responses',
      ),
      settings: browserSettings,
    });

    const result = await rig.run({
      args: 'Navigate to http://127.0.0.1:18923/index.html and tell me the page title and list all links.',
    });

    assertModelHasOutput(result);

    const toolLogs = rig.readToolLogs();
    const browserAgentCall = toolLogs.find(
      (t) =>
        t.toolRequest.name === 'invoke_agent' &&
        JSON.parse(t.toolRequest.args).agent_name === 'browser_agent',
    );
    expect(
      browserAgentCall,
      'Expected browser_agent to be called',
    ).toBeDefined();
  });

  it('should fill out and submit a form on localhost', async () => {
    rig.setup('localhost-form', {
      fakeResponsesPath: join(
        __dirname,
        'browser-agent-localhost.form.responses',
      ),
      settings: browserSettings,
    });

    const result = await rig.run({
      args: "Navigate to http://127.0.0.1:18923/form.html, fill in name='Test User', email='test@example.com', message='Hello World', and submit the form.",
    });

    assertModelHasOutput(result);

    const toolLogs = rig.readToolLogs();
    const browserAgentCall = toolLogs.find(
      (t) =>
        t.toolRequest.name === 'invoke_agent' &&
        JSON.parse(t.toolRequest.args).agent_name === 'browser_agent',
    );
    expect(
      browserAgentCall,
      'Expected browser_agent to be called',
    ).toBeDefined();
  });

  it('should navigate through a multi-step flow', async () => {
    rig.setup('localhost-multistep', {
      fakeResponsesPath: join(
        __dirname,
        'browser-agent-localhost.multistep.responses',
      ),
      settings: browserSettings,
    });

    const result = await rig.run({
      args: "Go to http://127.0.0.1:18923/multi-step/step1.html, fill in 'testuser' as username, click Next, then click Finish on step 2. Report the result.",
    });

    assertModelHasOutput(result);

    const toolLogs = rig.readToolLogs();
    const browserAgentCall = toolLogs.find(
      (t) =>
        t.toolRequest.name === 'invoke_agent' &&
        JSON.parse(t.toolRequest.args).agent_name === 'browser_agent',
    );
    expect(
      browserAgentCall,
      'Expected browser_agent to be called',
    ).toBeDefined();
  });

  it('should handle dynamically loaded content', async () => {
    rig.setup('localhost-dynamic', {
      fakeResponsesPath: join(
        __dirname,
        'browser-agent-localhost.dynamic.responses',
      ),
      settings: browserSettings,
    });

    const result = await rig.run({
      args: 'Navigate to http://127.0.0.1:18923/dynamic.html, wait for content to load, and tell me what items appear.',
    });

    assertModelHasOutput(result);

    const toolLogs = rig.readToolLogs();
    const browserAgentCall = toolLogs.find(
      (t) =>
        t.toolRequest.name === 'invoke_agent' &&
        JSON.parse(t.toolRequest.args).agent_name === 'browser_agent',
    );
    expect(
      browserAgentCall,
      'Expected browser_agent to be called',
    ).toBeDefined();
  });

  it('should take a screenshot of localhost page', async () => {
    rig.setup('localhost-screenshot', {
      fakeResponsesPath: join(
        __dirname,
        'browser-agent-localhost.screenshot.responses',
      ),
      settings: browserSettings,
    });

    const result = await rig.run({
      args: 'Navigate to http://127.0.0.1:18923/index.html and take a screenshot.',
    });

    assertModelHasOutput(result);

    const toolLogs = rig.readToolLogs();
    const browserCalls = toolLogs.filter(
      (t) =>
        t.toolRequest.name === 'invoke_agent' &&
        JSON.parse(t.toolRequest.args).agent_name === 'browser_agent',
    );
    expect(browserCalls.length).toBeGreaterThan(0);
  });
});
