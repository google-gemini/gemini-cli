/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import { ClearcutDecodeError, ClearcutLogger } from './clearcut-logger.js';
import { Config } from '../../config/config.js';

function encodeVarint(value: number): Buffer {
  const bytes: number[] = [];
  let v = value >>> 0;
  while (v >= 0x80) {
    bytes.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return Buffer.from([8, ...bytes]);
}

describe('decodeLogResponse', () => {
  const logger = ClearcutLogger.getInstance({
    getUsageStatisticsEnabled: () => true,
  } as unknown as Config)!;

  it('decode a valid response', () => {
    const buf = encodeVarint(123);
    const result = logger.decodeLogResponse(buf);
    expect(result).toEqual({ nextRequestWaitMs: 123 });
  });

  it('ignores unknown fields gracefully', () => {
    const buf = Buffer.from([8, 123, 16, 200]);
    const result = logger.decodeLogResponse(buf);
    expect(result).toEqual({ nextRequestWaitMs: 123 });
  });

  it('thorws for empty buffer', () => {
    expect(() => logger.decodeLogResponse(Buffer.alloc(0))).toThrow(
      ClearcutDecodeError,
    );
  });

  it('throws for missing field', () => {
    expect(() => logger.decodeLogResponse(Buffer.from([0]))).toThrow(
      ClearcutDecodeError,
    );
  });

  it('thorws for unterminated varint', () => {
    const buf = Buffer.from([8, 0x80]);
    expect(() => logger.decodeLogResponse(buf)).toThrow(ClearcutDecodeError);
  });

  it('throws if wire type is incorrect', () => {
    const buf = Buffer.from([9, 123]);
    expect(() => logger.decodeLogResponse(buf)).toThrow(ClearcutDecodeError);
  });
});
