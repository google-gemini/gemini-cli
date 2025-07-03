"use strict";
// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeServer = void 0;
const http = require("http");
const url = require("url");
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
            // Close HTTP server
            this.server?.close(() => {
                this.running = false;
                this.logger.info('Bridge server stopped');
                resolve();
            });
        });
    }
    isRunning() {
        return this.running;
    }
    async handleHttpRequest(req, res) {
        // Log ALL incoming requests to see if bridge is being called
        this.logger.info(`🌉 BRIDGE REQUEST: ${req.method} ${req.url} from ${req.headers['user-agent'] || 'unknown'}`);
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        const parsedUrl = url.parse(req.url, true);
        const pathname = parsedUrl.pathname;
        this.logger.debug(`HTTP ${req.method} ${pathname}`);
        try {
            switch (pathname) {
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
        this.logger.info('Chat request received');
        if (req.method !== 'POST') {
            this.logger.warn(`Invalid method for /chat: ${req.method}`);
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
                this.logger.debug(`Chat request body: ${body}`);
                const chatRequest = JSON.parse(body);
                this.logger.info(`Chat request for model: ${chatRequest.model}, messages: ${chatRequest.messages.length}`);
                if (chatRequest.stream) {
                    // Handle streaming response with HTTP
                    res.writeHead(200, {
                        'Content-Type': 'text/event-stream',
                        'Cache-Control': 'no-cache',
                        'Connection': 'keep-alive'
                    });
                    const stream = this.copilotService.chatStream(chatRequest);
                    for await (const chunk of stream) {
                        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
                    }
                    res.end();
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
}
exports.BridgeServer = BridgeServer;
//# sourceMappingURL=bridgeServer.js.map