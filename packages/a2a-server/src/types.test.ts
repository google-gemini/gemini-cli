/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  CoderAgentEvent,
  getPersistedState,
  setPersistedState,
  METADATA_KEY,
  type PersistedStateMetadata,
  type PersistedTaskMetadata,
  type AgentSettings,
} from './types.js';

describe('types utilities', () => {
  describe('CoderAgentEvent enum', () => {
    it('should have ToolCallConfirmationEvent', () => {
      expect(CoderAgentEvent.ToolCallConfirmationEvent).toBe(
        'tool-call-confirmation',
      );
    });

    it('should have ToolCallUpdateEvent', () => {
      expect(CoderAgentEvent.ToolCallUpdateEvent).toBe('tool-call-update');
    });

    it('should have TextContentEvent', () => {
      expect(CoderAgentEvent.TextContentEvent).toBe('text-content');
    });

    it('should have StateChangeEvent', () => {
      expect(CoderAgentEvent.StateChangeEvent).toBe('state-change');
    });

    it('should have StateAgentSettingsEvent', () => {
      expect(CoderAgentEvent.StateAgentSettingsEvent).toBe('agent-settings');
    });

    it('should have ThoughtEvent', () => {
      expect(CoderAgentEvent.ThoughtEvent).toBe('thought');
    });
  });

  describe('getPersistedState', () => {
    it('should return persisted state when it exists', () => {
      const agentSettings: AgentSettings = {
        kind: CoderAgentEvent.StateAgentSettingsEvent,
        workspacePath: '/workspace',
      };

      const persistedState: PersistedStateMetadata = {
        _agentSettings: agentSettings,
        _taskState: 'submitted',
      };

      const metadata: PersistedTaskMetadata = {
        [METADATA_KEY]: persistedState,
        otherData: 'value',
      };

      const result = getPersistedState(metadata);

      expect(result).toEqual(persistedState);
      expect(result?._agentSettings).toEqual(agentSettings);
      expect(result?._taskState).toBe('submitted');
    });

    it('should return undefined when persisted state does not exist', () => {
      const metadata: PersistedTaskMetadata = {
        otherData: 'value',
      };

      const result = getPersistedState(metadata);

      expect(result).toBeUndefined();
    });

    it('should return undefined when metadata is empty', () => {
      const metadata: PersistedTaskMetadata = {};

      const result = getPersistedState(metadata);

      expect(result).toBeUndefined();
    });

    it('should return undefined when metadata is null/undefined', () => {
      expect(getPersistedState(null as unknown)).toBeUndefined();
      expect(getPersistedState(undefined as unknown)).toBeUndefined();
    });
  });

  describe('setPersistedState', () => {
    it('should set persisted state in metadata', () => {
      const agentSettings: AgentSettings = {
        kind: CoderAgentEvent.StateAgentSettingsEvent,
        workspacePath: '/workspace',
      };

      const persistedState: PersistedStateMetadata = {
        _agentSettings: agentSettings,
        _taskState: 'running',
      };

      const metadata: PersistedTaskMetadata = {
        existingKey: 'existingValue',
      };

      const result = setPersistedState(metadata, persistedState);

      expect(result).toEqual({
        existingKey: 'existingValue',
        [METADATA_KEY]: persistedState,
      });
    });

    it('should preserve existing metadata keys', () => {
      const persistedState: PersistedStateMetadata = {
        _agentSettings: {
          kind: CoderAgentEvent.StateAgentSettingsEvent,
          workspacePath: '/new',
        },
        _taskState: 'completed',
      };

      const metadata: PersistedTaskMetadata = {
        key1: 'value1',
        key2: 'value2',
        key3: { nested: 'object' },
      };

      const result = setPersistedState(metadata, persistedState);

      expect(result.key1).toBe('value1');
      expect(result.key2).toBe('value2');
      expect(result.key3).toEqual({ nested: 'object' });
      expect(result[METADATA_KEY]).toEqual(persistedState);
    });

    it('should overwrite existing persisted state', () => {
      const oldPersistedState: PersistedStateMetadata = {
        _agentSettings: {
          kind: CoderAgentEvent.StateAgentSettingsEvent,
          workspacePath: '/old',
        },
        _taskState: 'submitted',
      };

      const newPersistedState: PersistedStateMetadata = {
        _agentSettings: {
          kind: CoderAgentEvent.StateAgentSettingsEvent,
          workspacePath: '/new',
        },
        _taskState: 'running',
      };

      const metadata: PersistedTaskMetadata = {
        [METADATA_KEY]: oldPersistedState,
      };

      const result = setPersistedState(metadata, newPersistedState);

      expect(result[METADATA_KEY]).toEqual(newPersistedState);
      expect(result[METADATA_KEY]).not.toEqual(oldPersistedState);
    });

    it('should work with empty metadata', () => {
      const persistedState: PersistedStateMetadata = {
        _agentSettings: {
          kind: CoderAgentEvent.StateAgentSettingsEvent,
          workspacePath: '/workspace',
        },
        _taskState: 'submitted',
      };

      const result = setPersistedState({}, persistedState);

      expect(result).toEqual({
        [METADATA_KEY]: persistedState,
      });
    });

    it('should create a new object without mutating the original', () => {
      const persistedState: PersistedStateMetadata = {
        _agentSettings: {
          kind: CoderAgentEvent.StateAgentSettingsEvent,
          workspacePath: '/workspace',
        },
        _taskState: 'submitted',
      };

      const originalMetadata: PersistedTaskMetadata = {
        key: 'value',
      };

      const result = setPersistedState(originalMetadata, persistedState);

      expect(result).not.toBe(originalMetadata);
      expect(originalMetadata[METADATA_KEY]).toBeUndefined();
      expect(result[METADATA_KEY]).toEqual(persistedState);
    });
  });

  describe('METADATA_KEY constant', () => {
    it('should have correct value', () => {
      expect(METADATA_KEY).toBe('__persistedState');
    });
  });
});
