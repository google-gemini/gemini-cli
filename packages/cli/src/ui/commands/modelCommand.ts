/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { CommandKind, MessageActionReturn, SlashCommand } from './types.js';

// Available Gemini models with their capabilities
interface ModelInfo {
  name: string;
  supportsThinking: boolean;
  description?: string;
}

const AVAILABLE_MODELS: readonly ModelInfo[] = [
  {
    name: 'gemini-2.5-pro',
    supportsThinking: true,
    description: 'Most capable model with thinking support',
  },
  {
    name: 'gemini-2.5-flash',
    supportsThinking: true,
    description: 'Fast model with thinking support',
  },
  {
    name: 'gemini-2.5-flash-lite',
    supportsThinking: false,
    description: 'Lightweight model (limited thinking support)',
  },
] as const;

// Helper to get just the model names for validation and completion
const MODEL_NAMES = AVAILABLE_MODELS.map(model => model.name);

const listCommand: SlashCommand = {
  name: 'list',
  description: 'List available Gemini models',
  kind: CommandKind.BUILT_IN,
  action: (context): MessageActionReturn => {
    const currentModel = context.services.config?.getModel() || 'unknown';
    
    let message = 'Available Gemini models:\n\n';
    
    for (const model of AVAILABLE_MODELS) {
      const isCurrentModel = model.name === currentModel;
      const marker = isCurrentModel ? '\u001b[32m● \u001b[0m' : '  ';
      const modelDisplay = isCurrentModel 
        ? `\u001b[32m${model.name} (current)\u001b[0m`
        : `\u001b[36m${model.name}\u001b[0m`;
      
      const thinkingIndicator = model.supportsThinking 
        ? '\u001b[90m [thinking]\u001b[0m' 
        : '';
      
      const description = model.description 
        ? `\u001b[90m - ${model.description}\u001b[0m`
        : '';
      
      message += `${marker}${modelDisplay}${thinkingIndicator}${description}\n`;
    }
    
    message += '\n\u001b[90mUse /model <model-name> to switch models\u001b[0m';
    message += '\n\u001b[90m[thinking] = Supports thinking capability\u001b[0m';
    
    return {
      type: 'message',
      messageType: 'info',
      content: message,
    };
  },
};

const setCommand: SlashCommand = {
  name: 'set',
  description: 'Set the active model. Usage: /model set <model-name>',
  kind: CommandKind.BUILT_IN,
  action: (context, args): MessageActionReturn => {
    const model = args.trim();
    
    if (!model) {
      return {
        type: 'message',
        messageType: 'error',
        content: 'Usage: /model set <model-name>\n\nUse /model list to see available models',
      };
    }

    // Check if the model is in our known list
    if (!MODEL_NAMES.includes(model)) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Unknown model: ${model}\n\nUse /model list to see available models`,
      };
    }

    context.services.config?.setModel(model);
    
    return {
      type: 'message',
      messageType: 'info',
      content: `Model changed to \u001b[36m${model}\u001b[0m`,
    };
  },
  completion: async (_context, partialArg) => MODEL_NAMES.filter(model => 
      model.toLowerCase().startsWith(partialArg.toLowerCase())
    ),
};

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'Manage the active Gemini model',
  kind: CommandKind.BUILT_IN,
  action: (context, args): MessageActionReturn => {
    const trimmedArgs = args.trim();
    
    // If no arguments or "list", show available models
    if (!trimmedArgs || trimmedArgs === 'list') {
      const currentModel = context.services.config?.getModel() || 'unknown';
      
      let message = 'Available Gemini models:\n\n';
      
      for (const model of AVAILABLE_MODELS) {
        const isCurrentModel = model.name === currentModel;
        const marker = isCurrentModel ? '\u001b[32m● \u001b[0m' : '  ';
        const modelDisplay = isCurrentModel 
          ? `\u001b[32m${model.name} (current)\u001b[0m`
          : `\u001b[36m${model.name}\u001b[0m`;
        
        const thinkingIndicator = model.supportsThinking 
          ? '\u001b[90m [thinking]\u001b[0m' 
          : '';
        
        const description = model.description 
          ? `\u001b[90m - ${model.description}\u001b[0m`
          : '';
        
        message += `${marker}${modelDisplay}${thinkingIndicator}${description}\n`;
      }
      
      message += '\n\u001b[90mUse /model <model-name> to switch models\u001b[0m';
      message += '\n\u001b[90m[thinking] = Supports thinking capability\u001b[0m';
      
      return {
        type: 'message',
        messageType: 'info',
        content: message,
      };
    }
    
    // If a model name is provided directly, treat it as "set <model>"
    const model = trimmedArgs;
    
    // Check if the model is in our known list
    if (!MODEL_NAMES.includes(model)) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Unknown model: ${model}\n\nUse /model list to see available models`,
      };
    }

    context.services.config?.setModel(model);
    
    return {
      type: 'message',
      messageType: 'info',
      content: `Model changed to \u001b[36m${model}\u001b[0m`,
    };
  },
  completion: async (context, partialArg) => 
    // Provide model name completion for direct usage
     MODEL_NAMES.filter(model => 
      model.toLowerCase().startsWith(partialArg.toLowerCase())
    )
  ,
  subCommands: [listCommand, setCommand],
};