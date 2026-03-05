/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  runWithToolCallContext,
  getToolCallContext,
} from './toolCallContext.js';

describe('toolCallContext', () => {
  it('should store and retrieve tool call context', () => {
    const context = {
      callId: 'test-call-id',
      schedulerId: 'test-scheduler-id',
    };

    runWithToolCallContext(context, () => {
      const storedContext = getToolCallContext();
      expect(storedContext).toEqual(context);
    });
  });

  it('should return undefined when no context is set', () => {
    expect(getToolCallContext()).toBeUndefined();
  });

  it('should support nested contexts', () => {
    const parentContext = {
      callId: 'parent-call-id',
      schedulerId: 'parent-scheduler-id',
    };

    const childContext = {
      callId: 'child-call-id',
      schedulerId: 'child-scheduler-id',
      parentCallId: 'parent-call-id',
    };

    runWithToolCallContext(parentContext, () => {
      expect(getToolCallContext()).toEqual(parentContext);

      runWithToolCallContext(childContext, () => {
        expect(getToolCallContext()).toEqual(childContext);
      });

      expect(getToolCallContext()).toEqual(parentContext);
    });
  });

  it('should maintain isolation between parallel executions', async () => {
    const context1 = {
      callId: 'call-1',
      schedulerId: 'scheduler-1',
    };

    const context2 = {
      callId: 'call-2',
      schedulerId: 'scheduler-2',
    };

    const promise1 = new Promise<void>((resolve) => {
      runWithToolCallContext(context1, () => {
        setTimeout(() => {
          expect(getToolCallContext()).toEqual(context1);
          resolve();
        }, 10);
      });
    });

    const promise2 = new Promise<void>((resolve) => {
      runWithToolCallContext(context2, () => {
        setTimeout(() => {
          expect(getToolCallContext()).toEqual(context2);
          resolve();
        }, 5);
      });
    });

    await Promise.all([promise1, promise2]);
  });
});
