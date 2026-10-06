/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import * as https from 'node:https';
import { EventEmitter } from 'node:events';
import { fetchJson, getGitHubToken } from './github_fetch.js';
import type { ClientRequest, IncomingMessage } from 'node:http';

vi.mock('node:https');

describe('getGitHubToken', () => {
  const originalToken = process.env['GITHUB_TOKEN'];

  afterEach(() => {
    if (originalToken) {
      process.env['GITHUB_TOKEN'] = originalToken;
    } else {
      delete process.env['GITHUB_TOKEN'];
    }
  });

  it('should return the token if GITHUB_TOKEN is set', () => {
    process.env['GITHUB_TOKEN'] = 'test-token';
    expect(getGitHubToken()).toBe('test-token');
  });

  it('should return undefined if GITHUB_TOKEN is not set', () => {
    delete process.env['GITHUB_TOKEN'];
    expect(getGitHubToken()).toBeUndefined();
  });
});

describe('fetchJson', () => {
  const getMock = vi.mocked(https.get);

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
      req.emit('error', error);
      return req;
    });

    await expect(fetchJson('https://example.com/error')).rejects.toThrow(
      'Network error',
    );
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

  it('should reject when response ends prematurely (res.complete === false)', async () => {
    getMock.mockImplementationOnce((_url, _options, callback) => {
      const res = new EventEmitter() as IncomingMessage;
      res.statusCode = 200;
      res.complete = false;
      queueMicrotask(() => {
        (callback as (res: IncomingMessage) => void)(res);
        res.emit('data', Buffer.from('{"partial":'));
        res.emit('end');
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
    const originalToken = process.env['GITHUB_TOKEN'];

    beforeEach(() => {
      process.env['GITHUB_TOKEN'] = 'my-secret-token';
    });

    afterEach(() => {
      if (originalToken) {
        process.env['GITHUB_TOKEN'] = originalToken;
      } else {
        delete process.env['GITHUB_TOKEN'];
      }
    });

    it('should include Authorization header if token is present', async () => {
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
  });

  describe('without GITHUB_TOKEN', () => {
    const originalToken = process.env['GITHUB_TOKEN'];

    beforeEach(() => {
      delete process.env['GITHUB_TOKEN'];
    });

    afterEach(() => {
      if (originalToken) {
        process.env['GITHUB_TOKEN'] = originalToken;
      }
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
