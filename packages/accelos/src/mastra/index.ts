import { Mastra, Agent } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { fileAnalyzerTool, webSearchTool, codeAnalysisTool, rcaLoaderTool, guardrailLoaderTool, guardrailCrudTool, reviewStorageTool, reviewLoaderTool, debugStoreTool } from '../tools/index.js';
import { defaultConfig, getCompatiblePaths } from '../config.js';
import { GuardrailStore } from '../tools/shared-guardrail-store.js';
import * as dotenv from 'dotenv';
import { githubTools } from '../mcp/github-mcp-client.js';
import { productionReadinessPrompt } from '../prompts/production_readiness_prompt.js';
import { guardrailAgentPrompt } from '../prompts/guardrail_agent_prompt.js';
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
dotenv.config();

// Initialize guardrails at startup for Mastra
async function initializeGuardrails() {
  try {
    console.log(`🔧 DEBUG: Mastra initializeGuardrails() started`);
    const guardrailStore = GuardrailStore.getInstance();
    const guardrailsFile = getCompatiblePaths(defaultConfig).guardrailsFile;
    
    console.log(`🛡️  Loading guardrails from: ${guardrailsFile}`);
    console.log(`🔧 DEBUG: Calling loadFromFile with autoSave=true`);
    const result = await guardrailStore.loadFromFile(guardrailsFile, true); // Enable auto-save
    
    console.log(`✅ Loaded ${result.loaded} guardrails with auto-save enabled`);
    console.log(`🔧 DEBUG: Mastra startup initialization completed`);
    if (result.errors.length > 0) {
      console.warn(`⚠️  Guardrail loading errors:`, result.errors);
    }
  } catch (error) {
    console.warn(`⚠️  Failed to initialize guardrails: ${error instanceof Error ? error.message : 'Unknown error'}`);
    console.warn('   Mastra will continue without pre-loaded guardrails.');
  }
}

// Initialize guardrails (non-blocking)
initializeGuardrails().catch(error => {
  console.warn(`⚠️  Failed to initialize guardrails: ${error instanceof Error ? error.message : 'Unknown error'}`);
});


const memory = new Memory({
  storage: new LibSQLStore({
    url: "file:../../memory.db",
  }),
});

// Create agents using the Agent class
const accelosGoogleAgent = new Agent({
  name: 'accelos-google',
  instructions: defaultConfig.systemPrompt,
  model: google('gemini-2.0-flash-exp'),
  tools: {
    fileAnalyzer: fileAnalyzerTool,
    webSearch: webSearchTool,
    codeAnalysis: codeAnalysisTool,
    rcaLoader: rcaLoaderTool,
    guardrailLoader: guardrailLoaderTool,
    guardrailCrud: guardrailCrudTool,
    reviewStorage: reviewStorageTool,
    reviewLoader: reviewLoaderTool,
    debugStore: debugStoreTool,
  },
});

const accelosOpenAIAgent = new Agent({
  name: 'accelos-openai', 
  instructions: defaultConfig.systemPrompt,
  model: openai('gpt-4o'),
  tools: {
    fileAnalyzer: fileAnalyzerTool,
    webSearch: webSearchTool,
    codeAnalysis: codeAnalysisTool,
    rcaLoader: rcaLoaderTool,
    guardrailLoader: guardrailLoaderTool,
    guardrailCrud: guardrailCrudTool,
  },
});

const accelosAnthropicAgent = new Agent({
  name: 'accelos-anthropic',
  instructions: defaultConfig.systemPrompt,
  model: anthropic('claude-3-7-sonnet-20250219'),
  tools: {
    fileAnalyzer: fileAnalyzerTool,
    webSearch: webSearchTool,
    codeAnalysis: codeAnalysisTool,
    rcaLoader: rcaLoaderTool,
    guardrailLoader: guardrailLoaderTool,
    guardrailCrud: guardrailCrudTool,
  },
});

const productionReadinessAgent = new Agent({
    name: 'production-readiness-agent',
    instructions: productionReadinessPrompt,
    model: anthropic('claude-3-7-sonnet-20250219'),
    defaultGenerateOptions: {
      maxSteps: 500,
    },
    tools: 
    {
      guardrailCrudTool,
      reviewStorage: reviewStorageTool,
      ...githubTools,
    },
    memory,
  });

const guardrailAgent = new Agent({
  name: 'guardrail-agent',
  instructions: guardrailAgentPrompt,
  model: anthropic('claude-3-7-sonnet-20250219'),
  defaultGenerateOptions: {
    maxSteps: 500,
  },
  tools: {
    rcaLoader: rcaLoaderTool,
    guardrailCrud: guardrailCrudTool,
  },
  memory,
});

export const mastra = new Mastra({
  agents: {
    'accelos-google': accelosGoogleAgent,
    'accelos-openai': accelosOpenAIAgent,
    'accelos-anthropic': accelosAnthropicAgent,
    'guardrail-agent': guardrailAgent,
    'production-readiness-agent': productionReadinessAgent,
  },
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  server: {
    port: 4111,
    host: 'localhost',
    build: {
      openAPIDocs: true,
      swaggerUI: true,
    },
  },
});