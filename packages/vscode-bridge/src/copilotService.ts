// Original work Copyright 2025 Google LLC
// Modified work Copyright 2025 Binny Arora
// Licensed under Apache 2.0

import * as vscode from 'vscode';
import { Logger } from './logger';
import { ChatRequest, ChatResponse } from './bridgeServer';

export interface Model {
    id: string;
    name: string;
    vendor: string;
    family: string;
    version?: string;
    maxRequestsPerMinute?: number;
}

export class CopilotService {
    private models: vscode.LanguageModelChat[] = [];

    constructor(private logger: Logger) {}

    async initialize(): Promise<void> {
        try {
            // Get available Copilot models
            this.models = await vscode.lm.selectChatModels({
                vendor: 'copilot',
                family: 'gpt'
            });

            if (this.models.length === 0) {
                throw new Error('No Copilot models available. Please ensure GitHub Copilot is installed and authenticated.');
            }

            this.logger.info(`Initialized with ${this.models.length} Copilot model(s)`);
            this.models.forEach(model => {
                this.logger.debug(`Available model: ${model.id} (${model.vendor}/${model.family})`);
            });
        } catch (error) {
            this.logger.error(`Failed to initialize Copilot service: ${error}`);
            throw error;
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            // Try to get models to check if Copilot is available
            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot'
            });
            return models.length > 0;
        } catch (error) {
            this.logger.warn(`Health check failed: ${error}`);
            return false;
        }
    }

    async listModels(): Promise<Model[]> {
        return this.models.map(model => ({
            id: model.id,
            name: model.name,
            vendor: model.vendor,
            family: model.family,
            version: model.version,
            maxRequestsPerMinute: model.maxInputTokens ? undefined : model.maxInputTokens
        }));
    }

    async chat(request: ChatRequest): Promise<ChatResponse> {
        if (this.models.length === 0) {
            throw new Error('No Copilot models available');
        }

        // Use the first available model or the requested one
        let selectedModel = this.models[0];
        if (request.model) {
            const requestedModel = this.models.find(m => m.id === request.model || m.name === request.model);
            if (requestedModel) {
                selectedModel = requestedModel;
            }
        }

        try {
            // Convert messages to VSCode format
            const messages = request.messages.map(msg => {
                if (msg.role === 'user') {
                    return vscode.LanguageModelChatMessage.User(msg.content);
                } else if (msg.role === 'assistant') {
                    return vscode.LanguageModelChatMessage.Assistant(msg.content);
                } else {
                    return vscode.LanguageModelChatMessage.User(msg.content); // Fallback for system messages
                }
            });

            // Make the request
            const response = await selectedModel.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

            // Collect the response
            let content = '';
            for await (const fragment of response.text) {
                content += fragment;
            }

            return {
                choices: [{
                    message: {
                        content: content
                    }
                }],
                model: selectedModel.id
            };
        } catch (error) {
            this.logger.error(`Chat request failed: ${error}`);
            throw error;
        }
    }

    async* chatStream(request: ChatRequest): AsyncGenerator<ChatResponse> {
        if (this.models.length === 0) {
            throw new Error('No Copilot models available');
        }

        // Use the first available model or the requested one
        let selectedModel = this.models[0];
        if (request.model) {
            const requestedModel = this.models.find(m => m.id === request.model || m.name === request.model);
            if (requestedModel) {
                selectedModel = requestedModel;
            }
        }

        try {
            // Convert messages to VSCode format
            const messages = request.messages.map(msg => {
                if (msg.role === 'user') {
                    return vscode.LanguageModelChatMessage.User(msg.content);
                } else if (msg.role === 'assistant') {
                    return vscode.LanguageModelChatMessage.Assistant(msg.content);
                } else {
                    return vscode.LanguageModelChatMessage.User(msg.content); // Fallback for system messages
                }
            });

            // Make the streaming request
            const response = await selectedModel.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);

            // Stream the response
            for await (const fragment of response.text) {
                yield {
                    choices: [{
                        delta: {
                            content: fragment
                        }
                    }],
                    model: selectedModel.id
                };
            }
        } catch (error) {
            this.logger.error(`Streaming chat request failed: ${error}`);
            throw error;
        }
    }
}