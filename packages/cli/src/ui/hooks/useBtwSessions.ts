/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createBtwAgentSession,
  getErrorMessage,
  type AgentEvent,
  type Config,
  type AgentSession,
} from '@google/gemini-cli-core';
import type { UseHistoryManagerReturn } from './useHistoryManager.js';
import type { HistoryItemWithoutId } from '../types.js';

interface ActiveBtwSession {
  prompt: string;
  text: string;
  errorText?: string;
}

function getEventText(event: AgentEvent<'message'>): string {
  return event.content
    .map((part) => {
      switch (part.type) {
        case 'text':
          return part.text;
        case 'thought':
          return part.thought;
        default:
          return '';
      }
    })
    .join('');
}

export function useBtwSessions(
  config: Config,
  addItem: UseHistoryManagerReturn['addItem'],
) {
  const [activeSessions, setActiveSessions] = useState<
    Record<string, ActiveBtwSession>
  >({});
  const sessionRefs = useRef<Map<string, AgentSession>>(new Map());

  useEffect(() => () => {
      for (const session of sessionRefs.current.values()) {
        void session.abort();
      }
      sessionRefs.current.clear();
    }, []);

  const startBtwSession = useCallback(
    async (prompt: string) => {
      const trimmedPrompt = prompt.trim();
      if (!trimmedPrompt) {
        addItem(
          {
            type: 'error',
            text: 'Usage: /btw <side question>',
          },
          Date.now(),
        );
        return;
      }

      let session: AgentSession;
      try {
        session = await createBtwAgentSession(config);
      } catch (error: unknown) {
        addItem(
          {
            type: 'error',
            text: `Failed to start /btw: ${getErrorMessage(error)}`,
          },
          Date.now(),
        );
        return;
      }

      const sessionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      sessionRefs.current.set(sessionId, session);
      setActiveSessions((current) => ({
        ...current,
        [sessionId]: {
          prompt: trimmedPrompt,
          text: '',
        },
      }));

      void (async () => {
        let finalText = '';
        let errorText: string | undefined;

        try {
          for await (const event of session.sendStream({
            message: {
              content: [{ type: 'text', text: trimmedPrompt }],
              displayContent: trimmedPrompt,
            },
          })) {
            if (event.type === 'message' && event.role === 'agent') {
              const chunk = getEventText(event);
              if (!chunk) {
                continue;
              }
              finalText += chunk;
              setActiveSessions((current) => ({
                ...current,
                [sessionId]: {
                  ...(current[sessionId] ?? {
                    prompt: trimmedPrompt,
                    text: '',
                  }),
                  text: finalText,
                },
              }));
            } else if (event.type === 'error') {
              errorText = event.message;
              setActiveSessions((current) => ({
                ...current,
                [sessionId]: {
                  ...(current[sessionId] ?? {
                    prompt: trimmedPrompt,
                    text: finalText,
                  }),
                  errorText,
                },
              }));
            } else if (
              event.type === 'agent_end' &&
              event.reason === 'aborted' &&
              !errorText
            ) {
              errorText = 'BTW request cancelled.';
            }
          }
        } catch (error: unknown) {
          errorText = getErrorMessage(error);
        } finally {
          sessionRefs.current.delete(sessionId);
          setActiveSessions((current) => {
            const next = { ...current };
            delete next[sessionId];
            return next;
          });
          const item: HistoryItemWithoutId = {
            type: 'btw',
            prompt: trimmedPrompt,
            text: finalText,
            errorText,
          };
          addItem(item, Date.now());
        }
      })();
    },
    [addItem, config],
  );

  const pendingHistoryItems = useMemo(
    () =>
      Object.values(activeSessions).map<HistoryItemWithoutId>((session) => ({
        type: 'btw',
        prompt: session.prompt,
        text: session.text,
        errorText: session.errorText,
      })),
    [activeSessions],
  );

  return {
    pendingHistoryItems,
    startBtwSession,
  };
}
