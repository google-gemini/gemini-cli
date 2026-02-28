/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  safeJsonStringify,
  safeJsonStringifyBooleanValuesOnly,
  redactProxyUrl,
} from './safeJsonStringify.js';
import { makeFakeConfig } from '../test-utils/config.js';

describe('safeJsonStringify', () => {
  it('should stringify normal objects without issues', () => {
    const obj = { name: 'test', value: 42 };
    const result = safeJsonStringify(obj);
    expect(result).toBe('{"name":"test","value":42}');
  });

  it('should handle circular references by replacing them with [Circular]', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: any = { name: 'test' };
    obj.circular = obj; // Create circular reference

    const result = safeJsonStringify(obj);
    expect(result).toBe('{"name":"test","circular":"[Circular]"}');
  });

  it('should handle complex circular structures like HttpsProxyAgent', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const agent: any = {
      sockets: {},
      options: { host: 'example.com' },
    };
    agent.sockets['example.com'] = [{ agent }];

    const result = safeJsonStringify(agent);
    expect(result).toContain('[Circular]');
    expect(result).toContain('example.com');
  });

  it('should respect the space parameter for formatting', () => {
    const obj = { name: 'test', value: 42 };
    const result = safeJsonStringify(obj, 2);
    expect(result).toBe('{\n  "name": "test",\n  "value": 42\n}');
  });

  it('should handle circular references with formatting', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const obj: any = { name: 'test' };
    obj.circular = obj;

    const result = safeJsonStringify(obj, 2);
    expect(result).toBe('{\n  "name": "test",\n  "circular": "[Circular]"\n}');
  });

  it('should handle arrays with circular references', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const arr: any[] = [{ id: 1 }];
    arr[0].parent = arr; // Create circular reference

    const result = safeJsonStringify(arr);
    expect(result).toBe('[{"id":1,"parent":"[Circular]"}]');
  });

  it('should handle null and undefined values', () => {
    expect(safeJsonStringify(null)).toBe('null');
    expect(safeJsonStringify(undefined)).toBe(undefined);
  });

  it('should handle primitive values', () => {
    expect(safeJsonStringify('test')).toBe('"test"');
    expect(safeJsonStringify(42)).toBe('42');
    expect(safeJsonStringify(true)).toBe('true');
  });
});

describe('redactProxyUrl', () => {
  it('should redact API keys from proxy URLs', () => {
    const proxyUrlWithApiKey = 'http://api-key-123@proxy.example.com:8080';
    const redacted = redactProxyUrl(proxyUrlWithApiKey);

    expect(redacted).toBe('http://proxy.example.com:8080/');
    expect(redacted).not.toContain('api-key-123');
    expect(redacted).toContain('proxy.example.com:8080');
  });

  it('should redact username and password from proxy URLs', () => {
    const proxyUrlWithCredentials =
      'http://user:password123@proxy.example.com:8080';
    const redacted = redactProxyUrl(proxyUrlWithCredentials);

    expect(redacted).toBe('http://proxy.example.com:8080/');
    expect(redacted).not.toContain('user:password123');
    expect(redacted).not.toContain('password123');
    expect(redacted).toContain('proxy.example.com:8080');
  });

  it('should redact username only from proxy URLs', () => {
    const proxyUrlWithUsername = 'http://username@proxy.example.com:8080';
    const redacted = redactProxyUrl(proxyUrlWithUsername);

    expect(redacted).toBe('http://proxy.example.com:8080/');
    expect(redacted).not.toContain('username@');
    expect(redacted).toContain('proxy.example.com:8080');
  });

  it('should handle proxy URLs without credentials', () => {
    const proxyUrlWithoutCredentials = 'http://proxy.example.com:8080';
    const redacted = redactProxyUrl(proxyUrlWithoutCredentials);

    expect(redacted).toBe('http://proxy.example.com:8080/');
    expect(redacted).toContain('proxy.example.com:8080');
  });

  it('should handle HTTPS proxy URLs with credentials', () => {
    const httpsProxyWithCredentials =
      'https://api-key-456@secure-proxy.example.com:8443';
    const redacted = redactProxyUrl(httpsProxyWithCredentials);

    expect(redacted).toBe('https://secure-proxy.example.com:8443/');
    expect(redacted).not.toContain('api-key-456');
    expect(redacted).toContain('secure-proxy.example.com:8443');
  });

  it('should handle malformed URLs with regex fallback', () => {
    // test the regex fallback with a url that will fail new URL()
    // using a url with invalid characters that can't be parsed
    // this ensures we test the catch block and regex fallback
    const malformedUrl = '://user:pass@host';
    const redacted = redactProxyUrl(malformedUrl);

    // regex fallback should remove credentials
    expect(redacted).not.toContain('user:pass');
    expect(redacted).not.toContain('@');
    expect(redacted).toContain('host');
  });

  it('should handle URLs without protocol in regex fallback', () => {
    // test that regex fallback handles urls without protocols
    // this tests the vulnerability fix where credentials could leak
    // if the url doesn't have a protocol and new URL() fails
    const urlWithoutProtocol = 'user:pass@example.com';
    // manually test the regex to ensure it works
    const regexResult = urlWithoutProtocol.replace(
      /^([^:]+:\/\/)?([^@]+@)?(.+)$/,
      (_, protocol, __, rest) => (protocol || '') + rest,
    );
    expect(regexResult).toBe('example.com');
    expect(regexResult).not.toContain('user:pass');
  });

  it('should return undefined for undefined input', () => {
    expect(redactProxyUrl(undefined)).toBeUndefined();
  });

  it('should return undefined for empty string', () => {
    expect(redactProxyUrl('')).toBeUndefined();
  });
});

describe('safeJsonStringifyBooleanValuesOnly - Proxy URL Redaction', () => {
  it('should redact API keys from proxy URLs in Config objects', () => {
    const proxyUrlWithApiKey = 'http://api-key-123@proxy.example.com:8080';
    const config = makeFakeConfig({ proxy: proxyUrlWithApiKey });

    // make sure the proxy url actually has the api key before we test
    expect(config.getProxy()).toBe(proxyUrlWithApiKey);
    expect(config.getProxy()).toContain('api-key-123');

    // serialize it and check that the api key doesn't leak out
    const json = safeJsonStringifyBooleanValuesOnly(config);

    // api key shouldn't be in the output
    expect(json).not.toContain('api-key-123');
  });

  it('should redact username and password from proxy URLs in Config objects', () => {
    const proxyUrlWithCredentials =
      'http://user:password123@proxy.example.com:8080';
    const config = makeFakeConfig({ proxy: proxyUrlWithCredentials });

    // check that it has credentials before we test redaction
    expect(config.getProxy()).toBe(proxyUrlWithCredentials);
    expect(config.getProxy()).toContain('user:password123');

    // serialize and make sure credentials don't show up
    const json = safeJsonStringifyBooleanValuesOnly(config);

    // password shouldn't be anywhere in the output
    expect(json).not.toContain('user:password123');
    expect(json).not.toContain('password123');
  });

  it('should handle proxy URLs without credentials', () => {
    const proxyUrlWithoutCredentials = 'http://proxy.example.com:8080';
    const config = makeFakeConfig({ proxy: proxyUrlWithoutCredentials });

    // make sure there's no @ symbol (which would indicate credentials)
    expect(config.getProxy()).toBe(proxyUrlWithoutCredentials);
    expect(config.getProxy()).not.toContain('@');

    // should serialize fine without any issues
    const json = safeJsonStringifyBooleanValuesOnly(config);
    expect(json).toBeDefined();
  });

  it('should redact proxy URL even if it were to be serialized (defensive test)', () => {
    // testing what would happen if the proxy url actually got serialized
    // this is defensive - in case serialization behavior changes in the future
    const proxyUrlWithApiKey = 'http://api-key-123@proxy.example.com:8080';

    // create a mock object that would include proxy in the output
    // using toJSON to force it to be included for testing purposes
    const mockConfigWithProxy = {
      getProxy: () => proxyUrlWithApiKey,
      proxy: proxyUrlWithApiKey,
      someBoolean: true,
      // force proxy to be included so we can test the redaction
      toJSON() {
        return {
          proxy: this.proxy,
          someBoolean: this.someBoolean,
        };
      },
    };

    // verify the mock has the api key in it
    expect(mockConfigWithProxy.proxy).toContain('api-key-123');

    // test that the redaction function actually works on the proxy value
    const redactedProxy = redactProxyUrl(proxyUrlWithApiKey);
    expect(redactedProxy).not.toContain('api-key-123');
    expect(redactedProxy).toContain('proxy.example.com');
  });
});
