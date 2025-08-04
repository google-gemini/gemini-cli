/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { SlashCommand, CommandKind, CommandContext, MessageActionReturn } from './types.js';
import { AuthType, discoverDatabricksEndpoints } from '@dbx-cli/core';

// Available models by provider
const GEMINI_MODELS = [
  'gemini-2.5-pro',
  'gemini-1.5-pro',
  'gemini-1.5-pro-latest',
  'gemini-1.5-flash',
  'gemini-1.5-flash-latest',
];

const DATABRICKS_MODELS_FALLBACK = [
  'databricks-claude-sonnet-4',
  'databricks-claude-opus-4',
  'databricks-llama-4-maverick',
  'databricks-meta-llama-3-3-70b-instruct',
  'databricks-meta-llama-3-1-8b-instruct',
] as const;

// Cache for Databricks endpoints
let cachedEndpoints: string[] | null = null;
let cacheExpiry = 0;

type Handler = (context: CommandContext, args: string) => Promise<MessageActionReturn>;

// Helper to get Databricks endpoints with caching
async function getDatabricksEndpoints(forceRefresh = false): Promise<{ endpoints: string[], isError: boolean }> {
  const now = Date.now();
  
  if (!forceRefresh && cachedEndpoints && now < cacheExpiry) {
    return { endpoints: cachedEndpoints, isError: false };
  }
  
  try {
    const endpoints = await discoverDatabricksEndpoints({ forceRefresh });
    cachedEndpoints = endpoints;
    cacheExpiry = now + 5 * 60 * 1000; // Cache for 5 minutes
    return { endpoints, isError: false };
  } catch {
    // Return cached data if available, otherwise fallback
    return { 
      endpoints: cachedEndpoints || DATABRICKS_MODELS_FALLBACK.slice(),
      isError: true 
    };
  }
}

// Helper to format provider name
function getProviderName(authType: AuthType): string {
  switch (authType) {
    case AuthType.USE_DATABRICKS:
      return 'Databricks';
    case AuthType.USE_GEMINI:
      return 'Gemini';
    case AuthType.USE_VERTEX_AI:
      return 'Vertex AI';
    case AuthType.LOGIN_WITH_GOOGLE:
      return 'Google OAuth';
    default:
      return 'Unknown';
  }
}

const handleShow: Handler = async (context) => {
  const currentModel = context.services.config?.getModel() || 'Not set';
  const authType = context.services.settings.merged.selectedAuthType || AuthType.USE_GEMINI;
  const provider = getProviderName(authType);
  
  return {
    type: 'message',
    messageType: 'info',
    content: `Current model: ${currentModel}\nProvider: ${provider}`,
  };
};

const handleList: Handler = async (context) => {
  const authType = context.services.settings.merged.selectedAuthType || AuthType.USE_GEMINI;
  
  if (authType === AuthType.USE_DATABRICKS) {
    const { endpoints, isError } = await getDatabricksEndpoints();
    
    if (endpoints.length === 0) {
      return {
        type: 'message',
        messageType: 'info',
        content: 'No serving endpoints found in workspace',
      };
    }
    
    const models = endpoints.join('\n  - ');
    
    if (isError) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Failed to fetch endpoints from workspace. Showing cached models:\n  - ${models}`,
      };
    }
    
    return {
      type: 'message',
      messageType: 'info',
      content: `Available Databricks models (fetched from workspace):\n  - ${models}`,
    };
  } else if (authType === AuthType.USE_GEMINI) {
    const models = GEMINI_MODELS.join('\n  - ');
    return {
      type: 'message',
      messageType: 'info',
      content: `Available Gemini models:\n  - ${models}`,
    };
  }
  
  return {
    type: 'message',
    messageType: 'info',
    content: 'No models available for current provider',
  };
};

const handleSet: Handler = async (context, args) => {
  const modelName = args.trim();
  
  if (!modelName) {
    return {
      type: 'message',
      messageType: 'error',
      content: 'Usage: /model set <model-name>',
    };
  }
  
  const authType = context.services.settings.merged.selectedAuthType || AuthType.USE_GEMINI;
  
  // Validate model for provider
  if (authType === AuthType.USE_DATABRICKS) {
    const { endpoints, isError } = await getDatabricksEndpoints();
    const isValidFormat = modelName.startsWith('databricks-');
    const isInList = endpoints.includes(modelName);
    
    if (!isValidFormat) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Invalid model for Databricks provider: ${modelName}\nUse /model list to see available models`,
      };
    }
    
    if (!isInList && !isError) {
      // Only warn if we successfully fetched from workspace
      context.services.config?.setModel(modelName);
      return {
        type: 'message',
        messageType: 'info',
        content: `Model updated to: ${modelName}\nNote: This endpoint was not found in your workspace`,
      };
    }
  } else if (authType === AuthType.USE_GEMINI) {
    if (!GEMINI_MODELS.includes(modelName)) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Invalid model for Gemini provider: ${modelName}\nUse /model list to see available models`,
      };
    }
  }
  
  context.services.config?.setModel(modelName);
  
  return {
    type: 'message',
    messageType: 'info',
    content: `Model updated to: ${modelName}`,
  };
};

const showHelp = (): MessageActionReturn => ({
    type: 'message',
    messageType: 'info',
    content: `Available subcommands:
  - /model show - Display current model and provider
  - /model list - List available models for current provider
  - /model set <model-name> - Set the model to use`,
  });

const subcommandHandlers: Record<string, Handler> = {
  show: handleShow,
  list: handleList,
  set: handleSet,
};

export const modelCommand: SlashCommand = {
  name: 'model',
  description: 'Manage AI model selection',
  kind: CommandKind.BUILT_IN,
  action: async (context, args) => {
    const parts = args.split(/\s+/);
    const subcommand = parts[0] || '';
    const remainingArgs = parts.slice(1).join(' ');
    
    const handler = subcommandHandlers[subcommand];
    
    if (!subcommand) {
      return showHelp();
    }
    
    if (!handler) {
      return {
        type: 'message',
        messageType: 'error',
        content: `Unknown subcommand: ${subcommand}\n\n${showHelp().content}`,
      };
    }
    
    return handler(context, remainingArgs);
  },
};