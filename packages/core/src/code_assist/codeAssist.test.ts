/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  createCodeAssistContentGenerator,
  getCodeAssistServer,
} from './codeAssist.js';
import { AuthType } from '../core/contentGenerator.js';
import * as oauth2Module from './oauth2.js';
import * as setupModule from './setup.js';
import { CodeAssistServer } from './server.js';
import { LoggingContentGenerator } from '../core/loggingContentGenerator.js';
import type { Config } from '../config/config.js';

vi.mock('./oauth2.js');
vi.mock('./setup.js');
vi.mock('./server.js');

describe('codeAssist', () => {
  let mockConfig: Config;
  let mockAuthClient: Record<string, unknown>;
  let mockUserData: { projectId: string; userTier: string };
  let mockHttpOptions: { timeout: number };

  beforeEach(() => {
    mockConfig = {} as Config;
    mockAuthClient = { credentials: { access_token: 'token' } };
    mockUserData = { projectId: 'test-project', userTier: 'free' };
    mockHttpOptions = { timeout: 30000 };

    vi.mocked(oauth2Module.getOauthClient).mockResolvedValue(
      mockAuthClient as never,
    );
    vi.mocked(setupModule.setupUser).mockResolvedValue(mockUserData as never);
    vi.mocked(CodeAssistServer).mockImplementation(() => ({}) as never);
  });

  describe('createCodeAssistContentGenerator', () => {
    it('should create CodeAssistServer for LOGIN_WITH_GOOGLE auth', async () => {
      await createCodeAssistContentGenerator(
        mockHttpOptions as never,
        AuthType.LOGIN_WITH_GOOGLE,
        mockConfig,
      );

      expect(oauth2Module.getOauthClient).toHaveBeenCalledWith(
        AuthType.LOGIN_WITH_GOOGLE,
        mockConfig,
      );
      expect(setupModule.setupUser).toHaveBeenCalledWith(mockAuthClient);
      expect(CodeAssistServer).toHaveBeenCalledWith(
        mockAuthClient,
        'test-project',
        mockHttpOptions,
        undefined,
        'free',
      );
    });

    it('should create CodeAssistServer for CLOUD_SHELL auth', async () => {
      await createCodeAssistContentGenerator(
        mockHttpOptions as never,
        AuthType.CLOUD_SHELL,
        mockConfig,
      );

      expect(oauth2Module.getOauthClient).toHaveBeenCalledWith(
        AuthType.CLOUD_SHELL,
        mockConfig,
      );
      expect(setupModule.setupUser).toHaveBeenCalledWith(mockAuthClient);
      expect(CodeAssistServer).toHaveBeenCalledWith(
        mockAuthClient,
        'test-project',
        mockHttpOptions,
        undefined,
        'free',
      );
    });

    it('should pass sessionId when provided', async () => {
      await createCodeAssistContentGenerator(
        mockHttpOptions as never,
        AuthType.LOGIN_WITH_GOOGLE,
        mockConfig,
        'test-session-123',
      );

      expect(CodeAssistServer).toHaveBeenCalledWith(
        mockAuthClient,
        'test-project',
        mockHttpOptions,
        'test-session-123',
        'free',
      );
    });

    it('should pass userTier from setupUser', async () => {
      mockUserData.userTier = 'premium';

      await createCodeAssistContentGenerator(
        mockHttpOptions as never,
        AuthType.LOGIN_WITH_GOOGLE,
        mockConfig,
      );

      expect(CodeAssistServer).toHaveBeenCalledWith(
        mockAuthClient,
        'test-project',
        mockHttpOptions,
        undefined,
        'premium',
      );
    });

    it('should pass projectId from setupUser', async () => {
      mockUserData.projectId = 'custom-project-id';

      await createCodeAssistContentGenerator(
        mockHttpOptions as never,
        AuthType.LOGIN_WITH_GOOGLE,
        mockConfig,
      );

      expect(CodeAssistServer).toHaveBeenCalledWith(
        mockAuthClient,
        'custom-project-id',
        mockHttpOptions,
        undefined,
        'free',
      );
    });

    it('should throw error for unsupported auth type', async () => {
      await expect(
        createCodeAssistContentGenerator(
          mockHttpOptions as never,
          'UNSUPPORTED' as never,
          mockConfig,
        ),
      ).rejects.toThrow('Unsupported authType: UNSUPPORTED');
    });

    it('should throw error for API_KEY auth type', async () => {
      await expect(
        createCodeAssistContentGenerator(
          mockHttpOptions as never,
          AuthType.API_KEY,
          mockConfig,
        ),
      ).rejects.toThrow(`Unsupported authType: ${AuthType.API_KEY}`);
    });

    it('should return ContentGenerator instance', async () => {
      const mockServer = { generate: vi.fn() };
      vi.mocked(CodeAssistServer).mockImplementation(() => mockServer as never);

      const result = await createCodeAssistContentGenerator(
        mockHttpOptions as never,
        AuthType.LOGIN_WITH_GOOGLE,
        mockConfig,
      );

      expect(result).toBe(mockServer);
    });

    it('should call getOauthClient before setupUser', async () => {
      const callOrder: string[] = [];

      vi.mocked(oauth2Module.getOauthClient).mockImplementation(async () => {
        callOrder.push('getOauthClient');
        return mockAuthClient as never;
      });

      vi.mocked(setupModule.setupUser).mockImplementation(async () => {
        callOrder.push('setupUser');
        return mockUserData as never;
      });

      await createCodeAssistContentGenerator(
        mockHttpOptions as never,
        AuthType.LOGIN_WITH_GOOGLE,
        mockConfig,
      );

      expect(callOrder).toEqual(['getOauthClient', 'setupUser']);
    });

    it('should handle getOauthClient errors', async () => {
      vi.mocked(oauth2Module.getOauthClient).mockRejectedValue(
        new Error('OAuth failed'),
      );

      await expect(
        createCodeAssistContentGenerator(
          mockHttpOptions as never,
          AuthType.LOGIN_WITH_GOOGLE,
          mockConfig,
        ),
      ).rejects.toThrow('OAuth failed');
    });

    it('should handle setupUser errors', async () => {
      vi.mocked(setupModule.setupUser).mockRejectedValue(
        new Error('Setup failed'),
      );

      await expect(
        createCodeAssistContentGenerator(
          mockHttpOptions as never,
          AuthType.LOGIN_WITH_GOOGLE,
          mockConfig,
        ),
      ).rejects.toThrow('Setup failed');
    });

    it('should pass httpOptions to CodeAssistServer', async () => {
      const customHttpOptions = { timeout: 60000, retries: 3 };

      await createCodeAssistContentGenerator(
        customHttpOptions as never,
        AuthType.LOGIN_WITH_GOOGLE,
        mockConfig,
      );

      expect(CodeAssistServer).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        customHttpOptions,
        expect.anything(),
        expect.anything(),
      );
    });
  });

  describe('getCodeAssistServer', () => {
    it('should return CodeAssistServer when present', () => {
      const mockServer = new CodeAssistServer(
        {} as never,
        'project',
        {} as never,
      );
      mockConfig.getContentGenerator = vi.fn().mockReturnValue(mockServer);

      const result = getCodeAssistServer(mockConfig);

      expect(result).toBe(mockServer);
    });

    it('should return undefined for non-CodeAssistServer', () => {
      const mockOtherServer = { generate: vi.fn() };
      mockConfig.getContentGenerator = vi.fn().mockReturnValue(mockOtherServer);

      const result = getCodeAssistServer(mockConfig);

      expect(result).toBeUndefined();
    });

    it('should unwrap LoggingContentGenerator', () => {
      const mockServer = new CodeAssistServer(
        {} as never,
        'project',
        {} as never,
      );
      const mockLoggingGenerator = {
        getWrapped: vi.fn().mockReturnValue(mockServer),
      } as never;

      Object.setPrototypeOf(
        mockLoggingGenerator,
        LoggingContentGenerator.prototype,
      );

      mockConfig.getContentGenerator = vi
        .fn()
        .mockReturnValue(mockLoggingGenerator);

      const result = getCodeAssistServer(mockConfig);

      expect(mockLoggingGenerator.getWrapped).toHaveBeenCalled();
      expect(result).toBe(mockServer);
    });

    it('should return undefined if wrapped server is not CodeAssistServer', () => {
      const mockOtherServer = { generate: vi.fn() };
      const mockLoggingGenerator = {
        getWrapped: vi.fn().mockReturnValue(mockOtherServer),
      } as never;

      Object.setPrototypeOf(
        mockLoggingGenerator,
        LoggingContentGenerator.prototype,
      );

      mockConfig.getContentGenerator = vi
        .fn()
        .mockReturnValue(mockLoggingGenerator);

      const result = getCodeAssistServer(mockConfig);

      expect(result).toBeUndefined();
    });

    it('should call getContentGenerator on config', () => {
      const mockServer = new CodeAssistServer(
        {} as never,
        'project',
        {} as never,
      );
      mockConfig.getContentGenerator = vi.fn().mockReturnValue(mockServer);

      getCodeAssistServer(mockConfig);

      expect(mockConfig.getContentGenerator).toHaveBeenCalled();
      expect(mockConfig.getContentGenerator).toHaveBeenCalledTimes(1);
    });

    it('should handle null content generator', () => {
      mockConfig.getContentGenerator = vi.fn().mockReturnValue(null);

      const result = getCodeAssistServer(mockConfig);

      expect(result).toBeUndefined();
    });

    it('should handle undefined content generator', () => {
      mockConfig.getContentGenerator = vi.fn().mockReturnValue(undefined);

      const result = getCodeAssistServer(mockConfig);

      expect(result).toBeUndefined();
    });

    it('should return correct type', () => {
      const mockServer = new CodeAssistServer(
        {} as never,
        'project',
        {} as never,
      );
      mockConfig.getContentGenerator = vi.fn().mockReturnValue(mockServer);

      const result = getCodeAssistServer(mockConfig);

      expect(result).toBeInstanceOf(CodeAssistServer);
    });

    it('should work with directly instantiated CodeAssistServer', () => {
      const mockServer = new CodeAssistServer(
        mockAuthClient as never,
        'test-project',
        mockHttpOptions as never,
      );
      mockConfig.getContentGenerator = vi.fn().mockReturnValue(mockServer);

      const result = getCodeAssistServer(mockConfig);

      expect(result).toBeDefined();
      expect(result).toBeInstanceOf(CodeAssistServer);
    });
  });

  describe('integration', () => {
    it('should create and retrieve server', async () => {
      const mockServer = new CodeAssistServer(
        mockAuthClient as never,
        'test-project',
        mockHttpOptions as never,
      );

      vi.mocked(CodeAssistServer).mockImplementation(() => mockServer as never);

      const created = await createCodeAssistContentGenerator(
        mockHttpOptions as never,
        AuthType.LOGIN_WITH_GOOGLE,
        mockConfig,
      );

      mockConfig.getContentGenerator = vi.fn().mockReturnValue(created);

      const retrieved = getCodeAssistServer(mockConfig);

      expect(retrieved).toBe(created);
    });

    it('should handle wrapped server correctly', async () => {
      const mockServer = new CodeAssistServer(
        mockAuthClient as never,
        'test-project',
        mockHttpOptions as never,
      );

      vi.mocked(CodeAssistServer).mockImplementation(() => mockServer as never);

      await createCodeAssistContentGenerator(
        mockHttpOptions as never,
        AuthType.LOGIN_WITH_GOOGLE,
        mockConfig,
      );

      const mockLoggingGenerator = {
        getWrapped: vi.fn().mockReturnValue(mockServer),
      } as never;

      Object.setPrototypeOf(
        mockLoggingGenerator,
        LoggingContentGenerator.prototype,
      );

      mockConfig.getContentGenerator = vi
        .fn()
        .mockReturnValue(mockLoggingGenerator);

      const result = getCodeAssistServer(mockConfig);

      expect(result).toBe(mockServer);
    });
  });
});
