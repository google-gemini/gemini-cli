/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DapRequest {
  seq: number;
  type: 'request';
  command: string;
  arguments?: Record<string, unknown>;
}

export interface DapResponseSuccess<TBody = unknown> {
  seq: number;
  type: 'response';
  request_seq: number;
  success: true;
  command: string;
  body?: TBody;
}

export interface DapResponseError {
  seq: number;
  type: 'response';
  request_seq: number;
  success: false;
  command: string;
  message: string;
  body?: unknown;
}

export type DapResponse<TBody = unknown> =
  | DapResponseSuccess<TBody>
  | DapResponseError;

export interface DapEvent<TBody = unknown> {
  seq: number;
  type: 'event';
  event: string;
  body?: TBody;
}

export type DapMessage = DapRequest | DapResponse | DapEvent;

export interface DapTransport {
  start(): Promise<void>;
  stop(): Promise<void>;
  send(payload: string): Promise<void>;
  onData(handler: (chunk: string) => void): void;
  onExit(handler: (code: number | null, signal: string | null) => void): void;
}

export interface DapRequestOptions {
  signal?: AbortSignal;
}

export class DapRequestError extends Error {
  constructor(
    message: string,
    readonly command: string,
    readonly requestSeq: number,
  ) {
    super(message);
    this.name = 'DapRequestError';
  }
}

export function isDapResponse(value: unknown): value is DapResponse {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const maybe = value as Partial<DapResponse>;
  return (
    maybe.type === 'response' &&
    typeof maybe.request_seq === 'number' &&
    typeof maybe.command === 'string' &&
    typeof maybe.success === 'boolean'
  );
}

export function isDapEvent(value: unknown): value is DapEvent {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const maybe = value as Partial<DapEvent>;
  return (
    maybe.type === 'event' &&
    typeof maybe.seq === 'number' &&
    typeof maybe.event === 'string'
  );
}
