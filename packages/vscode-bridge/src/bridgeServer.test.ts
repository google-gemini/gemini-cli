// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as http from 'http';
import { WebSocketServer } from 'ws';
import { BridgeServer } from './bridgeServer.js';
import { Logger } from './logger.js';
import { CopilotService } from './copilotService.js';

// Mock dependencies
vi.mock('./logger.js');
vi.mock('./copilotService.js');
vi.mock('http');
vi.mock('ws');

describe('BridgeServer', () => {
  let bridgeServer: BridgeServer;
  let mockLogger: any;
  let mockCopilotService: any;
  let mockHttpServer: any;
  let mockWss: any;

  beforeEach(() => {
    // Setup mocks
    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    mockCopilotService = {
      initialize: vi.fn().mockResolvedValue(undefined),
      healthCheck: vi.fn().mockResolvedValue(true),
      listModels: vi.fn().mockResolvedValue([
        { id: 'gpt-4', name: 'GPT-4', vendor: 'copilot', family: 'gpt' }
      ]),
      chat: vi.fn().mockResolvedValue({
        choices: [{ message: { content: 'Test response' } }],
        model: 'gpt-4'
      }),
      chatStream: vi.fn().mockImplementation(async function* () {
        yield { choices: [{ delta: { content: 'Test' } }], model: 'gpt-4' };
        yield { choices: [{ delta: { content: ' stream' } }], model: 'gpt-4' };
      })
    };

    // Mock Logger constructor
    (Logger as any).mockImplementation(() => mockLogger);

    // Mock CopilotService constructor
    (CopilotService as any).mockImplementation(() => mockCopilotService);

    // Mock HTTP server
    mockHttpServer = {
      listen: vi.fn((port: number, callback: Function) => callback()),
      close: vi.fn((callback: Function) => callback()),
      on: vi.fn()
    };
    (http.createServer as any).mockReturnValue(mockHttpServer);

    // Mock WebSocket server
    mockWss = {
      on: vi.fn(),
      close: vi.fn((callback: Function) => callback())
    };
    (WebSocketServer as any).mockImplementation(() => mockWss);

    bridgeServer = new BridgeServer(7337, mockLogger);
  });

  afterEach(async () => {
    if (bridgeServer?.isRunning()) {
      await bridgeServer.stop();
    }
  });

  describe('start', () => {
    it('should start the server successfully', async () => {
      await bridgeServer.start();

      expect(bridgeServer.isRunning()).toBe(true);
      expect(mockCopilotService.initialize).toHaveBeenCalled();
      expect(mockHttpServer.listen).toHaveBeenCalledWith(7337, expect.any(Function));
      expect(mockLogger.info).toHaveBeenCalledWith('Bridge server listening on port 7337');
    });

    it('should throw error if already running', async () => {
      await bridgeServer.start();
      
      await expect(bridgeServer.start()).rejects.toThrow('Server is already running');
    });

    it('should handle initialization errors', async () => {
      mockCopilotService.initialize.mockRejectedValueOnce(new Error('Init failed'));

      await expect(bridgeServer.start()).rejects.toThrow('Init failed');
      expect(bridgeServer.isRunning()).toBe(false);
    });
  });

  describe('stop', () => {
    it('should stop the server successfully', async () => {
      await bridgeServer.start();
      await bridgeServer.stop();

      expect(bridgeServer.isRunning()).toBe(false);
      expect(mockWss.close).toHaveBeenCalled();
      expect(mockHttpServer.close).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('Bridge server stopped');
    });

    it('should do nothing if not running', async () => {
      await bridgeServer.stop();

      expect(mockWss.close).not.toHaveBeenCalled();
      expect(mockHttpServer.close).not.toHaveBeenCalled();
    });
  });

  describe('HTTP endpoints', () => {
    let requestHandler: Function;
    let mockReq: any;
    let mockRes: any;

    beforeEach(async () => {
      await bridgeServer.start();

      // Capture the request handler
      requestHandler = (http.createServer as any).mock.calls[0][0];

      // Setup mock request and response
      mockReq = {
        url: '/health',
        method: 'GET',
        on: vi.fn()
      };

      mockRes = {
        setHeader: vi.fn(),
        writeHead: vi.fn(),
        end: vi.fn()
      };
    });

    it('should handle OPTIONS requests', async () => {
      mockReq.method = 'OPTIONS';
      
      await requestHandler(mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
      expect(mockRes.writeHead).toHaveBeenCalledWith(204);
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should handle /health endpoint', async () => {
      mockReq.url = '/health';
      
      await requestHandler(mockReq, mockRes);

      expect(mockCopilotService.healthCheck).toHaveBeenCalled();
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
      expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('"status":"ok"'));
    });

    it('should handle /models endpoint', async () => {
      mockReq.url = '/models';
      
      await requestHandler(mockReq, mockRes);

      expect(mockCopilotService.listModels).toHaveBeenCalled();
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
      expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('"models"'));
    });

    it('should handle /chat endpoint', async () => {
      mockReq.url = '/chat';
      mockReq.method = 'POST';
      
      // Simulate request body
      mockReq.on.mockImplementation((event: string, handler: Function) => {
        if (event === 'data') {
          handler(JSON.stringify({
            messages: [{ role: 'user', content: 'Hello' }]
          }));
        }
        if (event === 'end') {
          handler();
        }
      });

      await requestHandler(mockReq, mockRes);

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCopilotService.chat).toHaveBeenCalledWith(expect.objectContaining({
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false
      }));
      expect(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
    });

    it('should return 404 for unknown endpoints', async () => {
      mockReq.url = '/unknown';
      
      await requestHandler(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'application/json' });
      expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('"error":"Not found"'));
    });

    it('should handle errors gracefully', async () => {
      mockReq.url = '/models';
      mockCopilotService.listModels.mockRejectedValueOnce(new Error('Service error'));
      
      await requestHandler(mockReq, mockRes);

      expect(mockRes.writeHead).toHaveBeenCalledWith(500, { 'Content-Type': 'application/json' });
      expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('"error"'));
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('WebSocket handling', () => {
    let connectionHandler: Function;
    let mockWs: any;

    beforeEach(async () => {
      await bridgeServer.start();

      // Capture the connection handler
      connectionHandler = mockWss.on.mock.calls.find(
        (call: any) => call[0] === 'connection'
      )[1];

      // Setup mock WebSocket
      mockWs = {
        on: vi.fn(),
        send: vi.fn()
      };
    });

    it('should handle WebSocket chat requests', async () => {
      connectionHandler(mockWs);

      // Capture message handler
      const messageHandler = mockWs.on.mock.calls.find(
        (call: any) => call[0] === 'message'
      )[1];

      // Send chat request
      await messageHandler(JSON.stringify({
        type: 'chat',
        data: {
          messages: [{ role: 'user', content: 'Hello' }]
        }
      }));

      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(mockCopilotService.chatStream).toHaveBeenCalled();
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"chat_chunk"'));
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"chat_done"'));
    });

    it('should handle invalid WebSocket messages', async () => {
      connectionHandler(mockWs);

      const messageHandler = mockWs.on.mock.calls.find(
        (call: any) => call[0] === 'message'
      )[1];

      await messageHandler('invalid json');

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"error":"Invalid request format"'));
    });

    it('should handle unknown request types', async () => {
      connectionHandler(mockWs);

      const messageHandler = mockWs.on.mock.calls.find(
        (call: any) => call[0] === 'message'
      )[1];

      await messageHandler(JSON.stringify({
        type: 'unknown',
        data: {}
      }));

      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"error"'));
      expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"error":"Unknown request type"'));
    });

    it('should log WebSocket events', () => {
      connectionHandler(mockWs);

      // Trigger close event
      const closeHandler = mockWs.on.mock.calls.find(
        (call: any) => call[0] === 'close'
      )[1];
      closeHandler();

      expect(mockLogger.debug).toHaveBeenCalledWith('WebSocket connection established');
      expect(mockLogger.debug).toHaveBeenCalledWith('WebSocket connection closed');
    });
  });
});