import { evalTest } from './test-helper.js';
import { expect } from 'vitest';

evalTest('USUALLY_PASSES', {
  suiteName: 'default',
  suiteType: 'behavioral',
  name: 'should create an all-day event using the optional date field',
  prompt:
    'Create an all-day event for 2026-05-20 titled "Company Retreat". Do not use a specific time.',
  setup: async (rig) => {
    rig.addTestMcpServer('workspace-server', 'google-workspace');
  },
  assert: async (rig) => {
    const toolLogs = rig.readToolLogs();
    console.log('TOOL LOGS:', JSON.stringify(toolLogs, null, 2));

    const createEventCall = toolLogs.find(
      (log) =>
        log.toolRequest.name === 'mcp_workspace-server_calendar.createEvent',
    );

    expect(createEventCall).toBeDefined();

    const args = JSON.parse(createEventCall!.toolRequest.args);

    expect(args?.start).toHaveProperty('date');
    expect(args?.start).not.toHaveProperty('dateTime');
    expect(args?.start?.date).toBe('2026-05-20');

    expect(args?.end).toHaveProperty('date');
    expect(args?.end).not.toHaveProperty('dateTime');
  },
});
