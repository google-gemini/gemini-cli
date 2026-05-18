/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleAuth } from 'google-auth-library';
import type { Config } from '../config/config.js';
import { AgentSession } from './agent-session.js';
import type {
  AgentEvent,
  AgentProtocol,
  AgentSend,
  ContentPart,
  Unsubscribe,
} from './types.js';
import { fetchWithTimeout } from '../utils/fetch.js';
import { debugLogger } from '../utils/debugLogger.js';

export interface EnterpriseAgentSessionDeps {
  config: Config;
  promptId?: string;
  streamId?: string;
}

export class EnterpriseAgentProtocol implements AgentProtocol {
  private _events: AgentEvent[] = [];
  private _subscribers = new Set<(event: AgentEvent) => void>();
  private _activeStreamId?: string;
  private _abortController = new AbortController();
  private _streamCounter = 0;
  private _eventCounter = 0;

  private readonly _config: Config;
  private _sessionResourceName?: string;

  constructor(deps: EnterpriseAgentSessionDeps) {
    this._config = deps.config;
    this._sessionResourceName = deps.streamId;
  }

  get events(): readonly AgentEvent[] {
    return this._events;
  }

  subscribe(callback: (event: AgentEvent) => void): Unsubscribe {
    this._subscribers.add(callback);
    return () => {
      this._subscribers.delete(callback);
    };
  }

  async abort(): Promise<void> {
    this._abortController.abort();
  }

  async send(payload: AgentSend): Promise<{ streamId: string }> {
    const message = 'message' in payload ? payload.message : undefined;
    if (!message) {
      throw new Error(
        'EnterpriseAgentSession.send() only supports message sends for the moment.',
      );
    }

    if (this._activeStreamId) {
      throw new Error(
        'EnterpriseAgentSession.send() cannot be called while a stream is active.',
      );
    }

    this._beginNewStream();
    const streamId = this._activeStreamId!;

    const userMessage = this._makeUserMessageEvent(
      message.content,
      message.displayContent,
      payload._meta,
    );
    this._emit([userMessage]);

    this._scheduleRunLoop(message.content.map(p => p.type === 'text' ? p.text : '').join(' '));

    return { streamId };
  }

  private _beginNewStream(): void {
    this._streamCounter++;
    this._eventCounter = 0;
    this._abortController = new AbortController();
    this._activeStreamId = `enterprise-stream-${this._streamCounter}`;
  }

  private _scheduleRunLoop(queryText: string): void {
    setTimeout(() => {
      void this._runLoopInBackground(queryText);
    }, 0);
  }

  private async _runLoopInBackground(queryText: string): Promise<void> {
    this._ensureAgentStart();

    try {
      const enterpriseConfig = this._config.getEnterpriseConfig();
      if (!enterpriseConfig?.projectId || !enterpriseConfig?.engineId) {
        throw new Error('Gemini Enterprise is not fully configured. projectId and engineId are required in ~/.gemini/settings.json.');
      }

      const projectId = enterpriseConfig.projectId;
      const engineId = enterpriseConfig.engineId;
      const location = enterpriseConfig.location ?? 'global';

      // Get Auth Token
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform'],
      });
      const client = await auth.getClient();
      const tokenResponse = await client.getAccessToken();
      const token = tokenResponse.token;

      if (!token) {
        throw new Error('Failed to retrieve ADC access token.');
      }

      const endpoint = `https://discoveryengine.googleapis.com/v1alpha/projects/${projectId}/locations/${location}/collections/default_collection/engines/${engineId}/assistants/default_assistant:streamAssist`;

      const requestBody = {
        query: {
          text: queryText,
        },
        session: this._sessionResourceName || '-',
        assistSkippingMode: 'REQUEST_ASSIST',
        toolsSpec: {
          vertexAiSearchSpec: {},
          webGroundingSpec: {},
        },
      };

      debugLogger.debug(`Calling Enterprise API: ${endpoint}`);
      debugLogger.debug(`Request Body: ${JSON.stringify(requestBody)}`);

      const response = await fetchWithTimeout(endpoint, 60000, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: this._abortController.signal,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Enterprise API call failed with status ${response.status}: ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Response body is empty.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let braceCount = 0;
      let insideString = false;
      let escapeNext = false;
      let objectStart = -1;
      let lastScannedIndex = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        for (let i = lastScannedIndex; i < buffer.length; i++) {
          const char = buffer[i];

          if (escapeNext) {
            escapeNext = false;
            lastScannedIndex = i + 1;
            continue;
          }

          if (char === '\\') {
            escapeNext = true;
            lastScannedIndex = i + 1;
            continue;
          }

          if (char === '"') {
            insideString = !insideString;
            lastScannedIndex = i + 1;
            continue;
          }

          if (!insideString) {
            if (char === '{') {
              if (braceCount === 0) {
                objectStart = i;
              }
              braceCount++;
            } else if (char === '}') {
              braceCount--;
              if (braceCount === 0 && objectStart !== -1) {
                const objectStr = buffer.substring(objectStart, i + 1);
                await this._parseAndEmitChunk(objectStr);
                // Remove parsed object from buffer and reset index
                buffer = buffer.substring(i + 1);
                i = -1;
                lastScannedIndex = 0;
                objectStart = -1;
              }
            }
          }
          lastScannedIndex = i + 1;
        }
      }

      this._emit([this._makeAgentEndEvent('completed')]);

    } catch (err: unknown) {
      if (this._abortController.signal.aborted) {
        this._emit([this._makeAgentEndEvent('aborted')]);
      } else {
        const message = err instanceof Error ? err.message : String(err);
        this._emit([
          this._makeErrorEvent({
            status: 'INTERNAL',
            message,
            fatal: true,
          }),
        ]);
        this._emit([this._makeAgentEndEvent('failed')]);
      }
    } finally {
      this._activeStreamId = undefined;
    }
  }

  private _ensureAgentStart(): void {
    // We can emit agent_start early or wait until we get the first chunk.
    // For now, emit it at the start of background run.
    this._emit([this._makeAgentStartEvent()]);
  }

  private async _parseAndEmitChunk(line: string): Promise<void> {
    try {
      const response = JSON.parse(line);
      debugLogger.debug(`Received Enterprise Chunk: ${JSON.stringify(response)}`);

      if (response.sessionInfo?.session) {
        this._sessionResourceName = response.sessionInfo.session;
        debugLogger.debug(`Session updated: ${this._sessionResourceName}`);
      }

      const answer = response.answer;
      if (answer) {
        if (answer.replies) {
          for (const reply of answer.replies) {
            if (reply.groundedContent?.content) {
              const content = reply.groundedContent.content;
              
              // Handle Thought
              if (content.thought) {
                if (content.text) {
                  this._emit([
                    this._makeMessageEvent('agent', [
                      { type: 'thought', thought: content.text }
                    ])
                  ]);
                }
              } 
              // Handle Tool Use (Executable Code)
              else if (content.executableCode) {
                this._emit([
                  this._makeToolRequestEvent({
                    requestId: `ent-tool-${Date.now()}`,
                    name: 'python_interpreter',
                    args: { code: content.executableCode.code },
                    display: {
                      name: 'Python Interpreter',
                      description: 'Executing code server-side',
                    }
                  })
                ]);
              }
              // Handle Tool Response (Code Execution Result)
              else if (content.codeExecutionResult) {
                this._emit([
                  this._makeToolResponseEvent({
                    requestId: `ent-tool-${Date.now()}`,
                    name: 'python_interpreter',
                    content: [{ type: 'text', text: content.codeExecutionResult.output || '' }],
                    isError: content.codeExecutionResult.outcome === 'OUTCOME_FAILED',
                  })
                ]);
              }
              // Handle standard Text
              else if (content.text) {
                this._emit([
                  this._makeMessageEvent('agent', [
                    { type: 'text', text: content.text }
                  ])
                ]);
            }
            }

            if (reply.immersiveArtifact) {
              for (const artifact of reply.immersiveArtifact) {
                if (artifact.docArtifact?.text) {
                  this._emit([
                    this._makeMessageEvent('agent', [
                      { type: 'text', text: artifact.docArtifact.text }
                    ])
                  ]);
                }
              }
            }
          }
        }
      }
    } catch (e) {
      debugLogger.error(`Failed to parse line: ${line}`, e);
    }
  }

  private _emit(events: AgentEvent[]): void {
    if (events.length === 0) return;

    const subscribers = [...this._subscribers];
    for (const event of events) {
      this._events.push(event);
      for (const subscriber of subscribers) {
        subscriber(event);
      }
    }
  }

  private _nextEventFields() {
    return {
      id: `${this._activeStreamId}-${this._eventCounter++}`,
      timestamp: new Date().toISOString(),
      streamId: this._activeStreamId!,
    };
  }

  private _makeUserMessageEvent(
    content: ContentPart[],
    displayContent?: string,
    meta?: Record<string, unknown>,
  ): AgentEvent<'message'> {
    const eventContent: ContentPart[] = displayContent
      ? [{ type: 'text', text: displayContent }]
      : content;
    return {
      ...this._nextEventFields(),
      type: 'message',
      role: 'user',
      content: eventContent,
      ...(meta ? { _meta: meta } : {}),
    };
  }

  private _makeMessageEvent(
    role: 'agent' | 'user' | 'developer',
    content: ContentPart[],
  ): AgentEvent<'message'> {
    return {
      ...this._nextEventFields(),
      type: 'message',
      role,
      content,
    };
  }

  private _makeAgentStartEvent(): AgentEvent<'agent_start'> {
    return {
      ...this._nextEventFields(),
      type: 'agent_start',
    };
  }

  private _makeAgentEndEvent(reason: string): AgentEvent<'agent_end'> {
    return {
      ...this._nextEventFields(),
      type: 'agent_end',
      reason,
    };
  }

  private _makeErrorEvent(payload: Omit<AgentEvent<'error'>, 'id' | 'timestamp' | 'streamId' | 'type'>): AgentEvent<'error'> {
    return {
      ...this._nextEventFields(),
      type: 'error',
      ...payload,
    };
  }

  private _makeToolRequestEvent(payload: Omit<AgentEvent<'tool_request'>, 'id' | 'timestamp' | 'streamId' | 'type'>): AgentEvent<'tool_request'> {
    return {
      ...this._nextEventFields(),
      type: 'tool_request',
      ...payload,
    };
  }

  private _makeToolResponseEvent(payload: Omit<AgentEvent<'tool_response'>, 'id' | 'timestamp' | 'streamId' | 'type'>): AgentEvent<'tool_response'> {
    return {
      ...this._nextEventFields(),
      type: 'tool_response',
      ...payload,
    };
  }
}

export class EnterpriseAgentSession extends AgentSession {
  constructor(deps: EnterpriseAgentSessionDeps) {
    super(new EnterpriseAgentProtocol(deps));
  }
}
