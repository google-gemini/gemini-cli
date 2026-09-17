/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  AgentTerminateMode,
  SubagentState,
  isSuccessfulTermination,
  getSubagentStateFromTermination,
  isSubagentProgress,
  isToolActivityError,
  getAgentCardLoadOptions,
  getRemoteAgentTargetUrl,
} from './types.js';

describe('isSuccessfulTermination', () => {
  it('should return true only for GOAL', () => {
    expect(isSuccessfulTermination(AgentTerminateMode.GOAL)).toBe(true);
  });

  it('should return false for MAX_TURNS', () => {
    expect(isSuccessfulTermination(AgentTerminateMode.MAX_TURNS)).toBe(false);
  });

  it('should return false for TIMEOUT', () => {
    expect(isSuccessfulTermination(AgentTerminateMode.TIMEOUT)).toBe(false);
  });

  it('should return false for ERROR', () => {
    expect(isSuccessfulTermination(AgentTerminateMode.ERROR)).toBe(false);
  });

  it('should return false for ABORTED', () => {
    expect(isSuccessfulTermination(AgentTerminateMode.ABORTED)).toBe(false);
  });

  it('should return false for ERROR_NO_COMPLETE_TASK_CALL', () => {
    expect(
      isSuccessfulTermination(AgentTerminateMode.ERROR_NO_COMPLETE_TASK_CALL),
    ).toBe(false);
  });
});

describe('getSubagentStateFromTermination', () => {
  it('should map GOAL to COMPLETED', () => {
    expect(getSubagentStateFromTermination(AgentTerminateMode.GOAL)).toBe(
      SubagentState.COMPLETED,
    );
  });

  it('should map ABORTED to CANCELLED', () => {
    expect(getSubagentStateFromTermination(AgentTerminateMode.ABORTED)).toBe(
      SubagentState.CANCELLED,
    );
  });

  it('should map MAX_TURNS to INCOMPLETE', () => {
    expect(getSubagentStateFromTermination(AgentTerminateMode.MAX_TURNS)).toBe(
      SubagentState.INCOMPLETE,
    );
  });

  it('should map TIMEOUT to INCOMPLETE', () => {
    expect(getSubagentStateFromTermination(AgentTerminateMode.TIMEOUT)).toBe(
      SubagentState.INCOMPLETE,
    );
  });

  it('should map ERROR to ERROR', () => {
    expect(getSubagentStateFromTermination(AgentTerminateMode.ERROR)).toBe(
      SubagentState.ERROR,
    );
  });

  it('should map ERROR_NO_COMPLETE_TASK_CALL to ERROR', () => {
    expect(
      getSubagentStateFromTermination(
        AgentTerminateMode.ERROR_NO_COMPLETE_TASK_CALL,
      ),
    ).toBe(SubagentState.ERROR);
  });
});

describe('SubagentState enum', () => {
  it('should include INCOMPLETE as a valid state', () => {
    expect(SubagentState.INCOMPLETE).toBe('incomplete');
  });

  it('should retain all existing states', () => {
    expect(SubagentState.RUNNING).toBe('running');
    expect(SubagentState.COMPLETED).toBe('completed');
    expect(SubagentState.ERROR).toBe('error');
    expect(SubagentState.CANCELLED).toBe('cancelled');
  });
});

describe('isSubagentProgress', () => {
  it('should return true for objects with isSubagentProgress: true', () => {
    expect(
      isSubagentProgress({
        isSubagentProgress: true,
        agentName: 'test',
        recentActivity: [],
      }),
    ).toBe(true);
  });

  it('should return false for null', () => {
    expect(isSubagentProgress(null)).toBe(false);
  });

  it('should return false for objects without the flag', () => {
    expect(isSubagentProgress({ agentName: 'test' })).toBe(false);
  });
});

describe('isToolActivityError', () => {
  it('should detect error objects', () => {
    expect(isToolActivityError({ isError: true })).toBe(true);
  });

  it('should return false for non-error objects', () => {
    expect(isToolActivityError({ isError: false })).toBe(false);
    expect(isToolActivityError(null)).toBe(false);
    expect(isToolActivityError('string')).toBe(false);
  });
});

describe('getAgentCardLoadOptions', () => {
  it('should prefer agentCardJson over agentCardUrl', () => {
    const result = getAgentCardLoadOptions({
      name: 'test',
      agentCardJson: '{}',
      agentCardUrl: 'http://example.com',
    });
    expect(result).toEqual({ type: 'json', json: '{}' });
  });

  it('should fall back to agentCardUrl', () => {
    const result = getAgentCardLoadOptions({
      name: 'test',
      agentCardUrl: 'http://example.com',
    });
    expect(result).toEqual({ type: 'url', url: 'http://example.com' });
  });

  it('should throw when neither is present', () => {
    expect(() => getAgentCardLoadOptions({ name: 'test' })).toThrow(
      "Remote agent 'test' has neither agentCardUrl nor agentCardJson",
    );
  });
});

describe('getRemoteAgentTargetUrl', () => {
  it('should return agentCardUrl when present', () => {
    expect(
      getRemoteAgentTargetUrl({
        name: 'test',
        agentCardUrl: 'http://example.com',
      }),
    ).toBe('http://example.com');
  });

  it('should parse URL from agentCardJson', () => {
    const json = JSON.stringify({ url: 'http://from-json.com' });
    expect(
      getRemoteAgentTargetUrl({ name: 'test', agentCardJson: json }),
    ).toBe('http://from-json.com');
  });

  it('should return undefined when no URL is available', () => {
    expect(getRemoteAgentTargetUrl({ name: 'test' })).toBeUndefined();
  });
});
