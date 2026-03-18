/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ScheduleWorkTool,
  ScheduleWorkInvocation,
  type ScheduleWorkParams,
} from './schedule-work.js';
import { WorkScheduler } from '../services/work-scheduler.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';

describe('ScheduleWorkTool', () => {
  let tool: ScheduleWorkTool;
  let scheduler: WorkScheduler;
  let mockMessageBus: MessageBus;
  const signal = new AbortController().signal;

  beforeEach(() => {
    vi.useFakeTimers();
    mockMessageBus = createMockMessageBus();
    scheduler = new WorkScheduler();
    tool = new ScheduleWorkTool(mockMessageBus, scheduler);
  });

  afterEach(() => {
    scheduler.dispose();
    vi.useRealTimers();
  });

  describe('validation', () => {
    it('should reject add without prompt', () => {
      const params: ScheduleWorkParams = {
        action: 'add',
        inMinutes: 5,
      };
      const result = tool.validateToolParams(params);
      expect(result).toContain('"prompt" is required');
    });

    it('should reject add with empty prompt', () => {
      const params: ScheduleWorkParams = {
        action: 'add',
        prompt: '   ',
        inMinutes: 5,
      };
      const result = tool.validateToolParams(params);
      expect(result).toContain('"prompt" is required');
    });

    it('should reject add without at or inMinutes', () => {
      const params: ScheduleWorkParams = {
        action: 'add',
        prompt: 'do something',
      };
      const result = tool.validateToolParams(params);
      expect(result).toContain('One of "at" or "inMinutes" is required');
    });

    it('should reject add with both at and inMinutes', () => {
      const params: ScheduleWorkParams = {
        action: 'add',
        prompt: 'do something',
        at: '2025-06-15T14:00:00',
        inMinutes: 5,
      };
      const result = tool.validateToolParams(params);
      expect(result).toContain('"at" and "inMinutes" are mutually exclusive');
    });

    it('should reject inMinutes <= 0', () => {
      const params: ScheduleWorkParams = {
        action: 'add',
        prompt: 'do something',
        inMinutes: 0,
      };
      const result = tool.validateToolParams(params);
      expect(result).toContain('"inMinutes" must be greater than 0');
    });

    it('should reject negative inMinutes', () => {
      const params: ScheduleWorkParams = {
        action: 'add',
        prompt: 'do something',
        inMinutes: -5,
      };
      const result = tool.validateToolParams(params);
      expect(result).toContain('"inMinutes" must be greater than 0');
    });

    it('should reject invalid date format for at', () => {
      const params: ScheduleWorkParams = {
        action: 'add',
        prompt: 'do something',
        at: 'not-a-date',
      };
      const result = tool.validateToolParams(params);
      expect(result).toContain('Invalid date format');
    });

    it('should reject cancel without id', () => {
      const params: ScheduleWorkParams = {
        action: 'cancel',
      };
      const result = tool.validateToolParams(params);
      expect(result).toContain('"id" is required');
    });

    it('should reject cancel with empty id', () => {
      const params: ScheduleWorkParams = {
        action: 'cancel',
        id: '   ',
      };
      const result = tool.validateToolParams(params);
      expect(result).toContain('"id" is required');
    });

    it('should accept valid add with inMinutes', () => {
      const params: ScheduleWorkParams = {
        action: 'add',
        prompt: 'do something',
        inMinutes: 5,
      };
      const result = tool.validateToolParams(params);
      expect(result).toBeNull();
    });

    it('should accept valid add with at', () => {
      const params: ScheduleWorkParams = {
        action: 'add',
        prompt: 'do something',
        at: '2025-06-15T14:00:00',
      };
      const result = tool.validateToolParams(params);
      expect(result).toBeNull();
    });

    it('should accept valid cancel with id', () => {
      const params: ScheduleWorkParams = {
        action: 'cancel',
        id: 'some-id',
      };
      const result = tool.validateToolParams(params);
      expect(result).toBeNull();
    });
  });

  describe('execute - add with inMinutes', () => {
    it('should call scheduler.addRelative and return confirmation', async () => {
      const addRelativeSpy = vi.spyOn(scheduler, 'addRelative');

      const result = await tool.buildAndExecute(
        { action: 'add', prompt: 'run tests', inMinutes: 10 },
        signal,
      );

      expect(addRelativeSpy).toHaveBeenCalledWith('run tests', 10);
      expect(result.llmContent).toContain('Scheduled item');
      expect(result.llmContent).toContain('Will fire at');
      expect(result.llmContent).toContain('Current time:');
      expect(result.returnDisplay).toContain('run tests');
    });
  });

  describe('execute - add with at', () => {
    it('should call scheduler.add with parsed Date and return confirmation', async () => {
      const addSpy = vi.spyOn(scheduler, 'add');

      const result = await tool.buildAndExecute(
        { action: 'add', prompt: 'deploy', at: '2025-06-15T14:00:00' },
        signal,
      );

      expect(addSpy).toHaveBeenCalledWith(
        'deploy',
        new Date('2025-06-15T14:00:00'),
      );
      expect(result.llmContent).toContain('Scheduled item');
      expect(result.returnDisplay).toContain('deploy');
    });

    it('should handle scheduling with an at time in the past', async () => {
      const pastDate = new Date(Date.now() - 60_000);
      const fireSpy = vi.fn();
      scheduler.on('fire', fireSpy);

      const result = await tool.buildAndExecute(
        { action: 'add', prompt: 'overdue task', at: pastDate.toISOString() },
        signal,
      );

      expect(result.llmContent).toContain('Scheduled item');
      expect(fireSpy).toHaveBeenCalledWith('overdue task');
    });
  });

  describe('execute - cancel', () => {
    it('should cancel a matching item and return confirmation', async () => {
      const item = scheduler.addRelative('cancel me', 10);

      const result = await tool.buildAndExecute(
        { action: 'cancel', id: item.id },
        signal,
      );

      expect(result.llmContent).toContain('Cancelled item');
      expect(result.llmContent).toContain('cancel me');
      expect(result.error).toBeUndefined();
      expect(scheduler.getPendingItems()).toHaveLength(0);
    });

    it('should cancel by ID prefix', async () => {
      const item = scheduler.addRelative('prefix cancel', 10);
      const prefix = item.id.slice(0, 8);

      const result = await tool.buildAndExecute(
        { action: 'cancel', id: prefix },
        signal,
      );

      expect(result.llmContent).toContain('Cancelled item');
      expect(result.llmContent).toContain('prefix cancel');
      expect(scheduler.getPendingItems()).toHaveLength(0);
    });

    it('should return error when item not found', async () => {
      const result = await tool.buildAndExecute(
        { action: 'cancel', id: 'nonexistent' },
        signal,
      );

      expect(result.llmContent).toContain('No pending item found');
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('No pending item found');
    });

    it('should cancel the first match when prefix matches multiple items', async () => {
      const item1 = scheduler.addRelative('first item', 10);
      scheduler.addRelative('second item', 20);

      const prefix = item1.id.slice(0, 4);

      const result = await tool.buildAndExecute(
        { action: 'cancel', id: prefix },
        signal,
      );

      expect(result.llmContent).toContain('Cancelled item');
      expect(scheduler.getPendingItems()).toHaveLength(1);
    });
  });

  describe('execute - unknown action', () => {
    it('should return error for unknown action', async () => {
      const invocation = new ScheduleWorkInvocation(
        { action: 'unknown' as ScheduleWorkParams['action'] },
        mockMessageBus,
        'schedule_work',
        'Schedule Work',
        scheduler,
      );

      const result = await invocation.execute(signal);

      expect(result.llmContent).toContain('Unknown action');
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Unknown action');
    });
  });

  describe('getDescription', () => {
    it('should return correct description for add with inMinutes', () => {
      const invocation = tool.build({
        action: 'add',
        prompt: 'run tests',
        inMinutes: 10,
      });
      expect(invocation.getDescription()).toBe(
        'Scheduling work to fire in 10 minutes.',
      );
    });

    it('should return correct description for add with at', () => {
      const invocation = tool.build({
        action: 'add',
        prompt: 'deploy',
        at: '2025-06-15T14:00:00',
      });
      expect(invocation.getDescription()).toBe(
        'Scheduling work to fire at 2025-06-15T14:00:00.',
      );
    });

    it('should return correct description for cancel', () => {
      const invocation = tool.build({
        action: 'cancel',
        id: 'abc123',
      });
      expect(invocation.getDescription()).toBe(
        'Cancelling scheduled item abc123.',
      );
    });
  });
});
