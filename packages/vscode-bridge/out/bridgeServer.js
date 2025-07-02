"use strict";
// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeServer = void 0;
const http = require("http");
const ws_1 = require("ws");
const copilotService_1 = require("./copilotService");
class BridgeServer {
    constructor(port, logger) {
        this.port = port;
        this.logger = logger;
        this.running = false;
        this.copilotService = new copilotService_1.CopilotService(logger);
    }
    async start() {
        if (this.running) {
            throw new Error('Server is already running');
        }
        // Initialize Copilot service
        await this.copilotService.initialize();
        // Create HTTP server
        this.server = http.createServer((req, res) => {
            this.handleHttpRequest(req, res);
        });
        // Create WebSocket server
        this.wss = new ws_1.WebSocketServer({ server: this.server });
        this.wss.on('connection', (ws) => {
            this.handleWebSocketConnection(ws);
        });
        // Start listening
        return new Promise((resolve, reject) => {
            this.server.listen(this.port, (err) => {
                if (err) {
                    reject(err);
                }
                else {
                    this.running = true;
                    this.logger.info(`Bridge server listening on port ${this.port}`);
                    resolve();
                }
            });
        });
    }
    async stop() {
        if (!this.running) {
            return;
        }
        return new Promise((resolve) => {
            // Close WebSocket server
            this.wss?.close(() => {
                // Close HTTP server
                this.server?.close(() => {
                    this.running = false;
                    this.logger.info('Bridge server stopped');
                    resolve();
                });
            });
        });
    }
    isRunning() {
        return this.running;
    }
    async handleHttpRequest(req, res) {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        const url = new URL(req.url, `http://localhost:${this.port}`);
        try {
            switch (url.pathname) {
                case '/health':
                    await this.handleHealth(req, res);
                    break;
                case '/models':
                    await this.handleModels(req, res);
                    break;
                case '/chat':
                    await this.handleChat(req, res);
                    break;
                default:
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Not found' }));
            }
        }
        catch (error) {
            this.logger.error(`HTTP request error: ${error}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    }
    async handleHealth(req, res) {
        const health = await this.copilotService.healthCheck();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            copilot: health ? 'available' : 'unavailable',
            timestamp: new Date().toISOString()
        }));
    }
    async handleModels(req, res) {
        try {
            const models = await this.copilotService.listModels();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ models }));
        }
        catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to list models' }));
        }
    }
    async handleChat(req, res) {
        if (req.method !== 'POST') {
            res.writeHead(405, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
        }
        // Read request body
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', async () => {
            try {
                const chatRequest = JSON.parse(body);
                if (chatRequest.stream) {
                    // For streaming, we should use WebSocket
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Use WebSocket for streaming' }));
                    return;
                }
                const response = await this.copilotService.chat(chatRequest);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(response));
            }
            catch (error) {
                this.logger.error(`Chat request error: ${error}`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Chat request failed' }));
            }
        });
    }
    handleWebSocketConnection(ws) {
        this.logger.debug('WebSocket connection established');
        ws.on('message', async (data) => {
            try {
                const request = JSON.parse(data.toString());
                if (request.type === 'chat') {
                    await this.handleWebSocketChat(ws, request.data);
                }
                else {
                    ws.send(JSON.stringify({
                        type: 'error',
                        error: 'Unknown request type'
                    }));
                }
            }
            catch (error) {
                this.logger.error(`WebSocket message error: ${error}`);
                ws.send(JSON.stringify({
                    type: 'error',
                    error: 'Invalid request format'
                }));
            }
        });
        ws.on('close', () => {
            this.logger.debug('WebSocket connection closed');
        });
        ws.on('error', (error) => {
            this.logger.error(`WebSocket error: ${error}`);
        });
    }
    async handleWebSocketChat(ws, chatRequest) {
        try {
            // Use streaming chat
            const stream = this.copilotService.chatStream(chatRequest);
            for await (const chunk of stream) {
                ws.send(JSON.stringify({
                    type: 'chat_chunk',
                    data: chunk
                }));
            }
            ws.send(JSON.stringify({
                type: 'chat_done'
            }));
        }
        catch (error) {
            this.logger.error(`Streaming chat error: ${error}`);
            ws.send(JSON.stringify({
                type: 'error',
                error: 'Streaming chat failed'
            }));
        }
    }
}
exports.BridgeServer = BridgeServer;
//# sourceMappingURL=bridgeServer.js.map