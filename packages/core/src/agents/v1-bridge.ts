/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Direct gRPC implementation for A2A V1 protocol.
 *
 * IMPORTANT: This bridge is a TEMPORARY measure. It exists because the current version
 * of the @a2a-js/sdk (v0.3.x) does not yet support the V1 protocol (specifically the
 * 'tenant' field at Tag 1 and 'Message' at Tag 2).
 *
 * This file should be removed and replaced with standard SDK calls once the SDK
 * implements full V1 protocol support.
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { v4 as uuidv4 } from 'uuid';
import type {
  Message,
  Task,
  TaskStatusUpdateEvent,
  TaskArtifactUpdateEvent,
} from '@a2a-js/sdk';
import { getGrpcCredentials } from './a2aUtils.js';

export type SendMessageResult =
  | Message
  | Task
  | TaskStatusUpdateEvent
  | TaskArtifactUpdateEvent;

export interface GrpcV1Service extends grpc.Client {
  SendStreamingMessage(
    request: unknown,
  ): grpc.ClientReadableStream<V1StreamResponse>;
}

export interface V1Part {
  text?: string | { text: string };
}

export interface V1Message {
  messageId: string;
  contextId?: string;
  taskId?: string;
  role: number | string;
  parts: V1Part[];
}

export interface V1StatusUpdate {
  taskId?: string;
  status?: {
    state?: number;
    message?: Message;
  };
}

export interface V1StreamResponse {
  message?: V1Message;
  statusUpdate?: V1StatusUpdate;
}

const packageDefinition = protoLoader.fromJSON({
  nested: {
    lf: {
      nested: {
        a2a: {
          nested: {
            v1: {
              nested: {
                A2AService: {
                  methods: {
                    SendStreamingMessage: {
                      requestType: 'SendMessageRequest',
                      responseType: 'StreamResponse',
                      responseStream: true,
                      comment: '',
                    },
                  },
                },

                SendMessageRequest: {
                  fields: {
                    tenant: { type: 'string', id: 1 },
                    message: { type: 'Message', id: 2 },
                  },
                },
                Message: {
                  fields: {
                    messageId: { type: 'string', id: 1 },
                    contextId: { type: 'string', id: 2 },
                    taskId: { type: 'string', id: 3 },
                    role: { type: 'int32', id: 4 },
                    parts: { rule: 'repeated', type: 'Part', id: 5 },
                  },
                },
                Part: {
                  oneofs: {
                    content: {
                      oneof: ['text'],
                    },
                  },
                  fields: {
                    text: { type: 'string', id: 1 },
                  },
                },
                StreamResponse: {
                  oneofs: {
                    payload: {
                      oneof: [
                        'task',
                        'message',
                        'statusUpdate',
                        'artifactUpdate',
                      ],
                    },
                  },
                  fields: {
                    task: { type: 'Task', id: 1 },
                    message: { type: 'Message', id: 2 },
                    statusUpdate: {
                      type: 'TaskStatusUpdateEvent',
                      id: 3,
                    },
                    artifactUpdate: {
                      type: 'TaskArtifactUpdateEvent',
                      id: 4,
                    },
                  },
                },
                Task: {
                  fields: {
                    id: { type: 'string', id: 1 },
                  },
                },
                TaskStatusUpdateEvent: {
                  fields: {
                    taskId: { type: 'string', id: 1 },
                    status: { type: 'TaskStatus', id: 3 },
                  },
                },
                TaskStatus: {
                  fields: {
                    state: { type: 'int32', id: 2 },
                  },
                },
                TaskArtifactUpdateEvent: {
                  fields: {
                    taskId: { type: 'string', id: 1 },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
const proto = grpc.loadPackageDefinition(packageDefinition) as unknown as {
  lf: {
    a2a: {
      v1: {
        A2AService: new (
          url: string,
          creds: grpc.ChannelCredentials,
        ) => GrpcV1Service;
      };
    };
  };
};

/**
 * Direct gRPC implementation for A2A V1 agents.
 * Bypasses SDK limitations for V1 protocol specifics.
 */
export async function* sendV1MessageStream(
  url: string,
  message: string,
  options?: { contextId?: string; taskId?: string; signal?: AbortSignal },
): AsyncIterable<SendMessageResult> {
  const client = new proto.lf.a2a.v1.A2AService(url, getGrpcCredentials(url));

  const request = {
    tenant: '',
    message: {
      messageId: uuidv4(),
      contextId: options?.contextId || '',
      taskId: options?.taskId || '',
      role: 1, // USER
      parts: [{ text: message }],
    },
  };

  const call = client.SendStreamingMessage(request);

  const queue: SendMessageResult[] = [];
  let done = false;
  let error: Error | null = null;
  let resolveNext: (() => void) | null = null;

  call.on('data', (data: V1StreamResponse) => {
    // Map the V1 response back to the SDK's expected format.
    const msg = data.message || data.statusUpdate?.status?.message;

    if (msg) {
      queue.push({
        kind: 'message',
        id: msg.messageId,
        messageId: msg.messageId,
        role: 'agent',
        parts:
          msg.parts?.map((p: V1Part) => ({
            kind: 'text',
            text: typeof p.text === 'string' ? p.text : p.text?.text || '',
          })) || [],
      } as Message);
    } else if (data.statusUpdate) {
      queue.push({
        kind: 'status-update',
        taskId: data.statusUpdate.taskId || '',
        contextId: options?.contextId || '',
        final: false,
        status: {
          state:
            data.statusUpdate.status?.state === 2 ? 'completed' : 'working',
        },
      });
    }

    if (resolveNext) resolveNext();
  });

  call.on('error', (err: Error) => {
    error = err;
    done = true;
    if (resolveNext) resolveNext();
  });

  call.on('end', () => {
    done = true;
    if (resolveNext) resolveNext();
  });

  if (options?.signal) {
    options.signal.addEventListener('abort', () => {
      call.cancel();
    });
  }

  while (!done || queue.length > 0) {
    if (queue.length === 0 && !done) {
      await new Promise<void>((r) => (resolveNext = r));
      resolveNext = null;
    }
    if (error) {
      throw error;
    }
    while (queue.length > 0) {
      yield queue.shift()!;
    }
  }
}
