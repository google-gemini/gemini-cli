/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import * as https from 'node:https';
import { EventEmitter } from 'node:events';
import {
  getErrorMessage,
  validateUrlDestination,
} from '@google/gemini-cli-core';
import { fetchJson, getGitHubToken } from './github_fetch.js';
import type { ClientRequest, IncomingMessage } from 'node:http';

vi.mock('node:https');
vi.mock('@google/gemini-cli-core', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@google/gemini-cli-core')>();
  return {
    ...actual,
    validateUrlDestination: vi.fn(),
    // Pass-through spy: lets tests assert that no extra errors are built.
    getErrorMessage: vi.fn(actual.getErrorMessage),
  };
});

describe('getGitHubToken', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return the token if GITHUB_TOKEN is set', () => {
    vi.stubEnv('GITHUB_TOKEN', 'test-token');
    expect(getGitHubToken()).toBe('test-token');
  });

  it('should return undefined if GITHUB_TOKEN is not set', () => {
    // Must be truly unset: an empty string would be returned as-is.
    vi.stubEnv('GITHUB_TOKEN', undefined);
    expect(getGitHubToken()).toBeUndefined();
  });
});

describe('fetchJson', () => {
  const getMock = vi.mocked(https.get);
  const validateUrlDestinationMock = vi.mocked(validateUrlDestination);
  const getErrorMessageMock = vi.mocked(getErrorMessage);

  beforeEach(() => {
    validateUrlDestinationMock.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it('should fetch and parse JSON successfully', async () => {
    getMock.mockImplementationOnce((_url, _options, callback) => {
      const res = new EventEmitter() as IncomingMessage;
      res.statusCode = 200;
      (callback as (res: IncomingMessage) => void)(res);
      res.emit('data', Buffer.from('{"foo":'));
      res.emit('data', Buffer.from('"bar"}'));
      res.emit('end');
      return new EventEmitter() as ClientRequest;
    });
    await expect(fetchJson('https://example.com/data.json')).resolves.toEqual({
      foo: 'bar',
    });
  });

  it('should handle redirects (301 and 302)', async () => {
    // Test 302
    getMock.mockImplementationOnce((_url, _options, callback) => {
      const res = new EventEmitter() as IncomingMessage;
      res.statusCode = 302;
      res.headers = { location: 'https://example.com/final' };
      res.resume = vi.fn();
      (callback as (res: IncomingMessage) => void)(res);
      res.emit('end');
      return new EventEmitter() as ClientRequest;
    });
    getMock.mockImplementationOnce((url, _options, callback) => {
      expect(url).toBe('https://example.com/final');
      const res = new EventEmitter() as IncomingMessage;
      res.statusCode = 200;
      (callback as (res: IncomingMessage) => void)(res);
      res.emit('data', Buffer.from('{"success": true}'));
      res.emit('end');
      return new EventEmitter() as ClientRequest;
    });

    await expect(fetchJson('https://example.com/redirect')).resolves.toEqual({
      success: true,
    });

    // Test 301
    getMock.mockImplementationOnce((_url, _options, callback) => {
      const res = new EventEmitter() as IncomingMessage;
      res.statusCode = 301;
      res.headers = { location: 'https://example.com/final-permanent' };
      res.resume = vi.fn();
      (callback as (res: IncomingMessage) => void)(res);
      res.emit('end');
      return new EventEmitter() as ClientRequest;
    });
    getMock.mockImplementationOnce((url, _options, callback) => {
      expect(url).toBe('https://example.com/final-permanent');
      const res = new EventEmitter() as IncomingMessage;
      res.statusCode = 200;
      (callback as (res: IncomingMessage) => void)(res);
      res.emit('data', Buffer.from('{"permanent": true}'));
      res.emit('end');
      return new EventEmitter() as ClientRequest;
    });

    await expect(
      fetchJson('https://example.com/redirect-perm'),
    ).resolves.toEqual({ permanent: true });
  });

  it('should reject when URL destination validation fails (SSRF protection)', async () => {
    validateUrlDestinationMock.mockResolvedValueOnce(false);

    await expect(
      fetchJson('http://169.254.169.254/latest/meta-data/'),
    ).rejects.toThrow(
      'Access to blocked or private host http://169.254.169.254/latest/meta-data/ is not allowed.',
    );
    expect(getMock).not.toHaveBeenCalled();
  });

  it('should reject when redirect destination fails SSRF validation', async () => {
    validateUrlDestinationMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    getMock.mockImplementationOnce((_url, _options, callback) => {
      const res = new EventEmitter() as IncomingMessage;
      res.statusCode = 302;
      res.headers = { location: 'http://127.0.0.1:8080/internal' };
      res.resume = vi.fn();
      (callback as (res: IncomingMessage) => void)(res);
      res.emit('end');
      return new EventEmitter() as ClientRequest;
    });

    await expect(fetchJson('https://example.com/redirect')).rejects.toThrow(
      'Access to blocked or private host http://127.0.0.1:8080/internal is not allowed.',
    );
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      event: 'error',
      trigger: (req: ClientRequest) =>
        req.emit('error', new Error('socket hang up')),
      expectedDestroyCalls: 0,
    },
    {
      event: 'timeout',
      trigger: (req: ClientRequest) => req.emit('timeout'),
      // The original socket is still released; only its rejection is suppressed.
      expectedDestroyCalls: 1,
    },
  ])(
    'should ignore a late $event of the original request once a redirect has started',
    async ({ trigger, expectedDestroyCalls }) => {
      const destroyMock = vi.fn();
      const originalReq = Object.assign(new EventEmitter(), {
        destroy: destroyMock,
      }) as unknown as ClientRequest;
      getMock.mockImplementationOnce((_url, _options, callback) => {
        const res = new EventEmitter() as IncomingMessage;
        res.statusCode = 302;
        res.headers = { location: 'https://example.com/final' };
        res.resume = vi.fn();
        queueMicrotask(() => {
          (callback as (res: IncomingMessage) => void)(res);
        });
        return originalReq;
      });
      getMock.mockImplementationOnce((_url, _options, callback) => {
        // The redirect request is now in flight while the original one fails.
        trigger(originalReq);
        queueMicrotask(() => {
          const res = new EventEmitter() as IncomingMessage;
          res.statusCode = 200;
          (callback as (res: IncomingMessage) => void)(res);
          res.emit('data', Buffer.from('{"redirected": true}'));
          res.emit('end');
        });
        return new EventEmitter() as ClientRequest;
      });

      await expect(fetchJson('https://example.com/redirect')).resolves.toEqual({
        redirected: true,
      });
      expect(destroyMock).toHaveBeenCalledTimes(expectedDestroyCalls);
    },
  );

  it('should reject on non-200/30x status code and drain the response', async () => {
    const resumeMock = vi.fn();
    getMock.mockImplementationOnce((_url, _options, callback) => {
      const res = new EventEmitter() as IncomingMessage;
      res.statusCode = 404;
      res.resume = resumeMock;
      (callback as (res: IncomingMessage) => void)(res);
      res.emit('end');
      return new EventEmitter() as ClientRequest;
    });

    await expect(fetchJson('https://example.com/error')).rejects.toThrow(
      'Request failed with status code 404',
    );
    expect(resumeMock).toHaveBeenCalledOnce();
  });

  it('should reject on request error', async () => {
    const error = new Error('Network error');
    getMock.mockImplementationOnce(() => {
      const req = new EventEmitter() as ClientRequest;
      queueMicrotask(() => {
        req.emit('error', error);
      });
      return req;
    });

    await expect(fetchJson('https://example.com/error')).rejects.toThrow(
      'Network error',
    );
  });

  it('should destroy request and reject on request timeout', async () => {
    const destroyMock = vi.fn();
    getMock.mockImplementationOnce((_url, options) => {
      expect(options).toEqual(
        expect.objectContaining({
          timeout: 30000,
        }),
      );
      const req = Object.assign(new EventEmitter(), {
        destroy: destroyMock,
      }) as unknown as ClientRequest;
      queueMicrotask(() => {
        req.emit('timeout');
        // Destroying a real request makes Node emit a follow-up error.
        req.emit('error', new Error('socket hang up'));
      });
      return req;
    });

    await expect(fetchJson('https://example.com/slow')).rejects.toThrow(
      'Request timed out after 30000ms',
    );
    expect(destroyMock).toHaveBeenCalledOnce();
  });

  it('should reject with contextual error on malformed JSON', async () => {
    getMock.mockImplementationOnce((_url, _options, callback) => {
      const res = new EventEmitter() as IncomingMessage;
      res.statusCode = 200;
      queueMicrotask(() => {
        (callback as (res: IncomingMessage) => void)(res);
        res.emit('data', Buffer.from('{invalid'));
        res.emit('end');
      });
      return new EventEmitter() as ClientRequest;
    });

    await expect(fetchJson('https://example.com/invalid.json')).rejects.toThrow(
      /Failed to parse JSON response from https:\/\/example\.com\/invalid\.json \(status 200\)/,
    );
  });

  it('should reject on response stream error', async () => {
    const streamError = new Error('Stream reset');
    getMock.mockImplementationOnce((_url, _options, callback) => {
      const res = new EventEmitter() as IncomingMessage;
      res.statusCode = 200;
      queueMicrotask(() => {
        (callback as (res: IncomingMessage) => void)(res);
        res.emit('error', streamError);
        // Node emits 'close' after 'error'; it must not reject a second time.
        res.emit('close');
      });
      return new EventEmitter() as ClientRequest;
    });

    await expect(fetchJson('https://example.com/stream-error')).rejects.toThrow(
      /Response error while fetching https:\/\/example\.com\/stream-error \(status 200\): Stream reset/,
    );
  });

  it('should reject when response stream is aborted', async () => {
    getMock.mockImplementationOnce((_url, _options, callback) => {
      const res = new EventEmitter() as IncomingMessage;
      res.statusCode = 200;
      queueMicrotask(() => {
        (callback as (res: IncomingMessage) => void)(res);
        res.emit('aborted');
      });
      return new EventEmitter() as ClientRequest;
    });

    await expect(fetchJson('https://example.com/aborted')).rejects.toThrow(
      'Response aborted while fetching https://example.com/aborted (status 200)',
    );
  });

  it('should settle once when the response emits aborted, error and close in sequence', async () => {
    const resetError = Object.assign(new Error('aborted'), {
      code: 'ECONNRESET',
    });
    getMock.mockImplementationOnce((_url, _options, callback) => {
      const res = new EventEmitter() as IncomingMessage;
      res.statusCode = 200;
      queueMicrotask(() => {
        (callback as (res: IncomingMessage) => void)(res);
        // A connection reset mid-response emits all three, in this order.
        res.emit('aborted');
        res.emit('error', resetError);
        res.emit('close');
      });
      return new EventEmitter() as ClientRequest;
    });

    await expect(fetchJson('https://example.com/reset')).rejects.toThrow(
      'Response aborted while fetching https://example.com/reset (status 200)',
    );
    // The follow-up events must not build (and discard) further errors.
    expect(getErrorMessageMock).not.toHaveBeenCalled();
  });

  it('should reject when response ends prematurely (res.complete === false)', async () => {
    getMock.mockImplementationOnce((_url, _options, callback) => {
      const res = new EventEmitter() as IncomingMessage;
      res.statusCode = 200;
      res.complete = false;
      queueMicrotask(() => {
        (callback as (res: IncomingMessage) => void)(res);
        res.emit('data', Buffer.from('{"partial":'));
        res.emit('end');
        // Node emits 'close' after 'end'; it must not reject a second time.
        res.emit('close');
      });
      return new EventEmitter() as ClientRequest;
    });

    await expect(fetchJson('https://example.com/truncated')).rejects.toThrow(
      'Response ended prematurely while fetching https://example.com/truncated (status 200)',
    );
  });

  it('should reject when response closes before end', async () => {
    getMock.mockImplementationOnce((_url, _options, callback) => {
      const res = new EventEmitter() as IncomingMessage;
      res.statusCode = 200;
      queueMicrotask(() => {
        (callback as (res: IncomingMessage) => void)(res);
        res.emit('close');
      });
      return new EventEmitter() as ClientRequest;
    });

    await expect(fetchJson('https://example.com/closed-early')).rejects.toThrow(
      'Response closed prematurely while fetching https://example.com/closed-early (status 200)',
    );
  });

  describe('with GITHUB_TOKEN', () => {
    beforeEach(() => {
      vi.stubEnv('GITHUB_TOKEN', 'my-secret-token');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should include Authorization header if token is present for github.com domains', async () => {
      getMock.mockImplementationOnce((_url, options, callback) => {
        expect(options.headers).toEqual({
          'User-Agent': 'gemini-cli',
          Authorization: 'token my-secret-token',
        });
        const res = new EventEmitter() as IncomingMessage;
        res.statusCode = 200;
        (callback as (res: IncomingMessage) => void)(res);
        res.emit('data', Buffer.from('{"foo": "bar"}'));
        res.emit('end');
        return new EventEmitter() as ClientRequest;
      });
      await expect(fetchJson('https://api.github.com/user')).resolves.toEqual({
        foo: 'bar',
      });
    });

    it('should strip Authorization header when redirecting to a non-GitHub domain', async () => {
      getMock.mockImplementationOnce((_url, options, callback) => {
        expect(options.headers).toEqual({
          'User-Agent': 'gemini-cli',
          Authorization: 'token my-secret-token',
        });
        const res = new EventEmitter() as IncomingMessage;
        res.statusCode = 302;
        res.headers = {
          location: 'https://external-bucket.s3.amazonaws.com/data.json',
        };
        res.resume = vi.fn();
        (callback as (res: IncomingMessage) => void)(res);
        res.emit('end');
        return new EventEmitter() as ClientRequest;
      });

      getMock.mockImplementationOnce((_url, options, callback) => {
        expect(options.headers).toEqual({
          'User-Agent': 'gemini-cli',
        });
        const res = new EventEmitter() as IncomingMessage;
        res.statusCode = 200;
        (callback as (res: IncomingMessage) => void)(res);
        res.emit('data', Buffer.from('{"redirected": true}'));
        res.emit('end');
        return new EventEmitter() as ClientRequest;
      });

      await expect(
        fetchJson('https://api.github.com/repos/owner/repo/releases/latest'),
      ).resolves.toEqual({
        redirected: true,
      });
    });
  });

  describe('without GITHUB_TOKEN', () => {
    beforeEach(() => {
      vi.stubEnv('GITHUB_TOKEN', '');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should not include Authorization header if token is not present', async () => {
      getMock.mockImplementationOnce((_url, options, callback) => {
        expect(options.headers).toEqual({
          'User-Agent': 'gemini-cli',
        });
        const res = new EventEmitter() as IncomingMessage;
        res.statusCode = 200;
        (callback as (res: IncomingMessage) => void)(res);
        res.emit('data', Buffer.from('{"foo": "bar"}'));
        res.emit('end');
        return new EventEmitter() as ClientRequest;
      });

      await expect(fetchJson('https://api.github.com/user')).resolves.toEqual({
        foo: 'bar',
      });
    });
  });
});
