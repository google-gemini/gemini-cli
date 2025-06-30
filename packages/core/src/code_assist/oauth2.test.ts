/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getOauthClient, getCachedGoogleAccountId } from './oauth2.js';
import { OAuth2Client } from 'google-auth-library';
import * as fs from 'fs';
import * as path from 'path';
import http from 'http';
import open from 'open';
import crypto from 'crypto';
import * as os from 'os';

vi.mock('os', async (importOriginal) => {
  const os = await importOriginal<typeof import('os')>();
  return {
    ...os,
    homedir: vi.fn(),
  };

  describe("getOauthClient", () => {
    it("should use cached credentials when they exist", async () => {
      const mockTokens = {
        access_token: "cached-access-token",
        refresh_token: "cached-refresh-token",
      };

      // Create cached credentials
      const geminiDir = path.join(tempHomeDir, ".gemini");
      fs.mkdirSync(geminiDir, { recursive: true });
      fs.writeFileSync(
        path.join(geminiDir, "oauth_creds.json"),
        JSON.stringify(mockTokens)
      );

      const mockSetCredentials = vi.fn();
      const mockGetAccessToken = vi
        .fn()
        .mockResolvedValue({ token: "mock-access-token" });
      const mockOAuth2Client = {
        setCredentials: mockSetCredentials,
        getAccessToken: mockGetAccessToken,
        credentials: mockTokens,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      const client = await getOauthClient();

      expect(client).toBe(mockOAuth2Client);
      expect(mockSetCredentials).toHaveBeenCalledWith(mockTokens);
      expect(mockGetAccessToken).toHaveBeenCalled();
    });

    it("should handle invalid cached credentials gracefully", async () => {
      // Create invalid cached credentials
      const geminiDir = path.join(tempHomeDir, ".gemini");
      fs.mkdirSync(geminiDir, { recursive: true });
      fs.writeFileSync(
        path.join(geminiDir, "oauth_creds.json"),
        "invalid json"
      );

      const mockAuthUrl = "https://example.com/auth";
      const mockCode = "test-code";
      const mockState = "test-state";
      const mockTokens = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
      };

      const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      const mockSetCredentials = vi.fn();
      const mockGetAccessToken = vi
        .fn()
        .mockResolvedValue({ token: "mock-access-token" });
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        setCredentials: mockSetCredentials,
        getAccessToken: mockGetAccessToken,
        credentials: mockTokens,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue(mockState as never);
      vi.mocked(open).mockImplementation(async () => ({}) as never);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: "test-google-account-id-123" }),
      } as unknown as Response);

      let requestCallback!: http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;

      let serverListeningCallback: (value: unknown) => void;
      const serverListeningPromise = new Promise(
        (resolve) => (serverListeningCallback = resolve)
      );

      let capturedPort = 0;
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          capturedPort = port;
          if (callback) {
            callback();
          }
          serverListeningCallback(undefined);
        }),
        close: vi.fn((callback?: () => void) => {
          if (callback) {
            callback();
          }
        }),
        on: vi.fn(),
        address: () => ({ port: capturedPort }),
      };
      vi.mocked(http.createServer).mockImplementation((cb) => {
        requestCallback = cb as http.RequestListener<
          typeof http.IncomingMessage,
          typeof http.ServerResponse
        >;
        return mockHttpServer as unknown as http.Server;
      });

      const clientPromise = getOauthClient();
      await serverListeningPromise;

      const mockReq = {
        url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
      } as http.IncomingMessage;
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as http.ServerResponse;

      await requestCallback(mockReq, mockRes);

      const client = await clientPromise;
      expect(client).toBe(mockOAuth2Client);
    });

    it("should handle missing home directory gracefully", async () => {
      vi.mocked(os.homedir).mockReturnValue("");

      const mockAuthUrl = "https://example.com/auth";
      const mockCode = "test-code";
      const mockState = "test-state";
      const mockTokens = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
      };

      const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      const mockSetCredentials = vi.fn();
      const mockGetAccessToken = vi
        .fn()
        .mockResolvedValue({ token: "mock-access-token" });
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        setCredentials: mockSetCredentials,
        getAccessToken: mockGetAccessToken,
        credentials: mockTokens,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue(mockState as never);
      vi.mocked(open).mockImplementation(async () => ({}) as never);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: "test-google-account-id-123" }),
      } as unknown as Response);

      let requestCallback!: http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;

      let serverListeningCallback: (value: unknown) => void;
      const serverListeningPromise = new Promise(
        (resolve) => (serverListeningCallback = resolve)
      );

      let capturedPort = 0;
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          capturedPort = port;
          if (callback) {
            callback();
          }
          serverListeningCallback(undefined);
        }),
        close: vi.fn((callback?: () => void) => {
          if (callback) {
            callback();
          }
        }),
        on: vi.fn(),
        address: () => ({ port: capturedPort }),
      };
      vi.mocked(http.createServer).mockImplementation((cb) => {
        requestCallback = cb as http.RequestListener<
          typeof http.IncomingMessage,
          typeof http.ServerResponse
        >;
        return mockHttpServer as unknown as http.Server;
      });

      const clientPromise = getOauthClient();
      await serverListeningPromise;

      const mockReq = {
        url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
      } as http.IncomingMessage;
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as http.ServerResponse;

      await requestCallback(mockReq, mockRes);

      const client = await clientPromise;
      expect(client).toBe(mockOAuth2Client);
    });

    it("should handle OAuth callback with error parameter", async () => {
      const mockAuthUrl = "https://example.com/auth";
      const mockState = "test-state";

      const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue(mockState as never);
      vi.mocked(open).mockImplementation(async () => ({}) as never);

      let requestCallback!: http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;

      let serverListeningCallback: (value: unknown) => void;
      const serverListeningPromise = new Promise(
        (resolve) => (serverListeningCallback = resolve)
      );

      let capturedPort = 0;
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          capturedPort = port;
          if (callback) {
            callback();
          }
          serverListeningCallback(undefined);
        }),
        close: vi.fn((callback?: () => void) => {
          if (callback) {
            callback();
          }
        }),
        on: vi.fn(),
        address: () => ({ port: capturedPort }),
      };
      vi.mocked(http.createServer).mockImplementation((cb) => {
        requestCallback = cb as http.RequestListener<
          typeof http.IncomingMessage,
          typeof http.ServerResponse
        >;
        return mockHttpServer as unknown as http.Server;
      });

      const clientPromise = getOauthClient();
      await serverListeningPromise;

      const mockReq = {
        url: `/oauth2callback?error=access_denied&state=${mockState}`,
      } as http.IncomingMessage;
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as http.ServerResponse;

      await expect(async () => {
        await requestCallback(mockReq, mockRes);
        await clientPromise;
      }).rejects.toThrow();

      expect(mockRes.writeHead).toHaveBeenCalledWith(400, {
        "Content-Type": "text/html",
      });
    });

    it("should handle OAuth callback with invalid state parameter", async () => {
      const mockAuthUrl = "https://example.com/auth";
      const mockCode = "test-code";
      const mockState = "test-state";
      const wrongState = "wrong-state";

      const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue(mockState as never);
      vi.mocked(open).mockImplementation(async () => ({}) as never);

      let requestCallback!: http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;

      let serverListeningCallback: (value: unknown) => void;
      const serverListeningPromise = new Promise(
        (resolve) => (serverListeningCallback = resolve)
      );

      let capturedPort = 0;
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          capturedPort = port;
          if (callback) {
            callback();
          }
          serverListeningCallback(undefined);
        }),
        close: vi.fn((callback?: () => void) => {
          if (callback) {
            callback();
          }
        }),
        on: vi.fn(),
        address: () => ({ port: capturedPort }),
      };
      vi.mocked(http.createServer).mockImplementation((cb) => {
        requestCallback = cb as http.RequestListener<
          typeof http.IncomingMessage,
          typeof http.ServerResponse
        >;
        return mockHttpServer as unknown as http.Server;
      });

      const clientPromise = getOauthClient();
      await serverListeningPromise;

      const mockReq = {
        url: `/oauth2callback?code=${mockCode}&state=${wrongState}`,
      } as http.IncomingMessage;
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as http.ServerResponse;

      await expect(async () => {
        await requestCallback(mockReq, mockRes);
        await clientPromise;
      }).rejects.toThrow();

      expect(mockRes.writeHead).toHaveBeenCalledWith(400, {
        "Content-Type": "text/html",
      });
    });

    it("should handle token exchange failure", async () => {
      const mockAuthUrl = "https://example.com/auth";
      const mockCode = "test-code";
      const mockState = "test-state";

      const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
      const mockGetToken = vi.fn().mockRejectedValue(new Error("Token exchange failed"));
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue(mockState as never);
      vi.mocked(open).mockImplementation(async () => ({}) as never);

      let requestCallback!: http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;

      let serverListeningCallback: (value: unknown) => void;
      const serverListeningPromise = new Promise(
        (resolve) => (serverListeningCallback = resolve)
      );

      let capturedPort = 0;
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          capturedPort = port;
          if (callback) {
            callback();
          }
          serverListeningCallback(undefined);
        }),
        close: vi.fn((callback?: () => void) => {
          if (callback) {
            callback();
          }
        }),
        on: vi.fn(),
        address: () => ({ port: capturedPort }),
      };
      vi.mocked(http.createServer).mockImplementation((cb) => {
        requestCallback = cb as http.RequestListener<
          typeof http.IncomingMessage,
          typeof http.ServerResponse
        >;
        return mockHttpServer as unknown as http.Server;
      });

      const clientPromise = getOauthClient();
      await serverListeningPromise;

      const mockReq = {
        url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
      } as http.IncomingMessage;
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as http.ServerResponse;

      await expect(async () => {
        await requestCallback(mockReq, mockRes);
        await clientPromise;
      }).rejects.toThrow("Token exchange failed");

      expect(mockGetToken).toHaveBeenCalledWith({
        code: mockCode,
        redirect_uri: `http://localhost:${capturedPort}/oauth2callback`,
      });
    });

    it("should handle Google UserInfo API failure", async () => {
      const mockAuthUrl = "https://example.com/auth";
      const mockCode = "test-code";
      const mockState = "test-state";
      const mockTokens = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
      };

      const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      const mockSetCredentials = vi.fn();
      const mockGetAccessToken = vi
        .fn()
        .mockResolvedValue({ token: "mock-access-token" });
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        setCredentials: mockSetCredentials,
        getAccessToken: mockGetAccessToken,
        credentials: mockTokens,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue(mockState as never);
      vi.mocked(open).mockImplementation(async () => ({}) as never);

      // Mock fetch to return error response
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      } as unknown as Response);

      let requestCallback!: http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;

      let serverListeningCallback: (value: unknown) => void;
      const serverListeningPromise = new Promise(
        (resolve) => (serverListeningCallback = resolve)
      );

      let capturedPort = 0;
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          capturedPort = port;
          if (callback) {
            callback();
          }
          serverListeningCallback(undefined);
        }),
        close: vi.fn((callback?: () => void) => {
          if (callback) {
            callback();
          }
        }),
        on: vi.fn(),
        address: () => ({ port: capturedPort }),
      };
      vi.mocked(http.createServer).mockImplementation((cb) => {
        requestCallback = cb as http.RequestListener<
          typeof http.IncomingMessage,
          typeof http.ServerResponse
        >;
        return mockHttpServer as unknown as http.Server;
      });

      const clientPromise = getOauthClient();
      await serverListeningPromise;

      const mockReq = {
        url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
      } as http.IncomingMessage;
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as http.ServerResponse;

      // Should still succeed even if UserInfo API fails
      await requestCallback(mockReq, mockRes);
      const client = await clientPromise;
      expect(client).toBe(mockOAuth2Client);

      // Verify tokens were still stored
      const tokenPath = path.join(tempHomeDir, ".gemini", "oauth_creds.json");
      const tokenData = JSON.parse(fs.readFileSync(tokenPath, "utf-8"));
      expect(tokenData).toEqual(mockTokens);
    });

    it("should handle concurrent getOauthClient calls", async () => {
      const mockAuthUrl = "https://example.com/auth";
      const mockCode = "test-code";
      const mockState = "test-state";
      const mockTokens = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
      };

      const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      const mockSetCredentials = vi.fn();
      const mockGetAccessToken = vi
        .fn()
        .mockResolvedValue({ token: "mock-access-token" });
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        setCredentials: mockSetCredentials,
        getAccessToken: mockGetAccessToken,
        credentials: mockTokens,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue(mockState as never);
      vi.mocked(open).mockImplementation(async () => ({}) as never);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: "test-google-account-id-123" }),
      } as unknown as Response);

      let requestCallback!: http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;

      let serverListeningCallback: (value: unknown) => void;
      const serverListeningPromise = new Promise(
        (resolve) => (serverListeningCallback = resolve)
      );

      let capturedPort = 0;
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          capturedPort = port;
          if (callback) {
            callback();
          }
          serverListeningCallback(undefined);
        }),
        close: vi.fn((callback?: () => void) => {
          if (callback) {
            callback();
          }
        }),
        on: vi.fn(),
        address: () => ({ port: capturedPort }),
      };
      vi.mocked(http.createServer).mockImplementation((cb) => {
        requestCallback = cb as http.RequestListener<
          typeof http.IncomingMessage,
          typeof http.ServerResponse
        >;
        return mockHttpServer as unknown as http.Server;
      });

      // Start multiple concurrent calls
      const clientPromise1 = getOauthClient();
      const clientPromise2 = getOauthClient();
      const clientPromise3 = getOauthClient();

      await serverListeningPromise;

      const mockReq = {
        url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
      } as http.IncomingMessage;
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as http.ServerResponse;

      await requestCallback(mockReq, mockRes);

      const [client1, client2, client3] = await Promise.all([
        clientPromise1,
        clientPromise2,
        clientPromise3,
      ]);

      // All should return the same client instance
      expect(client1).toBe(mockOAuth2Client);
      expect(client2).toBe(mockOAuth2Client);
      expect(client3).toBe(mockOAuth2Client);

      // Server should only be created once
      expect(mockHttpServer.listen).toHaveBeenCalledTimes(1);
    });
  });

  describe("getCachedGoogleAccountId", () => {
    it("should return null when no cached Google Account ID exists", () => {
      const result = getCachedGoogleAccountId();
      expect(result).toBeNull();
    });

    it("should return cached Google Account ID when it exists", () => {
      const testAccountId = "test-google-account-id-456";
      const geminiDir = path.join(tempHomeDir, ".gemini");
      fs.mkdirSync(geminiDir, { recursive: true });
      fs.writeFileSync(
        path.join(geminiDir, "google_account_id"),
        testAccountId
      );

      const result = getCachedGoogleAccountId();
      expect(result).toBe(testAccountId);
    });

    it("should handle file read errors gracefully", () => {
      // Create the directory but not the file
      const geminiDir = path.join(tempHomeDir, ".gemini");
      fs.mkdirSync(geminiDir, { recursive: true });

      const result = getCachedGoogleAccountId();
      expect(result).toBeNull();
    });

    it("should handle empty cached file", () => {
      const geminiDir = path.join(tempHomeDir, ".gemini");
      fs.mkdirSync(geminiDir, { recursive: true });
      fs.writeFileSync(path.join(geminiDir, "google_account_id"), "");

      const result = getCachedGoogleAccountId();
      expect(result).toBe("");
    });

    it("should handle whitespace in cached file", () => {
      const testAccountId = "  test-account-with-whitespace  ";
      const geminiDir = path.join(tempHomeDir, ".gemini");
      fs.mkdirSync(geminiDir, { recursive: true });
      fs.writeFileSync(
        path.join(geminiDir, "google_account_id"),
        testAccountId
      );

      const result = getCachedGoogleAccountId();
      expect(result).toBe(testAccountId);
    });
  });

  describe("edge cases and error scenarios", () => {
    it("should handle server startup failures", async () => {
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          // Simulate server startup failure
          throw new Error("Port already in use");
        }),
        close: vi.fn(),
        on: vi.fn(),
      };
      vi.mocked(http.createServer).mockImplementation(() => {
        return mockHttpServer as unknown as http.Server;
      });

      const mockGenerateAuthUrl = vi.fn().mockReturnValue("https://example.com/auth");
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue("test-state" as never);

      await expect(getOauthClient()).rejects.toThrow("Port already in use");
    });

    it("should handle browser opening failures", async () => {
      const mockAuthUrl = "https://example.com/auth";
      const mockCode = "test-code";
      const mockState = "test-state";
      const mockTokens = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
      };

      const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      const mockSetCredentials = vi.fn();
      const mockGetAccessToken = vi
        .fn()
        .mockResolvedValue({ token: "mock-access-token" });
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        setCredentials: mockSetCredentials,
        getAccessToken: mockGetAccessToken,
        credentials: mockTokens,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue(mockState as never);
      // Mock open to throw an error
      vi.mocked(open).mockRejectedValue(new Error("Failed to open browser"));

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: "test-google-account-id-123" }),
      } as unknown as Response);

      let requestCallback!: http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;

      let serverListeningCallback: (value: unknown) => void;
      const serverListeningPromise = new Promise(
        (resolve) => (serverListeningCallback = resolve)
      );

      let capturedPort = 0;
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          capturedPort = port;
          if (callback) {
            callback();
          }
          serverListeningCallback(undefined);
        }),
        close: vi.fn((callback?: () => void) => {
          if (callback) {
            callback();
          }
        }),
        on: vi.fn(),
        address: () => ({ port: capturedPort }),
      };
      vi.mocked(http.createServer).mockImplementation((cb) => {
        requestCallback = cb as http.RequestListener<
          typeof http.IncomingMessage,
          typeof http.ServerResponse
        >;
        return mockHttpServer as unknown as http.Server;
      });

      const clientPromise = getOauthClient();
      await serverListeningPromise;

      // Even if browser fails to open, the OAuth flow should continue
      // when the callback URL is accessed manually
      const mockReq = {
        url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
      } as http.IncomingMessage;
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as http.ServerResponse;

      await requestCallback(mockReq, mockRes);

      const client = await clientPromise;
      expect(client).toBe(mockOAuth2Client);
      expect(open).toHaveBeenCalledWith(mockAuthUrl);
    });

    it("should handle malformed callback URLs", async () => {
      const mockAuthUrl = "https://example.com/auth";
      const mockState = "test-state";

      const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue(mockState as never);
      vi.mocked(open).mockImplementation(async () => ({}) as never);

      let requestCallback!: http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;

      let serverListeningCallback: (value: unknown) => void;
      const serverListeningPromise = new Promise(
        (resolve) => (serverListeningCallback = resolve)
      );

      let capturedPort = 0;
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          capturedPort = port;
          if (callback) {
            callback();
          }
          serverListeningCallback(undefined);
        }),
        close: vi.fn((callback?: () => void) => {
          if (callback) {
            callback();
          }
        }),
        on: vi.fn(),
        address: () => ({ port: capturedPort }),
      };
      vi.mocked(http.createServer).mockImplementation((cb) => {
        requestCallback = cb as http.RequestListener<
          typeof http.IncomingMessage,
          typeof http.ServerResponse
        >;
        return mockHttpServer as unknown as http.Server;
      });

      const clientPromise = getOauthClient();
      await serverListeningPromise;

      // Test various malformed URLs
      const malformedUrls = [
        "/oauth2callback", // No query parameters
        "/oauth2callback?", // Empty query
        "/oauth2callback?invalid", // Invalid query
        "/oauth2callback?code=", // Empty code
        "/oauth2callback?state=", // Empty state
        "/oauth2callback?code=test&state=", // Empty state with code
        "/wrongpath?code=test&state=test", // Wrong path
      ];

      for (const url of malformedUrls) {
        const mockReq = { url } as http.IncomingMessage;
        const mockRes = {
          writeHead: vi.fn(),
          end: vi.fn(),
        } as unknown as http.ServerResponse;

        await requestCallback(mockReq, mockRes);

        if (url.startsWith("/oauth2callback")) {
          expect(mockRes.writeHead).toHaveBeenLastCalledWith(400, {
            "Content-Type": "text/html",
          });
        } else {
          expect(mockRes.writeHead).toHaveBeenLastCalledWith(404, {
            "Content-Type": "text/html",
          });
        }
      }
    });

    it("should handle cached credentials with invalid access token", async () => {
      const mockTokens = {
        access_token: "invalid-access-token",
        refresh_token: "cached-refresh-token",
      };

      // Create cached credentials
      const geminiDir = path.join(tempHomeDir, ".gemini");
      fs.mkdirSync(geminiDir, { recursive: true });
      fs.writeFileSync(
        path.join(geminiDir, "oauth_creds.json"),
        JSON.stringify(mockTokens)
      );

      const mockSetCredentials = vi.fn();
      const mockGetAccessToken = vi
        .fn()
        .mockRejectedValue(new Error("Invalid credentials"));
      const mockOAuth2Client = {
        setCredentials: mockSetCredentials,
        getAccessToken: mockGetAccessToken,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      // Mock console.log to verify re-authentication message
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // This should trigger re-authentication flow
      await expect(getOauthClient()).rejects.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Cached credentials are invalid, re-authenticating..."
      );
      expect(mockSetCredentials).toHaveBeenCalledWith(mockTokens);
      expect(mockGetAccessToken).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});

vi.mock('google-auth-library');
vi.mock('http');
vi.mock('open');
vi.mock('crypto');

// Mock fetch globally
global.fetch = vi.fn();

describe('oauth2', () => {
  let tempHomeDir: string;

  beforeEach(() => {
    tempHomeDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'gemini-cli-test-home-'),
    );
    vi.mocked(os.homedir).mockReturnValue(tempHomeDir);
  });
  afterEach(() => {
    fs.rmSync(tempHomeDir, { recursive: true, force: true });
  });

  it('should perform a web login', async () => {
    const mockAuthUrl = 'https://example.com/auth';
    const mockCode = 'test-code';
    const mockState = 'test-state';
    const mockTokens = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
    };

    const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
    const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
    const mockSetCredentials = vi.fn();
    const mockGetAccessToken = vi
      .fn()
      .mockResolvedValue({ token: 'mock-access-token' });
    const mockOAuth2Client = {
      generateAuthUrl: mockGenerateAuthUrl,
      getToken: mockGetToken,
      setCredentials: mockSetCredentials,
      getAccessToken: mockGetAccessToken,
      credentials: mockTokens,
    } as unknown as OAuth2Client;
    vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

    vi.spyOn(crypto, 'randomBytes').mockReturnValue(mockState as never);
    vi.mocked(open).mockImplementation(async () => ({}) as never);

    // Mock the UserInfo API response
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ id: 'test-google-account-id-123' }),
    } as unknown as Response);

    let requestCallback!: http.RequestListener<
      typeof http.IncomingMessage,
      typeof http.ServerResponse
    >;

    let serverListeningCallback: (value: unknown) => void;
    const serverListeningPromise = new Promise(
      (resolve) => (serverListeningCallback = resolve),
    );

    let capturedPort = 0;
    const mockHttpServer = {
      listen: vi.fn((port: number, callback?: () => void) => {
        capturedPort = port;
        if (callback) {
          callback();
        }
        serverListeningCallback(undefined);
      }),
      close: vi.fn((callback?: () => void) => {
        if (callback) {
          callback();
        }
      }),
      on: vi.fn(),
      address: () => ({ port: capturedPort }),
    };
    vi.mocked(http.createServer).mockImplementation((cb) => {
      requestCallback = cb as http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;
      return mockHttpServer as unknown as http.Server;
    });

    const clientPromise = getOauthClient();

    // wait for server to start listening.
    await serverListeningPromise;

    const mockReq = {
      url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
    } as http.IncomingMessage;
    const mockRes = {
      writeHead: vi.fn(),
      end: vi.fn(),
    } as unknown as http.ServerResponse;

    await requestCallback(mockReq, mockRes);

    const client = await clientPromise;
    expect(client).toBe(mockOAuth2Client);

    expect(open).toHaveBeenCalledWith(mockAuthUrl);
    expect(mockGetToken).toHaveBeenCalledWith({
      code: mockCode,
      redirect_uri: `http://localhost:${capturedPort}/oauth2callback`,
    });
    expect(mockSetCredentials).toHaveBeenCalledWith(mockTokens);

    const tokenPath = path.join(tempHomeDir, '.gemini', 'oauth_creds.json');
    const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
    expect(tokenData).toEqual(mockTokens);

    // Verify Google Account ID was cached
    const googleAccountIdPath = path.join(
      tempHomeDir,
      '.gemini',
      'google_account_id',
    );
    expect(fs.existsSync(googleAccountIdPath)).toBe(true);
    const cachedGoogleAccountId = fs.readFileSync(googleAccountIdPath, 'utf-8');
    expect(cachedGoogleAccountId).toBe('test-google-account-id-123');

    // Verify the getCachedGoogleAccountId function works
    expect(getCachedGoogleAccountId()).toBe('test-google-account-id-123');
  });

  describe("getOauthClient", () => {
    it("should use cached credentials when they exist", async () => {
      const mockTokens = {
        access_token: "cached-access-token",
        refresh_token: "cached-refresh-token",
      };

      // Create cached credentials
      const geminiDir = path.join(tempHomeDir, ".gemini");
      fs.mkdirSync(geminiDir, { recursive: true });
      fs.writeFileSync(
        path.join(geminiDir, "oauth_creds.json"),
        JSON.stringify(mockTokens)
      );

      const mockSetCredentials = vi.fn();
      const mockGetAccessToken = vi
        .fn()
        .mockResolvedValue({ token: "mock-access-token" });
      const mockOAuth2Client = {
        setCredentials: mockSetCredentials,
        getAccessToken: mockGetAccessToken,
        credentials: mockTokens,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      const client = await getOauthClient();

      expect(client).toBe(mockOAuth2Client);
      expect(mockSetCredentials).toHaveBeenCalledWith(mockTokens);
      expect(mockGetAccessToken).toHaveBeenCalled();
    });

    it("should handle invalid cached credentials gracefully", async () => {
      // Create invalid cached credentials
      const geminiDir = path.join(tempHomeDir, ".gemini");
      fs.mkdirSync(geminiDir, { recursive: true });
      fs.writeFileSync(
        path.join(geminiDir, "oauth_creds.json"),
        "invalid json"
      );

      const mockAuthUrl = "https://example.com/auth";
      const mockCode = "test-code";
      const mockState = "test-state";
      const mockTokens = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
      };

      const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      const mockSetCredentials = vi.fn();
      const mockGetAccessToken = vi
        .fn()
        .mockResolvedValue({ token: "mock-access-token" });
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        setCredentials: mockSetCredentials,
        getAccessToken: mockGetAccessToken,
        credentials: mockTokens,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue(mockState as never);
      vi.mocked(open).mockImplementation(async () => ({}) as never);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: "test-google-account-id-123" }),
      } as unknown as Response);

      let requestCallback!: http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;

      let serverListeningCallback: (value: unknown) => void;
      const serverListeningPromise = new Promise(
        (resolve) => (serverListeningCallback = resolve)
      );

      let capturedPort = 0;
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          capturedPort = port;
          if (callback) {
            callback();
          }
          serverListeningCallback(undefined);
        }),
        close: vi.fn((callback?: () => void) => {
          if (callback) {
            callback();
          }
        }),
        on: vi.fn(),
        address: () => ({ port: capturedPort }),
      };
      vi.mocked(http.createServer).mockImplementation((cb) => {
        requestCallback = cb as http.RequestListener<
          typeof http.IncomingMessage,
          typeof http.ServerResponse
        >;
        return mockHttpServer as unknown as http.Server;
      });

      const clientPromise = getOauthClient();
      await serverListeningPromise;

      const mockReq = {
        url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
      } as http.IncomingMessage;
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as http.ServerResponse;

      await requestCallback(mockReq, mockRes);

      const client = await clientPromise;
      expect(client).toBe(mockOAuth2Client);
    });

    it("should handle missing home directory gracefully", async () => {
      vi.mocked(os.homedir).mockReturnValue("");

      const mockAuthUrl = "https://example.com/auth";
      const mockCode = "test-code";
      const mockState = "test-state";
      const mockTokens = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
      };

      const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      const mockSetCredentials = vi.fn();
      const mockGetAccessToken = vi
        .fn()
        .mockResolvedValue({ token: "mock-access-token" });
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        setCredentials: mockSetCredentials,
        getAccessToken: mockGetAccessToken,
        credentials: mockTokens,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue(mockState as never);
      vi.mocked(open).mockImplementation(async () => ({}) as never);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: "test-google-account-id-123" }),
      } as unknown as Response);

      let requestCallback!: http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;

      let serverListeningCallback: (value: unknown) => void;
      const serverListeningPromise = new Promise(
        (resolve) => (serverListeningCallback = resolve)
      );

      let capturedPort = 0;
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          capturedPort = port;
          if (callback) {
            callback();
          }
          serverListeningCallback(undefined);
        }),
        close: vi.fn((callback?: () => void) => {
          if (callback) {
            callback();
          }
        }),
        on: vi.fn(),
        address: () => ({ port: capturedPort }),
      };
      vi.mocked(http.createServer).mockImplementation((cb) => {
        requestCallback = cb as http.RequestListener<
          typeof http.IncomingMessage,
          typeof http.ServerResponse
        >;
        return mockHttpServer as unknown as http.Server;
      });

      const clientPromise = getOauthClient();
      await serverListeningPromise;

      const mockReq = {
        url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
      } as http.IncomingMessage;
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as http.ServerResponse;

      await requestCallback(mockReq, mockRes);

      const client = await clientPromise;
      expect(client).toBe(mockOAuth2Client);
    });

    it("should handle OAuth callback with error parameter", async () => {
      const mockAuthUrl = "https://example.com/auth";
      const mockState = "test-state";

      const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue(mockState as never);
      vi.mocked(open).mockImplementation(async () => ({}) as never);

      let requestCallback!: http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;

      let serverListeningCallback: (value: unknown) => void;
      const serverListeningPromise = new Promise(
        (resolve) => (serverListeningCallback = resolve)
      );

      let capturedPort = 0;
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          capturedPort = port;
          if (callback) {
            callback();
          }
          serverListeningCallback(undefined);
        }),
        close: vi.fn((callback?: () => void) => {
          if (callback) {
            callback();
          }
        }),
        on: vi.fn(),
        address: () => ({ port: capturedPort }),
      };
      vi.mocked(http.createServer).mockImplementation((cb) => {
        requestCallback = cb as http.RequestListener<
          typeof http.IncomingMessage,
          typeof http.ServerResponse
        >;
        return mockHttpServer as unknown as http.Server;
      });

      const clientPromise = getOauthClient();
      await serverListeningPromise;

      const mockReq = {
        url: `/oauth2callback?error=access_denied&state=${mockState}`,
      } as http.IncomingMessage;
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as http.ServerResponse;

      await expect(async () => {
        await requestCallback(mockReq, mockRes);
        await clientPromise;
      }).rejects.toThrow();

      expect(mockRes.writeHead).toHaveBeenCalledWith(400, {
        "Content-Type": "text/html",
      });
    });

    it("should handle OAuth callback with invalid state parameter", async () => {
      const mockAuthUrl = "https://example.com/auth";
      const mockCode = "test-code";
      const mockState = "test-state";
      const wrongState = "wrong-state";

      const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue(mockState as never);
      vi.mocked(open).mockImplementation(async () => ({}) as never);

      let requestCallback!: http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;

      let serverListeningCallback: (value: unknown) => void;
      const serverListeningPromise = new Promise(
        (resolve) => (serverListeningCallback = resolve)
      );

      let capturedPort = 0;
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          capturedPort = port;
          if (callback) {
            callback();
          }
          serverListeningCallback(undefined);
        }),
        close: vi.fn((callback?: () => void) => {
          if (callback) {
            callback();
          }
        }),
        on: vi.fn(),
        address: () => ({ port: capturedPort }),
      };
      vi.mocked(http.createServer).mockImplementation((cb) => {
        requestCallback = cb as http.RequestListener<
          typeof http.IncomingMessage,
          typeof http.ServerResponse
        >;
        return mockHttpServer as unknown as http.Server;
      });

      const clientPromise = getOauthClient();
      await serverListeningPromise;

      const mockReq = {
        url: `/oauth2callback?code=${mockCode}&state=${wrongState}`,
      } as http.IncomingMessage;
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as http.ServerResponse;

      await expect(async () => {
        await requestCallback(mockReq, mockRes);
        await clientPromise;
      }).rejects.toThrow();

      expect(mockRes.writeHead).toHaveBeenCalledWith(400, {
        "Content-Type": "text/html",
      });
    });

    it("should handle token exchange failure", async () => {
      const mockAuthUrl = "https://example.com/auth";
      const mockCode = "test-code";
      const mockState = "test-state";

      const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
      const mockGetToken = vi.fn().mockRejectedValue(new Error("Token exchange failed"));
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue(mockState as never);
      vi.mocked(open).mockImplementation(async () => ({}) as never);

      let requestCallback!: http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;

      let serverListeningCallback: (value: unknown) => void;
      const serverListeningPromise = new Promise(
        (resolve) => (serverListeningCallback = resolve)
      );

      let capturedPort = 0;
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          capturedPort = port;
          if (callback) {
            callback();
          }
          serverListeningCallback(undefined);
        }),
        close: vi.fn((callback?: () => void) => {
          if (callback) {
            callback();
          }
        }),
        on: vi.fn(),
        address: () => ({ port: capturedPort }),
      };
      vi.mocked(http.createServer).mockImplementation((cb) => {
        requestCallback = cb as http.RequestListener<
          typeof http.IncomingMessage,
          typeof http.ServerResponse
        >;
        return mockHttpServer as unknown as http.Server;
      });

      const clientPromise = getOauthClient();
      await serverListeningPromise;

      const mockReq = {
        url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
      } as http.IncomingMessage;
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as http.ServerResponse;

      await expect(async () => {
        await requestCallback(mockReq, mockRes);
        await clientPromise;
      }).rejects.toThrow("Token exchange failed");

      expect(mockGetToken).toHaveBeenCalledWith({
        code: mockCode,
        redirect_uri: `http://localhost:${capturedPort}/oauth2callback`,
      });
    });

    it("should handle Google UserInfo API failure", async () => {
      const mockAuthUrl = "https://example.com/auth";
      const mockCode = "test-code";
      const mockState = "test-state";
      const mockTokens = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
      };

      const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      const mockSetCredentials = vi.fn();
      const mockGetAccessToken = vi
        .fn()
        .mockResolvedValue({ token: "mock-access-token" });
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        setCredentials: mockSetCredentials,
        getAccessToken: mockGetAccessToken,
        credentials: mockTokens,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue(mockState as never);
      vi.mocked(open).mockImplementation(async () => ({}) as never);

      // Mock fetch to return error response
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
      } as unknown as Response);

      let requestCallback!: http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;

      let serverListeningCallback: (value: unknown) => void;
      const serverListeningPromise = new Promise(
        (resolve) => (serverListeningCallback = resolve)
      );

      let capturedPort = 0;
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          capturedPort = port;
          if (callback) {
            callback();
          }
          serverListeningCallback(undefined);
        }),
        close: vi.fn((callback?: () => void) => {
          if (callback) {
            callback();
          }
        }),
        on: vi.fn(),
        address: () => ({ port: capturedPort }),
      };
      vi.mocked(http.createServer).mockImplementation((cb) => {
        requestCallback = cb as http.RequestListener<
          typeof http.IncomingMessage,
          typeof http.ServerResponse
        >;
        return mockHttpServer as unknown as http.Server;
      });

      const clientPromise = getOauthClient();
      await serverListeningPromise;

      const mockReq = {
        url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
      } as http.IncomingMessage;
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as http.ServerResponse;

      // Should still succeed even if UserInfo API fails
      await requestCallback(mockReq, mockRes);
      const client = await clientPromise;
      expect(client).toBe(mockOAuth2Client);

      // Verify tokens were still stored
      const tokenPath = path.join(tempHomeDir, ".gemini", "oauth_creds.json");
      const tokenData = JSON.parse(fs.readFileSync(tokenPath, "utf-8"));
      expect(tokenData).toEqual(mockTokens);
    });

    it("should handle concurrent getOauthClient calls", async () => {
      const mockAuthUrl = "https://example.com/auth";
      const mockCode = "test-code";
      const mockState = "test-state";
      const mockTokens = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
      };

      const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      const mockSetCredentials = vi.fn();
      const mockGetAccessToken = vi
        .fn()
        .mockResolvedValue({ token: "mock-access-token" });
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        setCredentials: mockSetCredentials,
        getAccessToken: mockGetAccessToken,
        credentials: mockTokens,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue(mockState as never);
      vi.mocked(open).mockImplementation(async () => ({}) as never);

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: "test-google-account-id-123" }),
      } as unknown as Response);

      let requestCallback!: http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;

      let serverListeningCallback: (value: unknown) => void;
      const serverListeningPromise = new Promise(
        (resolve) => (serverListeningCallback = resolve)
      );

      let capturedPort = 0;
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          capturedPort = port;
          if (callback) {
            callback();
          }
          serverListeningCallback(undefined);
        }),
        close: vi.fn((callback?: () => void) => {
          if (callback) {
            callback();
          }
        }),
        on: vi.fn(),
        address: () => ({ port: capturedPort }),
      };
      vi.mocked(http.createServer).mockImplementation((cb) => {
        requestCallback = cb as http.RequestListener<
          typeof http.IncomingMessage,
          typeof http.ServerResponse
        >;
        return mockHttpServer as unknown as http.Server;
      });

      // Start multiple concurrent calls
      const clientPromise1 = getOauthClient();
      const clientPromise2 = getOauthClient();
      const clientPromise3 = getOauthClient();

      await serverListeningPromise;

      const mockReq = {
        url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
      } as http.IncomingMessage;
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as http.ServerResponse;

      await requestCallback(mockReq, mockRes);

      const [client1, client2, client3] = await Promise.all([
        clientPromise1,
        clientPromise2,
        clientPromise3,
      ]);

      // All should return the same client instance
      expect(client1).toBe(mockOAuth2Client);
      expect(client2).toBe(mockOAuth2Client);
      expect(client3).toBe(mockOAuth2Client);

      // Server should only be created once
      expect(mockHttpServer.listen).toHaveBeenCalledTimes(1);
    });
  });

  describe("getCachedGoogleAccountId", () => {
    it("should return null when no cached Google Account ID exists", () => {
      const result = getCachedGoogleAccountId();
      expect(result).toBeNull();
    });

    it("should return cached Google Account ID when it exists", () => {
      const testAccountId = "test-google-account-id-456";
      const geminiDir = path.join(tempHomeDir, ".gemini");
      fs.mkdirSync(geminiDir, { recursive: true });
      fs.writeFileSync(
        path.join(geminiDir, "google_account_id"),
        testAccountId
      );

      const result = getCachedGoogleAccountId();
      expect(result).toBe(testAccountId);
    });

    it("should handle file read errors gracefully", () => {
      // Create the directory but not the file
      const geminiDir = path.join(tempHomeDir, ".gemini");
      fs.mkdirSync(geminiDir, { recursive: true });

      const result = getCachedGoogleAccountId();
      expect(result).toBeNull();
    });

    it("should handle empty cached file", () => {
      const geminiDir = path.join(tempHomeDir, ".gemini");
      fs.mkdirSync(geminiDir, { recursive: true });
      fs.writeFileSync(path.join(geminiDir, "google_account_id"), "");

      const result = getCachedGoogleAccountId();
      expect(result).toBe("");
    });

    it("should handle whitespace in cached file", () => {
      const testAccountId = "  test-account-with-whitespace  ";
      const geminiDir = path.join(tempHomeDir, ".gemini");
      fs.mkdirSync(geminiDir, { recursive: true });
      fs.writeFileSync(
        path.join(geminiDir, "google_account_id"),
        testAccountId
      );

      const result = getCachedGoogleAccountId();
      expect(result).toBe(testAccountId);
    });
  });

  describe("edge cases and error scenarios", () => {
    it("should handle server startup failures", async () => {
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          // Simulate server startup failure
          throw new Error("Port already in use");
        }),
        close: vi.fn(),
        on: vi.fn(),
      };
      vi.mocked(http.createServer).mockImplementation(() => {
        return mockHttpServer as unknown as http.Server;
      });

      const mockGenerateAuthUrl = vi.fn().mockReturnValue("https://example.com/auth");
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue("test-state" as never);

      await expect(getOauthClient()).rejects.toThrow("Port already in use");
    });

    it("should handle browser opening failures", async () => {
      const mockAuthUrl = "https://example.com/auth";
      const mockCode = "test-code";
      const mockState = "test-state";
      const mockTokens = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
      };

      const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
      const mockGetToken = vi.fn().mockResolvedValue({ tokens: mockTokens });
      const mockSetCredentials = vi.fn();
      const mockGetAccessToken = vi
        .fn()
        .mockResolvedValue({ token: "mock-access-token" });
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        setCredentials: mockSetCredentials,
        getAccessToken: mockGetAccessToken,
        credentials: mockTokens,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue(mockState as never);
      // Mock open to throw an error
      vi.mocked(open).mockRejectedValue(new Error("Failed to open browser"));

      vi.mocked(global.fetch).mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ id: "test-google-account-id-123" }),
      } as unknown as Response);

      let requestCallback!: http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;

      let serverListeningCallback: (value: unknown) => void;
      const serverListeningPromise = new Promise(
        (resolve) => (serverListeningCallback = resolve)
      );

      let capturedPort = 0;
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          capturedPort = port;
          if (callback) {
            callback();
          }
          serverListeningCallback(undefined);
        }),
        close: vi.fn((callback?: () => void) => {
          if (callback) {
            callback();
          }
        }),
        on: vi.fn(),
        address: () => ({ port: capturedPort }),
      };
      vi.mocked(http.createServer).mockImplementation((cb) => {
        requestCallback = cb as http.RequestListener<
          typeof http.IncomingMessage,
          typeof http.ServerResponse
        >;
        return mockHttpServer as unknown as http.Server;
      });

      const clientPromise = getOauthClient();
      await serverListeningPromise;

      // Even if browser fails to open, the OAuth flow should continue
      // when the callback URL is accessed manually
      const mockReq = {
        url: `/oauth2callback?code=${mockCode}&state=${mockState}`,
      } as http.IncomingMessage;
      const mockRes = {
        writeHead: vi.fn(),
        end: vi.fn(),
      } as unknown as http.ServerResponse;

      await requestCallback(mockReq, mockRes);

      const client = await clientPromise;
      expect(client).toBe(mockOAuth2Client);
      expect(open).toHaveBeenCalledWith(mockAuthUrl);
    });

    it("should handle malformed callback URLs", async () => {
      const mockAuthUrl = "https://example.com/auth";
      const mockState = "test-state";

      const mockGenerateAuthUrl = vi.fn().mockReturnValue(mockAuthUrl);
      const mockOAuth2Client = {
        generateAuthUrl: mockGenerateAuthUrl,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      vi.spyOn(crypto, "randomBytes").mockReturnValue(mockState as never);
      vi.mocked(open).mockImplementation(async () => ({}) as never);

      let requestCallback!: http.RequestListener<
        typeof http.IncomingMessage,
        typeof http.ServerResponse
      >;

      let serverListeningCallback: (value: unknown) => void;
      const serverListeningPromise = new Promise(
        (resolve) => (serverListeningCallback = resolve)
      );

      let capturedPort = 0;
      const mockHttpServer = {
        listen: vi.fn((port: number, callback?: () => void) => {
          capturedPort = port;
          if (callback) {
            callback();
          }
          serverListeningCallback(undefined);
        }),
        close: vi.fn((callback?: () => void) => {
          if (callback) {
            callback();
          }
        }),
        on: vi.fn(),
        address: () => ({ port: capturedPort }),
      };
      vi.mocked(http.createServer).mockImplementation((cb) => {
        requestCallback = cb as http.RequestListener<
          typeof http.IncomingMessage,
          typeof http.ServerResponse
        >;
        return mockHttpServer as unknown as http.Server;
      });

      const clientPromise = getOauthClient();
      await serverListeningPromise;

      // Test various malformed URLs
      const malformedUrls = [
        "/oauth2callback", // No query parameters
        "/oauth2callback?", // Empty query
        "/oauth2callback?invalid", // Invalid query
        "/oauth2callback?code=", // Empty code
        "/oauth2callback?state=", // Empty state
        "/oauth2callback?code=test&state=", // Empty state with code
        "/wrongpath?code=test&state=test", // Wrong path
      ];

      for (const url of malformedUrls) {
        const mockReq = { url } as http.IncomingMessage;
        const mockRes = {
          writeHead: vi.fn(),
          end: vi.fn(),
        } as unknown as http.ServerResponse;

        await requestCallback(mockReq, mockRes);

        if (url.startsWith("/oauth2callback")) {
          expect(mockRes.writeHead).toHaveBeenLastCalledWith(400, {
            "Content-Type": "text/html",
          });
        } else {
          expect(mockRes.writeHead).toHaveBeenLastCalledWith(404, {
            "Content-Type": "text/html",
          });
        }
      }
    });

    it("should handle cached credentials with invalid access token", async () => {
      const mockTokens = {
        access_token: "invalid-access-token",
        refresh_token: "cached-refresh-token",
      };

      // Create cached credentials
      const geminiDir = path.join(tempHomeDir, ".gemini");
      fs.mkdirSync(geminiDir, { recursive: true });
      fs.writeFileSync(
        path.join(geminiDir, "oauth_creds.json"),
        JSON.stringify(mockTokens)
      );

      const mockSetCredentials = vi.fn();
      const mockGetAccessToken = vi
        .fn()
        .mockRejectedValue(new Error("Invalid credentials"));
      const mockOAuth2Client = {
        setCredentials: mockSetCredentials,
        getAccessToken: mockGetAccessToken,
      } as unknown as OAuth2Client;
      vi.mocked(OAuth2Client).mockImplementation(() => mockOAuth2Client);

      // Mock console.log to verify re-authentication message
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      // This should trigger re-authentication flow
      await expect(getOauthClient()).rejects.toThrow();

      expect(consoleSpy).toHaveBeenCalledWith(
        "Cached credentials are invalid, re-authenticating..."
      );
      expect(mockSetCredentials).toHaveBeenCalledWith(mockTokens);
      expect(mockGetAccessToken).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });
});
