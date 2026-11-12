import { describe, expect } from 'vitest';
import { evalTest } from './test-helper.js';

describe('CliSelfKnowledge Accuracy', () => {
  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'should use get_cli_reference tool when asked about CLI flags',
    params: {
      settings: {
        experimental: {
          enableAgents: true,
        },
      },
    },
    prompt:
      'What is the correct flag for auto-approving all tool actions in Gemini CLI? I heard about --yolo but is that still the right way?',
    timeout: 60000,
    assert: async (rig, _result) => {
      const toolLogs = rig.readToolLogs();

      // The orchestrator should delegate to cli_help
      const delegateIndex = toolLogs.findIndex((log) => {
        if (log.toolRequest.name === 'invoke_agent') {
          try {
            const args = JSON.parse(log.toolRequest.args);
            return args.agent_name === 'cli_help';
          } catch {
            return false;
          }
        }
        return false;
      });
      expect(delegateIndex).toBeGreaterThan(-1);

      // Inside the subagent, get_cli_reference should be called
      const refToolCall = toolLogs.findIndex(
        (log) => log.toolRequest.name === 'get_cli_reference',
      );
      expect(refToolCall).toBeGreaterThan(-1);
    },
  });

  evalTest('USUALLY_PASSES', {
    suiteName: 'default',
    suiteType: 'behavioral',
    name: 'should use get_cli_reference tool when asked about keyboard shortcuts',
    params: {
      settings: {
        experimental: {
          enableAgents: true,
        },
      },
    },
    prompt: 'What keyboard shortcut toggles YOLO mode in Gemini CLI?',
    timeout: 60000,
    assert: async (rig, _result) => {
      const toolLogs = rig.readToolLogs();
      const refToolCall = toolLogs.findIndex(
        (log) => log.toolRequest.name === 'get_cli_reference',
      );
      expect(refToolCall).toBeGreaterThan(-1);
    },
  });
});
