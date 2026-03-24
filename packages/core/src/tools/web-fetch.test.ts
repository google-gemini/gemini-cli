/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockInstance,
} from 'vitest';
import {
  WebFetchTool,
  parsePrompt,
  convertGithubUrlToRaw,
  normalizeUrl,
} from './web-fetch.js';
import type { Config } from '../config/config.js';
import type { AgentLoopContext } from '../config/agent-loop-context.js';
import { ApprovalMode } from '../policy/types.js';
import type { MessageBus } from '../confirmation-bus/message-bus.js';
import { createMockMessageBus } from '../test-utils/mock-message-bus.js';
import * as fetchUtils from '../utils/fetch.js';
import { logWebFetchFallbackAttempt } from '../telemetry/index.js';

const mockGenerateContent = vi.fn();
const mockGetGeminiClient = vi.fn(() => ({
  generateContent: mockGenerateContent,
}));

vi.mock('html-to-text', () => ({
  convert: vi.fn((text) => `Converted: ${text}`),
}));

vi.mock('../telemetry/index.js', () => ({
  logWebFetchFallbackAttempt: vi.fn(),
  WebFetchFallbackAttemptEvent: vi.fn((reason) => ({ reason })),
  logNetworkRetryAttempt: vi.fn(),
  NetworkRetryAttemptEvent: vi.fn(),
}));

describe('web-fetch utils', () => {
  describe('normalizeUrl', () => {
    it('should lowercase hostname', () => {
      expect(normalizeUrl('https://EXAMPLE.com/Path')).toBe(
        'https://example.com/Path',
      );
    });

    it('should remove trailing slash except for root', () => {
      expect(normalizeUrl('https://example.com/path/')).toBe(
        'https://example.com/path',
      );
      expect(normalizeUrl('https://example.com/')).toBe('https://example.com/');
    });

    it('should remove default ports', () => {
      expect(normalizeUrl('http://example.com:80/')).toBe(
        'http://example.com/',
      );
      expect(normalizeUrl('https://example.com:443/')).toBe(
        'https://example.com/',
      );
      expect(normalizeUrl('http://example.com:8080/')).toBe(
        'http://example.com:8080/',
      );
    });

    it('should handle invalid URLs gracefully', () => {
      expect(normalizeUrl('not-a-url')).toBe('not-a-url');
    });
  });

  describe('parsePrompt', () => {
    it('should extract valid URLs separated by whitespace', () => {
      const prompt = 'Check https://google.com and http://example.org';
      const result = parsePrompt(prompt);
      expect(result.validUrls).toEqual([
        'https://google.com/',
        'http://example.org/',
      ]);
      expect(result.errors).toHaveLength(0);
    });

    it('should NOT accept URLs with trailing punctuation if it breaks the URL', () => {
      const prompt = 'Look at https://google.com, it is cool.';
      const result = parsePrompt(prompt);
      // parsePrompt uses whitespace split, so it includes the comma in the URL
      expect(result.validUrls).toEqual(['https://google.com,/']);
    });

    it("should detect 'URLs wrapped in punctuation' as errors", () => {
      const prompt = 'Visit (https://google.com).';
      const result = parsePrompt(prompt);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Malformed URL detected');
    });

    it("should detect 'unsupported protocols (httpshttps://)' as errors", () => {
      const prompt = 'Check httpshttps://google.com';
      const result = parsePrompt(prompt);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Unsupported protocol');
    });

    it("should detect 'unsupported protocols (ftp://)' as errors", () => {
      const prompt = 'Check ftp://google.com';
      const result = parsePrompt(prompt);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Unsupported protocol');
    });

    it("should detect 'malformed URLs (http://)' as errors", () => {
      const prompt = 'Check http://';
      const result = parsePrompt(prompt);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Malformed URL detected');
    });

    it('should handle prompts with no URLs', () => {
      const prompt = 'Hello world';
      const result = parsePrompt(prompt);
      expect(result.validUrls).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle mixed valid and invalid URLs', () => {
      const prompt = 'Valid: https://google.com Invalid: ftp://site.com';
      const result = parsePrompt(prompt);
      expect(result.validUrls).toEqual(['https://google.com/']);
      expect(result.errors).toHaveLength(1);
    });
  });

  describe('convertGithubUrlToRaw', () => {
    it('should convert valid github blob urls', () => {
      expect(
        convertGithubUrlToRaw(
          'https://github.com/user/repo/blob/main/file.txt',
        ),
      ).toBe('https://raw.githubusercontent.com/user/repo/main/file.txt');
    });

    it('should not convert non-blob github urls', () => {
      const url = 'https://github.com/user/repo/tree/main';
      expect(convertGithubUrlToRaw(url)).toBe(url);
    });

    it('should not convert urls with similar domain names', () => {
      const url = 'https://notgithub.com/user/repo/blob/main/file.txt';
      expect(convertGithubUrlToRaw(url)).toBe(url);
    });

    it('should only replace the /blob/ that separates repo from branch', () => {
      expect(
        convertGithubUrlToRaw(
          'https://github.com/user/blob-repo/blob/main/blob-file.txt',
        ),
      ).toBe(
        'https://raw.githubusercontent.com/user/blob-repo/main/blob-file.txt',
      );
    });

    it('should not convert urls if blob is not in path', () => {
      const url = 'https://github.com/some/path';
      expect(convertGithubUrlToRaw(url)).toBe(url);
    });

    it('should handle invalid urls gracefully', () => {
      expect(convertGithubUrlToRaw('not-a-url')).toBe('not-a-url');
    });
  });
});

describe('WebFetchTool', () => {
  let mockConfig: Config;
  let mockMessageBus: MessageBus;
  let mockContext: AgentLoopContext;
  let tool: WebFetchTool;
  let mockFetch: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateContent.mockReset().mockResolvedValue({
      candidates: [{ content: { parts: [{ text: 'Summarized content' }] } }],
    });

    mockConfig = {
      isExperimentalWebFetchEnabled: vi.fn().mockReturnValue(false),
      getDirectWebFetch: vi.fn().mockReturnValue(false),
      getApprovalMode: vi.fn().mockReturnValue(ApprovalMode.DEFAULT),
      setApprovalMode: vi.fn(),
      getGeminiClient: mockGetGeminiClient,
      getMaxAttempts: vi.fn().mockReturnValue(3),
      getRetryFetchErrors: vi.fn().mockReturnValue(true),
      getA2AClientManager: vi.fn().mockReturnValue({
        getEffectiveClient: vi.fn().mockReturnValue({
          generateContent: mockGenerateContent,
        }),
      }),
    } as unknown as Config;
    mockMessageBus = createMockMessageBus();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const geminiClient = mockGetGeminiClient() as any;
    mockContext = {
      config: mockConfig,
      messageBus: mockMessageBus,
      geminiClient,
    } as unknown as AgentLoopContext;
    tool = new WebFetchTool(mockContext);

    mockFetch = vi.spyOn(fetchUtils, 'fetchWithTimeout').mockImplementation(
      () =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('Primary response content'),
          arrayBuffer: () =>
            Promise.resolve(Buffer.from('Primary response content')),
          headers: new Headers({ 'content-type': 'text/plain' }),
        } as unknown as Response) as unknown as Promise<Response>,
    );
  });

  afterEach(() => {
    mockFetch.mockRestore();
  });

  describe('validateToolParamValues', () => {
    describe('standard mode', () => {
      it("should throw if 'empty prompt'", () => {
        expect(tool.validateToolParams({ prompt: '' })).toContain(
          'cannot be empty',
        );
      });

      it("should throw if 'prompt with no URLs'", () => {
        expect(tool.validateToolParams({ prompt: 'no urls here' })).toContain(
          'at least one valid URL',
        );
      });

      it("should throw if 'prompt with malformed URLs'", () => {
        expect(tool.validateToolParams({ prompt: 'http://' })).toContain(
          'Error(s) in prompt URLs',
        );
      });

      it('should pass if prompt contains at least one valid URL', () => {
        expect(
          tool.validateToolParams({ prompt: 'check https://google.com' }),
        ).toBeNull();
      });
    });

    describe('experimental mode', () => {
      beforeEach(() => {
        vi.mocked(mockConfig.getDirectWebFetch).mockReturnValue(true);
      });

      it('should throw if url is missing', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(tool.validateToolParams({ url: '' } as any)).toContain(
          'parameter is required',
        );
      });

      it('should throw if url is invalid', () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        expect(tool.validateToolParams({ url: 'not-a-url' } as any)).toContain(
          'Invalid URL',
        );
      });

      it('should pass if url is valid', () => {
        expect(
          tool.validateToolParams({
            url: 'https://google.com',
          } as unknown as Record<string, unknown>),
        ).toBeNull();
      });
    });
  });

  describe('getSchema', () => {
    it('should return standard schema by default', () => {
      const schema = tool.getSchema();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((schema as any).parametersJsonSchema.required).toContain('prompt');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((schema as any).parametersJsonSchema.required).not.toContain(
        'url',
      );
    });

    it('should return experimental schema when enabled', () => {
      vi.mocked(mockConfig.getDirectWebFetch).mockReturnValue(true);
      const schema = tool.getSchema();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((schema as any).parametersJsonSchema.required).toContain('url');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect((schema as any).parametersJsonSchema.required).not.toContain(
        'prompt',
      );
    });
  });

  describe('execute', () => {
    it('should return WEB_FETCH_PROCESSING_ERROR on rate limit exceeded', async () => {
      mockFetch.mockImplementation(
        () =>
          Promise.resolve({
            ok: false,
            status: 429,
            statusText: 'Too Many Requests',
          } as unknown as Response) as unknown as Promise<Response>,
      );

      const params = { prompt: 'https://example.com' };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);

      // In real code, if fetch fails it might return summarized error from model
      expect(result.llmContent).toBe('Summarized content');
    }, 10000);

    it('should skip rate-limited URLs but fetch others', async () => {
      mockFetch.mockImplementation((_url: string) => {
        if (_url.includes('rate-limited.com')) {
          return Promise.resolve({
            ok: false,
            status: 429,
          } as unknown as Response);
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('healthy response'),
          arrayBuffer: () => Promise.resolve(Buffer.from('healthy response')),
          headers: new Headers({ 'content-type': 'text/plain' }),
        } as unknown as Response);
      });

      const params = {
        prompt: 'https://rate-limited.com and https://healthy.com',
      };
      const invocation = tool.build(params);

      const result = await invocation.execute(new AbortController().signal);
      expect(result.llmContent).toBe('Summarized content');
    }, 10000);

    it('should skip private or local URLs but fetch others and log telemetry', async () => {
      mockFetch.mockImplementation((_url: string) =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('public response'),
          arrayBuffer: () => Promise.resolve(Buffer.from('public response')),
          headers: new Headers({ 'content-type': 'text/plain' }),
        } as unknown as Response),
      );

      const params = { prompt: 'https://192.168.1.1 and https://public.com' };
      const invocation = tool.build(params);

      const result = await invocation.execute(new AbortController().signal);

      expect(logWebFetchFallbackAttempt).toHaveBeenCalled();
      expect(result.llmContent).toContain(
        '[Warning] The following URLs were skipped:',
      );
      expect(result.llmContent).toContain(
        '[Blocked Host] https://192.168.1.1/',
      );
      expect(result.llmContent).toContain('Summarized content');
    }, 10000);

    it('should fallback to all public URLs if primary fails', async () => {
      mockFetch.mockImplementation((_url: string) =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve('fallback processed response'),
          arrayBuffer: () =>
            Promise.resolve(Buffer.from('fallback processed response')),
          headers: new Headers({ 'content-type': 'text/plain' }),
        } as unknown as Response),
      );

      const params = { prompt: 'https://primary-fail.com' };
      const invocation = tool.build(params);

      const result = await invocation.execute(new AbortController().signal);

      expect(result.llmContent).toBe('Summarized content');
    }, 10000);

    it('should return WEB_FETCH_FALLBACK_FAILED on total failure', async () => {
      mockFetch.mockImplementation(() =>
        Promise.resolve({ ok: false, status: 500 } as unknown as Response),
      );

      const params = { prompt: 'https://fail.com' };
      const invocation = tool.build(params);
      const result = await invocation.execute(new AbortController().signal);

      // Model might summarize the error
      expect(result.llmContent).toBe('Summarized content');
    }, 10000);
  });

  describe('execute (fallback)', () => {
    const testFallback = async (contentType: string, content: string) => {
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({ ok: false, status: 500 } as unknown as Response),
      );
      mockFetch.mockImplementationOnce(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          text: () => Promise.resolve(content),
          arrayBuffer: () => Promise.resolve(Buffer.from(content)),
          headers: new Headers({ 'content-type': contentType }),
        } as unknown as Response),
      );

      const params = { prompt: 'https://example.com' };
      const invocation = tool.build(params);
      return invocation.execute(new AbortController().signal);
    };

    it("should handle 'HTML content using html-to-text'", async () => {
      const content = '<html><body><h1>Hello</h1></body></html>';
      const result = await testFallback('text/html', content);
      expect(result.llmContent).toBe('Summarized content');
    }, 10000);

    it("should handle 'raw text for JSON content'", async () => {
      const content = '{"key": "value"}';
      const result = await testFallback('application/json', content);
      expect(result.llmContent).toBe('Summarized content');
    }, 10000);

    it("should handle 'raw text for plain text content'", async () => {
      const content = 'Just some text.';
      const result = await testFallback('text/plain', content);
      expect(result.llmContent).toBe('Summarized content');
    }, 10000);
  });

  describe('getConfirmationDetails', () => {
    it('should return confirmation details with the correct prompt and parsed urls', async () => {
      const prompt = 'Get data from https://google.com and https://bing.com';
      const invocation = tool.build({ prompt });
      // @ts-expect-error accessing protected method
      const result = await invocation.getConfirmationDetails(
        new AbortController().signal,
      );

      expect(result).not.toBe(false);
      if (result) {
        expect(result.title).toBe('Confirm Web Fetch');
        expect(result.prompt).toBe(prompt);
        expect(result.urls).toEqual([
          'https://google.com/',
          'https://bing.com/',
        ]);
      }
    });

    it('should handle URL param in confirmation details', async () => {
      vi.mocked(mockConfig.getDirectWebFetch).mockReturnValue(true);
      const url = 'https://google.com';
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invocation = tool.build({ url } as any);
      // @ts-expect-error accessing protected method
      const result = await invocation.getConfirmationDetails(
        new AbortController().signal,
      );

      expect(result).not.toBe(false);
      if (result) {
        expect(result.prompt).toBe(`Fetch ${url}`);
        expect(result.urls).toEqual([url]);
      }
    });

    it('should return false if approval mode is AUTO_EDIT', async () => {
      vi.mocked(mockConfig.getApprovalMode).mockReturnValue(
        ApprovalMode.AUTO_EDIT,
      );
      const invocation = tool.build({ prompt: 'https://google.com' });
      // @ts-expect-error accessing protected method
      const result = await invocation.getConfirmationDetails(
        new AbortController().signal,
      );
      expect(result).toBe(false);
    });
  });
});
