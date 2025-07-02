"use strict";
// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const http = require("http");
const ws_1 = require("ws");
const bridgeServer_js_1 = require("./bridgeServer.js");
const logger_js_1 = require("./logger.js");
const copilotService_js_1 = require("./copilotService.js");
// Mock dependencies
vitest_1.vi.mock('./logger.js');
vitest_1.vi.mock('./copilotService.js');
vitest_1.vi.mock('http');
vitest_1.vi.mock('ws');
(0, vitest_1.describe)('BridgeServer', () => {
    let bridgeServer;
    let mockLogger;
    let mockCopilotService;
    let mockHttpServer;
    let mockWss;
    (0, vitest_1.beforeEach)(() => {
        // Setup mocks
        mockLogger = {
            info: vitest_1.vi.fn(),
            debug: vitest_1.vi.fn(),
            warn: vitest_1.vi.fn(),
            error: vitest_1.vi.fn()
        };
        mockCopilotService = {
            initialize: vitest_1.vi.fn().mockResolvedValue(undefined),
            healthCheck: vitest_1.vi.fn().mockResolvedValue(true),
            listModels: vitest_1.vi.fn().mockResolvedValue([
                { id: 'gpt-4', name: 'GPT-4', vendor: 'copilot', family: 'gpt' }
            ]),
            chat: vitest_1.vi.fn().mockResolvedValue({
                choices: [{ message: { content: 'Test response' } }],
                model: 'gpt-4'
            }),
            chatStream: vitest_1.vi.fn().mockImplementation(async function* () {
                yield { choices: [{ delta: { content: 'Test' } }], model: 'gpt-4' };
                yield { choices: [{ delta: { content: ' stream' } }], model: 'gpt-4' };
            })
        };
        // Mock Logger constructor
        logger_js_1.Logger.mockImplementation(() => mockLogger);
        // Mock CopilotService constructor
        copilotService_js_1.CopilotService.mockImplementation(() => mockCopilotService);
        // Mock HTTP server
        mockHttpServer = {
            listen: vitest_1.vi.fn((port, callback) => callback()),
            close: vitest_1.vi.fn((callback) => callback()),
            on: vitest_1.vi.fn()
        };
        http.createServer.mockReturnValue(mockHttpServer);
        // Mock WebSocket server
        mockWss = {
            on: vitest_1.vi.fn(),
            close: vitest_1.vi.fn((callback) => callback())
        };
        ws_1.WebSocketServer.mockImplementation(() => mockWss);
        bridgeServer = new bridgeServer_js_1.BridgeServer(7337, mockLogger);
    });
    (0, vitest_1.afterEach)(async () => {
        if (bridgeServer?.isRunning()) {
            await bridgeServer.stop();
        }
    });
    (0, vitest_1.describe)('start', () => {
        (0, vitest_1.it)('should start the server successfully', async () => {
            await bridgeServer.start();
            (0, vitest_1.expect)(bridgeServer.isRunning()).toBe(true);
            (0, vitest_1.expect)(mockCopilotService.initialize).toHaveBeenCalled();
            (0, vitest_1.expect)(mockHttpServer.listen).toHaveBeenCalledWith(7337, vitest_1.expect.any(Function));
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith('Bridge server listening on port 7337');
        });
        (0, vitest_1.it)('should throw error if already running', async () => {
            await bridgeServer.start();
            await (0, vitest_1.expect)(bridgeServer.start()).rejects.toThrow('Server is already running');
        });
        (0, vitest_1.it)('should handle initialization errors', async () => {
            mockCopilotService.initialize.mockRejectedValueOnce(new Error('Init failed'));
            await (0, vitest_1.expect)(bridgeServer.start()).rejects.toThrow('Init failed');
            (0, vitest_1.expect)(bridgeServer.isRunning()).toBe(false);
        });
    });
    (0, vitest_1.describe)('stop', () => {
        (0, vitest_1.it)('should stop the server successfully', async () => {
            await bridgeServer.start();
            await bridgeServer.stop();
            (0, vitest_1.expect)(bridgeServer.isRunning()).toBe(false);
            (0, vitest_1.expect)(mockWss.close).toHaveBeenCalled();
            (0, vitest_1.expect)(mockHttpServer.close).toHaveBeenCalled();
            (0, vitest_1.expect)(mockLogger.info).toHaveBeenCalledWith('Bridge server stopped');
        });
        (0, vitest_1.it)('should do nothing if not running', async () => {
            await bridgeServer.stop();
            (0, vitest_1.expect)(mockWss.close).not.toHaveBeenCalled();
            (0, vitest_1.expect)(mockHttpServer.close).not.toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)('HTTP endpoints', () => {
        let requestHandler;
        let mockReq;
        let mockRes;
        (0, vitest_1.beforeEach)(async () => {
            await bridgeServer.start();
            // Capture the request handler
            requestHandler = http.createServer.mock.calls[0][0];
            // Setup mock request and response
            mockReq = {
                url: '/health',
                method: 'GET',
                on: vitest_1.vi.fn()
            };
            mockRes = {
                setHeader: vitest_1.vi.fn(),
                writeHead: vitest_1.vi.fn(),
                end: vitest_1.vi.fn()
            };
        });
        (0, vitest_1.it)('should handle OPTIONS requests', async () => {
            mockReq.method = 'OPTIONS';
            await requestHandler(mockReq, mockRes);
            (0, vitest_1.expect)(mockRes.setHeader).toHaveBeenCalledWith('Access-Control-Allow-Origin', '*');
            (0, vitest_1.expect)(mockRes.writeHead).toHaveBeenCalledWith(204);
            (0, vitest_1.expect)(mockRes.end).toHaveBeenCalled();
        });
        (0, vitest_1.it)('should handle /health endpoint', async () => {
            mockReq.url = '/health';
            await requestHandler(mockReq, mockRes);
            (0, vitest_1.expect)(mockCopilotService.healthCheck).toHaveBeenCalled();
            (0, vitest_1.expect)(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
            (0, vitest_1.expect)(mockRes.end).toHaveBeenCalledWith(vitest_1.expect.stringContaining('"status":"ok"'));
        });
        (0, vitest_1.it)('should handle /models endpoint', async () => {
            mockReq.url = '/models';
            await requestHandler(mockReq, mockRes);
            (0, vitest_1.expect)(mockCopilotService.listModels).toHaveBeenCalled();
            (0, vitest_1.expect)(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
            (0, vitest_1.expect)(mockRes.end).toHaveBeenCalledWith(vitest_1.expect.stringContaining('"models"'));
        });
        (0, vitest_1.it)('should handle /chat endpoint', async () => {
            mockReq.url = '/chat';
            mockReq.method = 'POST';
            // Simulate request body
            mockReq.on.mockImplementation((event, handler) => {
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
            (0, vitest_1.expect)(mockCopilotService.chat).toHaveBeenCalledWith(vitest_1.expect.objectContaining({
                messages: [{ role: 'user', content: 'Hello' }],
                stream: false
            }));
            (0, vitest_1.expect)(mockRes.writeHead).toHaveBeenCalledWith(200, { 'Content-Type': 'application/json' });
        });
        (0, vitest_1.it)('should return 404 for unknown endpoints', async () => {
            mockReq.url = '/unknown';
            await requestHandler(mockReq, mockRes);
            (0, vitest_1.expect)(mockRes.writeHead).toHaveBeenCalledWith(404, { 'Content-Type': 'application/json' });
            (0, vitest_1.expect)(mockRes.end).toHaveBeenCalledWith(vitest_1.expect.stringContaining('"error":"Not found"'));
        });
        (0, vitest_1.it)('should handle errors gracefully', async () => {
            mockReq.url = '/models';
            mockCopilotService.listModels.mockRejectedValueOnce(new Error('Service error'));
            await requestHandler(mockReq, mockRes);
            (0, vitest_1.expect)(mockRes.writeHead).toHaveBeenCalledWith(500, { 'Content-Type': 'application/json' });
            (0, vitest_1.expect)(mockRes.end).toHaveBeenCalledWith(vitest_1.expect.stringContaining('"error"'));
            (0, vitest_1.expect)(mockLogger.error).toHaveBeenCalled();
        });
    });
    (0, vitest_1.describe)('WebSocket handling', () => {
        let connectionHandler;
        let mockWs;
        (0, vitest_1.beforeEach)(async () => {
            await bridgeServer.start();
            // Capture the connection handler
            connectionHandler = mockWss.on.mock.calls.find((call) => call[0] === 'connection')[1];
            // Setup mock WebSocket
            mockWs = {
                on: vitest_1.vi.fn(),
                send: vitest_1.vi.fn()
            };
        });
        (0, vitest_1.it)('should handle WebSocket chat requests', async () => {
            connectionHandler(mockWs);
            // Capture message handler
            const messageHandler = mockWs.on.mock.calls.find((call) => call[0] === 'message')[1];
            // Send chat request
            await messageHandler(JSON.stringify({
                type: 'chat',
                data: {
                    messages: [{ role: 'user', content: 'Hello' }]
                }
            }));
            // Wait for async operations
            await new Promise(resolve => setTimeout(resolve, 10));
            (0, vitest_1.expect)(mockCopilotService.chatStream).toHaveBeenCalled();
            (0, vitest_1.expect)(mockWs.send).toHaveBeenCalledWith(vitest_1.expect.stringContaining('"type":"chat_chunk"'));
            (0, vitest_1.expect)(mockWs.send).toHaveBeenCalledWith(vitest_1.expect.stringContaining('"type":"chat_done"'));
        });
        (0, vitest_1.it)('should handle invalid WebSocket messages', async () => {
            connectionHandler(mockWs);
            const messageHandler = mockWs.on.mock.calls.find((call) => call[0] === 'message')[1];
            await messageHandler('invalid json');
            (0, vitest_1.expect)(mockWs.send).toHaveBeenCalledWith(vitest_1.expect.stringContaining('"type":"error"'));
            (0, vitest_1.expect)(mockWs.send).toHaveBeenCalledWith(vitest_1.expect.stringContaining('"error":"Invalid request format"'));
        });
        (0, vitest_1.it)('should handle unknown request types', async () => {
            connectionHandler(mockWs);
            const messageHandler = mockWs.on.mock.calls.find((call) => call[0] === 'message')[1];
            await messageHandler(JSON.stringify({
                type: 'unknown',
                data: {}
            }));
            (0, vitest_1.expect)(mockWs.send).toHaveBeenCalledWith(vitest_1.expect.stringContaining('"type":"error"'));
            (0, vitest_1.expect)(mockWs.send).toHaveBeenCalledWith(vitest_1.expect.stringContaining('"error":"Unknown request type"'));
        });
        (0, vitest_1.it)('should log WebSocket events', () => {
            connectionHandler(mockWs);
            // Trigger close event
            const closeHandler = mockWs.on.mock.calls.find((call) => call[0] === 'close')[1];
            closeHandler();
            (0, vitest_1.expect)(mockLogger.debug).toHaveBeenCalledWith('WebSocket connection established');
            (0, vitest_1.expect)(mockLogger.debug).toHaveBeenCalledWith('WebSocket connection closed');
        });
    });
});
//# sourceMappingURL=bridgeServer.test.js.map