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
            // According to Cline's approach and VSCode docs, models might need user consent
            // Let's check what's available first
            this.logger.info('Checking VSCode Language Model API...');
            
            if (!vscode.lm) {
                throw new Error('VSCode Language Model API is not available');
            }

            // Check registered model providers
            this.logger.debug(`Available LM properties: ${Object.getOwnPropertyNames(vscode.lm).join(', ')}`);
            
            // Try to get models - this might trigger a consent dialog
            this.logger.info('Attempting to select chat models (this may require user consent)...');
            
            let models: vscode.LanguageModelChat[] = [];
            
            // First attempt: Try without any filter to see if ANY models are available
            try {
                models = await vscode.lm.selectChatModels();
                this.logger.info(`Initial check: Found ${models.length} total models`);
                
                if (models.length > 0) {
                    models.forEach((model) => {
                        this.logger.info(`Model found: id=${model.id}, vendor=${model.vendor}, family=${model.family}, name=${model.name}, maxInputTokens=${model.maxInputTokens}`);
                    });
                }
            } catch (e) {
                this.logger.error(`Error selecting models: ${e}`);
            }
            
            // If no models, it might be because:
            // 1. User hasn't consented yet
            // 2. GitHub Copilot extension isn't installed
            // 3. Models need to be accessed differently
            
            if (models.length === 0) {
                // Check if we can see any registered providers
                if ((vscode.lm as any).registerChatModelProvider) {
                    this.logger.info('Model provider registration is available - models might need to be registered first');
                }
                
                // Try the onDidChangeChatModels event to see if models become available
                if (vscode.lm.onDidChangeChatModels) {
                    this.logger.info('Setting up model change listener...');
                    vscode.lm.onDidChangeChatModels(() => {
                        this.logger.info('Chat models changed event fired!');
                        this.reinitialize();
                    });
                }
                
                throw new Error(
                    'No language models available. This could be because:\n' +
                    '1. GitHub Copilot extension is not installed or authenticated\n' +
                    '2. User consent is required (try using a command from GitHub Copilot first)\n' + 
                    '3. The extension needs to be activated in a user-initiated context\n\n' +
                    'Try: Open Command Palette → "GitHub Copilot: Explain This" on some code first.'
                );
            }

            this.models = models;
            this.logger.info(`Successfully initialized with ${this.models.length} model(s)`);
        } catch (error) {
            this.logger.error(`Failed to initialize Copilot service: ${error}`);
            throw error;
        }
    }
    
    private async reinitialize() {
        try {
            const models = await vscode.lm.selectChatModels();
            if (models.length > 0) {
                this.models = models;
                this.logger.info(`Reinitialized with ${models.length} models after change event`);
            }
        } catch (e) {
            this.logger.error(`Reinitialize failed: ${e}`);
        }
    }

    async healthCheck(): Promise<boolean> {
        try {
            // Check if Language Model API is available
            if (!vscode.lm && !(vscode as any).languageModels) {
                this.logger.warn('VSCode Language Model API is not available');
                return false;
            }

            // Try to get models to check if Copilot is available
            let models: any[] = [];
            
            if (vscode.lm) {
                models = await vscode.lm.selectChatModels({
                    vendor: 'copilot'
                });
            } else if ((vscode as any).languageModels) {
                const lm = (vscode as any).languageModels;
                if (lm.selectChatModels) {
                    models = await lm.selectChatModels({
                        vendor: 'copilot'
                    });
                }
            }
            
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