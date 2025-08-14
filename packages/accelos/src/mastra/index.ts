import { Mastra, Agent } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import {
  fileAnalyzerTool,
  webSearchTool,
  codeAnalysisTool,
  rcaLoaderTool,
  guardrailLoaderTool,
  guardrailCrudTool,
  reviewStorageTool,
  reviewLoaderTool,
  debugStoreTool,
  claudeCodeTool,
  ekgCrudTool,
} from '../tools/index.js';
import {
  codeReviewWorkflow,
  simpleCodeReviewWorkflow,
} from '../workflows/index.js';
import { defaultConfig, getCompatiblePaths } from '../config.js';
import { GuardrailStore } from '../tools/shared-guardrail-store.js';
import { Neo4jStore } from '../tools/shared-neo4j-store.js';
import * as dotenv from 'dotenv';
import { githubTools } from '../mcp/github-mcp-client.js';
import { productionReadinessPrompt } from '../prompts/production_readiness_prompt.js';
import { guardrailAgentPrompt } from '../prompts/guardrail_agent_prompt.js';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
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
    console.warn(
      `⚠️  Failed to initialize guardrails: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    console.warn('   Mastra will continue without pre-loaded guardrails.');
  }
}

// Initialize EKG (Neo4j) connection at startup for Mastra
async function initializeEkg() {
  try {
    console.log(`🔧 DEBUG: Mastra initializeEkg() started`);
    const ekgStore = Neo4jStore.getInstance();

    // Check if Neo4j environment variables are set
    const ekgUri = process.env.NEO4J_URI;
    const ekgUsername = process.env.NEO4J_USERNAME;
    const ekgPassword = process.env.NEO4J_PASSWORD;
    const ekgDatabase = process.env.NEO4J_DATABASE;

    if (ekgUri && ekgUsername && ekgPassword) {
      console.log(`🗄️  Connecting to EKG database at: ${ekgUri}`);
      await ekgStore.connect({
        uri: ekgUri,
        username: ekgUsername,
        password: ekgPassword,
        database: ekgDatabase || 'neo4j',
      });
      console.log(`✅ EKG database connected and ready`);
    } else {
      console.log(
        `ℹ️  EKG database environment variables not set. Connection will be manual.`,
      );
      console.log(
        `   Set NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD to auto-connect.`,
      );
    }
  } catch (error) {
    console.warn(
      `⚠️  Failed to initialize EKG database: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    console.warn('   EKG tools will require manual connection.');
  }
}

// Initialize guardrails and EKG database (non-blocking)
initializeGuardrails().catch((error) => {
  console.warn(
    `⚠️  Failed to initialize guardrails: ${error instanceof Error ? error.message : 'Unknown error'}`,
  );
});

initializeEkg().catch((error) => {
  console.warn(
    `⚠️  Failed to initialize EKG database: ${error instanceof Error ? error.message : 'Unknown error'}`,
  );
});

const memory = new Memory({
  storage: new LibSQLStore({
    url: 'file:../../memory.db',
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
    claudeCode: claudeCodeTool,
    ekgCrud: ekgCrudTool,
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
    claudeCode: claudeCodeTool,
    ekgCrud: ekgCrudTool,
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
    claudeCode: claudeCodeTool,
    ekgCrud: ekgCrudTool,
  },
});

const productionReadinessAgent = new Agent({
  name: 'production-readiness-agent',
  instructions: productionReadinessPrompt,
  model: anthropic('claude-3-7-sonnet-20250219'),
  defaultGenerateOptions: {
    maxSteps: 1000,
  },
  tools: {
    guardrailCrudTool,
    reviewStorage: reviewStorageTool,
    ekgCrud: ekgCrudTool,
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
    ekgCrud: ekgCrudTool,
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
  workflows: {
    'code-review-workflow': codeReviewWorkflow,
    'simple-code-review-workflow': simpleCodeReviewWorkflow,
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
