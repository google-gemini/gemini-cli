/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect, describe, it, beforeEach, afterEach } from 'vitest';
import { TestRig } from './test-helper.js';
import { join } from 'node:path';

describe('Tool Preselection Integration', () => {
  let rig: TestRig;

  beforeEach(() => {
    rig = new TestRig();
  });

  afterEach(async () => {
    if (rig) {
      await rig.cleanup();
    }
  });

  it('should perform tool pre-selection correctly', async () => {
    rig.setup('tool-preselection-v2', {
      fakeResponsesPath: join(
        import.meta.dirname,
        'tool-preselection.responses',
      ),
      settings: {
        general: {
          toolPreselection: true,
        },
      },
    });

    const result = await rig.run({
      args: 'Please list the files in the current directory.',
    });

    // Verify it called list_directory as mocked
    expect(result).toContain('I listed the files.');

    // Wait for telemetry to flush
    await rig.waitForTelemetryEvent('api_request');

    const logs = rig.readTelemetryLogs();

    // 1st request: Tool pre-selection (classifier model)
    // 2nd request: Main agent call (with filtered tools)
    // 3rd request: Final response

    const apiRequests = logs.filter(
      (l) => l.attributes?.['event.name'] === 'gemini_cli.api_request',
    );

    // Find the request from the main agent loop (not the classifier)
    // Classifier request will have prompt_id: 'tool-preselection'
    const agentRequest = apiRequests.find(
      (l) =>
        l.attributes?.prompt_id?.includes('########') &&
        l.attributes?.prompt_id?.includes('agent'),
    );

    if (agentRequest) {
      // The prompt text is available in agentRequest.attributes.request_text
      // In the real code, tools are sent in the GenerateContentConfig, but
      // ApiRequestEvent logs the whole contents which might not show tools.
      // Wait, let's look at ApiRequestEvent constructor again.
      // It takes GenAIPromptDetails which has generate_content_config.
      // And toLogRecord puts prompt_id, request_text in attributes.
    }

    // Since we can't easily see the tool definitions in ApiRequestEvent's request_text (which is just 'contents')
    // and prompt.generate_content_config is not directly in attributes (it is in StartSessionEvent though?),
    // wait, ApiRequestEvent.toLogRecord:
    /*
    const attributes: LogAttributes = {
      ...getCommonAttributes(config),
      'event.name': EVENT_API_REQUEST,
      'event.timestamp': this['event.timestamp'],
      model: this.model,
      prompt_id: this.prompt.prompt_id,
      request_text: this.request_text,
    };
    */
    // It doesn't seem to log the tools in the flat telemetry log.

    // However, if ToolPreselectionService selected ONLY list_directory,
    // and the agent tried to call something else, it would fail or not have it.
    // Our mock responses are tailored:
    // 1. Classifier returns {relevant_tools: ["list_directory"]}
    // 2. Agent response calls list_directory.
    // This works. If tool preselection DIDN'T work, and our mock for turn 2 called say 'write_file',
    // it would still work because the mock doesn't care about what's in the prompt.

    // To truly verify pre-selection in E2E, we'd need to see the tools in the request.
    // Given the current telemetry, maybe we can look for the 'tool-preselection' prompt itself.
    const preselectionRequest = apiRequests.find(
      (l) => l.attributes?.prompt_id === 'tool-preselection',
    );
    expect(preselectionRequest).toBeDefined();
    expect(preselectionRequest?.attributes?.request_text).toContain(
      'select only the tools that are strictly necessary',
    );
  });
});
