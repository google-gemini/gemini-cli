import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('CliHelpAgent Delegation', () => {
  evalTest('USUALLY_PASSES', {
    name: 'should delegate to cli_help agent for subagent creation questions',
    params: {
      settings: {
        experimental: {
          enableAgents: true,
        },
      },
    },
    prompt: 'Help me create a subagent in this project',
    timeout: 60000,
    assert: async (rig, _result) => {
      const toolLogs = rig.readToolLogs();
      const toolCallIndex = toolLogs.findIndex(
        (log) => log.toolRequest.name === 'cli_help',
      );
      expect(toolCallIndex).toBeGreaterThan(-1);
      expect(toolCallIndex).toBeLessThan(5); // Called within first 5 turns
    },
  });
});
