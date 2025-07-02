// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0

import * as http from 'http';
import * as vscode from 'vscode';
import { WebSocketServer, WebSocket } from 'ws';
import { Logger } from './logger';
import { CopilotService } from './copilotService';

export interface ChatRequest {
    messages: Array<{
        role: 'user' | 'assistant' | 'system';
        content: string;
    }>;
    model?: string;
    stream?: boolean;
}

export interface ChatResponse {
    choices: Array<{
        delta?: {
            content?: string;
        };
        message?: {
            content: string;
        };
    }>;
    model: string;
}

export class BridgeServer {
    private server: http.Server | undefined;
    private wss: WebSocketServer | undefined;
    private copilotService: CopilotService;
    private running = false;

    constructor(
        private port: number,
        private logger: Logger
    ) {
        this.copilotService = new CopilotService(logger);
    }

    async start(): Promise<void> {
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
        this.wss = new WebSocketServer({ server: this.server });
        this.wss.on('connection', (ws) => {
            this.handleWebSocketConnection(ws);
        });

        // Start listening
        return new Promise((resolve, reject) => {
            this.server!.listen(this.port, (err?: Error) => {
                if (err) {
                    reject(err);
                } else {
                    this.running = true;
                    this.logger.info(`Bridge server listening on port ${this.port}`);
                    resolve();
                }
            });
        });
    }

    async stop(): Promise<void> {
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

    isRunning(): boolean {
        return this.running;
    }

    private async handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
        // Enable CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const url = new URL(req.url!, `http://localhost:${this.port}`);
        
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
        } catch (error) {
            this.logger.error(`HTTP request error: ${error}`);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Internal server error' }));
        }
    }

    private async handleHealth(req: http.IncomingMessage, res: http.ServerResponse) {
        const health = await this.copilotService.healthCheck();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'ok',
            copilot: health ? 'available' : 'unavailable',
            timestamp: new Date().toISOString()
        }));
    }

    private async handleModels(req: http.IncomingMessage, res: http.ServerResponse) {
        try {
            const models = await this.copilotService.listModels();
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ models }));
        } catch (error) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Failed to list models' }));
        }
    }

    private async handleChat(req: http.IncomingMessage, res: http.ServerResponse) {
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
                const chatRequest: ChatRequest = JSON.parse(body);
                
                if (chatRequest.stream) {
                    // For streaming, we should use WebSocket
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Use WebSocket for streaming' }));
                    return;
                }

                const response = await this.copilotService.chat(chatRequest);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(response));
            } catch (error) {
                this.logger.error(`Chat request error: ${error}`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Chat request failed' }));
            }
        });
    }

    private handleWebSocketConnection(ws: WebSocket) {
        this.logger.debug('WebSocket connection established');

        ws.on('message', async (data) => {
            try {
                const request = JSON.parse(data.toString());
                
                if (request.type === 'chat') {
                    await this.handleWebSocketChat(ws, request.data);
                } else {
                    ws.send(JSON.stringify({ 
                        type: 'error', 
                        error: 'Unknown request type' 
                    }));
                }
            } catch (error) {
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

    private async handleWebSocketChat(ws: WebSocket, chatRequest: ChatRequest) {
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
        } catch (error) {
            this.logger.error(`Streaming chat error: ${error}`);
            ws.send(JSON.stringify({
                type: 'error',
                error: 'Streaming chat failed'
            }));
        }
    }
}