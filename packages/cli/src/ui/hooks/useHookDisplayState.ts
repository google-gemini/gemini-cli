/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import {
  coreEvents,
  CoreEvent,
  type HookStartPayload,
  type HookEndPayload,
} from '@google/gemini-cli-core';
import { type ActiveHook } from '../types.js';
import { WARNING_PROMPT_DURATION_MS } from '../constants.js';

export const useHookDisplayState = () => {
  const [activeHooks, setActiveHooks] = useState<ActiveHook[]>([]);

  // Track start times independently of render state to calculate duration in event handlers
  // Key: `${hookName}:${eventName}` -> Stack of StartTimes (FIFO)
  const hookStartTimes = useRef<Map<string, number[]>>(new Map());

  // Track active timeouts to clear them on unmount
  const timeouts = useRef<Set<NodeJS.Timeout>>(new Set());

  useEffect(() => {
    const activeTimeouts = timeouts.current;
    const startTimes = hookStartTimes.current;

    const handleHookStart = (payload: HookStartPayload) => {
      const key = `${payload.hookName}:${payload.eventName}`;
      const now = Date.now();

      // Add start time to ref
      if (!startTimes.has(key)) {
        startTimes.set(key, []);
      }
      startTimes.get(key)!.push(now);

      setActiveHooks((prev) => [
        ...prev,
        {
          name: payload.hookName,
          eventName: payload.eventName,
          index: payload.hookIndex,
          total: payload.totalHooks,
        },
      ]);
    };

    const handleHookEnd = (payload: HookEndPayload) => {
      const key = `${payload.hookName}:${payload.eventName}`;
      const starts = startTimes.get(key);
      const startTime = starts?.shift(); // Get the earliest start time for this hook type

      // Cleanup empty arrays in map
      if (starts && starts.length === 0) {
        startTimes.delete(key);
      }

      const now = Date.now();
      // Default to immediate removal if start time not found (defensive)
      const elapsed = startTime ? now - startTime : WARNING_PROMPT_DURATION_MS;
      const remaining = WARNING_PROMPT_DURATION_MS - elapsed;

      const removeHook = () => {
        setActiveHooks((prev) => {
          const index = prev.findIndex(
            (h) =>
              h.name === payload.hookName && h.eventName === payload.eventName,
          );
          if (index === -1) return prev;
          const newHooks = [...prev];
          newHooks.splice(index, 1);
          return newHooks;
        });
      };

      if (remaining > 0) {
        const timeoutId = setTimeout(() => {
          removeHook();
          activeTimeouts.delete(timeoutId);
        }, remaining);
        activeTimeouts.add(timeoutId);
      } else {
        removeHook();
      }
    };

    coreEvents.on(CoreEvent.HookStart, handleHookStart);
    coreEvents.on(CoreEvent.HookEnd, handleHookEnd);

    return () => {
      coreEvents.off(CoreEvent.HookStart, handleHookStart);
      coreEvents.off(CoreEvent.HookEnd, handleHookEnd);
      // Clear all pending timeouts
      activeTimeouts.forEach(clearTimeout);
      activeTimeouts.clear();
    };
  }, []);

  return activeHooks;
};
