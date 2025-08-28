import { Mastra, Agent } from '@mastra/core';
import { registerApiRoute } from '@mastra/core/server';
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
  prCreationWorkflowTool,
} from '../tools/index.js';
import {
  codeReviewWorkflow,
  simpleCodeReviewWorkflow,
  reviewToPRStreamingWorkflow,
} from '../workflows/index.js';
import { defaultConfig, getCompatiblePaths } from '../config.js';
import { GuardrailStore } from '../tools/shared-guardrail-store.js';
import { Neo4jStore } from '../tools/shared-neo4j-store.js';
import * as dotenv from 'dotenv';
import { githubTools, githubWorkflowTools } from '../mcp/github-mcp-client.js';
import { productionReadinessPrompt } from '../prompts/production_readiness_prompt.js';
import { guardrailAgentPrompt } from '../prompts/guardrail_agent_prompt.js';
import { githubWorkflowDebuggerPrompt } from '../prompts/github_workflow_debugger_prompt.js';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';
import { createStreamingSSEHandler } from '../api/streaming-sse.js';
import { promises as fs, existsSync, readFileSync } from 'fs';
import {
  createGuardrailsListHandler,
  createGuardrailByIdHandler,
} from '../api/guardrails.js';
import {
  createReviewsListHandler,
  createReviewByIdHandler,
} from '../api/reviews.js';
import * as path from 'path';
import { fileURLToPath } from 'url';

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config();

// Initialize directory structure for Mastra
async function initializeDirectoryStructure() {
  try {
    console.log(`🔧 DEBUG: Mastra initializeDirectoryStructure() started`);
    const dataDir =
      process.env.ACCELOS_DATA_DIRECTORY_PATH || './.accelos/data';
    const reviewsDir = path.join(dataDir, 'reviews');
    const guardrailsFile = path.join(dataDir, 'guardrails.json');

    // Create main data directory if it doesn't exist
    if (!existsSync(dataDir)) {
      await fs.mkdir(dataDir, { recursive: true });
      console.log(`📁 Created data directory: ${dataDir}`);
    } else {
      console.log(`📁 Data directory already exists: ${dataDir}`);
    }

    // Create reviews subdirectory if it doesn't exist
    if (!existsSync(reviewsDir)) {
      await fs.mkdir(reviewsDir, { recursive: true });
      console.log(`📁 Created reviews directory: ${reviewsDir}`);
    } else {
      console.log(`📁 Reviews directory already exists: ${reviewsDir}`);
    }

    // Create empty guardrails.json if it doesn't exist
    if (!existsSync(guardrailsFile)) {
      await fs.writeFile(guardrailsFile, JSON.stringify([], null, 2), 'utf-8');
      console.log(`📄 Created empty guardrails file: ${guardrailsFile}`);
    } else {
      console.log(`📄 Guardrails file already exists: ${guardrailsFile}`);
    }

    console.log(`✅ Directory structure initialization completed`);
  } catch (error) {
    console.warn(
      `⚠️  Failed to initialize directory structure: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
    console.warn(
      '   Mastra will continue, but some features may not work properly.',
    );
  }
}

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

// Initialize directory structure first, then guardrails and EKG database
(async () => {
  try {
    // Initialize directory structure first (blocking)
    await initializeDirectoryStructure();

    // Then initialize guardrails and EKG (non-blocking)
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
  } catch (error) {
    console.warn(
      `⚠️  Failed to initialize directory structure: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
})();

const memory = new Memory({
  storage: new LibSQLStore({
    url: 'file:../../memory.db',
  }),
});

// Create API routes using registerApiRoute pattern
const streamingSSERoute = registerApiRoute('/accelos/streaming-sse', {
  method: 'GET',
  handler: await createStreamingSSEHandler(),
});

const guardrailsListRoute = registerApiRoute('/accelos/guardrails', {
  method: 'GET',
  handler: await createGuardrailsListHandler(),
});

const guardrailByIdRoute = registerApiRoute('/accelos/guardrails/:id', {
  method: 'GET',
  handler: await createGuardrailByIdHandler(),
});

const reviewsListRoute = registerApiRoute('/accelos/reviews-list', {
  method: 'GET',
  handler: await createReviewsListHandler(),
});

const reviewByIdRoute = registerApiRoute('/accelos/reviews/:id', {
  method: 'GET',
  handler: await createReviewByIdHandler(),
});

// Streaming test HTML route
const streamingTestRoute = registerApiRoute('/accelos/streaming-test.html', {
  method: 'GET',
  handler: async (c) => {
    try {
      const possiblePaths = [
        path.join(process.cwd(), 'src', 'streaming-test.html'),
        path.join(__dirname, '..', 'streaming-test.html'),
        path.join(__dirname, '..', '..', 'src', 'streaming-test.html'),
        path.resolve('src/streaming-test.html'),
      ];

      let htmlContent = null;

      for (const htmlPath of possiblePaths) {
        try {
          if (existsSync(htmlPath)) {
            htmlContent = readFileSync(htmlPath, 'utf8');
            break;
          }
        } catch (_err) {
          continue;
        }
      }

      if (!htmlContent) {
        return c.text(
          `Streaming test page not found. Tried paths:\n${possiblePaths.join('\n')}\nCurrent working directory: ${process.cwd()}`,
          404,
        );
      }

      c.header('Content-Type', 'text/html');
      c.header('Cache-Control', 'no-cache');
      return c.body(htmlContent);
    } catch (error) {
      return c.text(
        `Error loading streaming test page: ${error instanceof Error ? error.message : String(error)}`,
        500,
      );
    }
  },
});

// Custom API route for reviews
const reviewsApiRoute = registerApiRoute('/accelos/reviews', {
  method: 'ALL', // Handle both GET and OPTIONS
  handler: async (c) => {
    // Get the request origin
    const origin = c.req.header('origin');

    // Allow any localhost origin (flexible for development)
    if (origin && origin.match(/^http:\/\/localhost:\d+$/)) {
      c.header('Access-Control-Allow-Origin', origin);
    }

    // Set comprehensive CORS headers
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.header(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, Cache-Control, x-mastra-client-type',
    );
    c.header(
      'Access-Control-Expose-Headers',
      'Content-Length, X-Requested-With',
    );
    c.header('Access-Control-Max-Age', '3600');

    // Handle preflight OPTIONS request
    if (c.req.method === 'OPTIONS') {
      return new Response('', { status: 204 });
    }

    // Handle GET request
    if (c.req.method === 'GET') {
      try {
        const dataDir =
          process.env.ACCELOS_DATA_DIRECTORY_PATH || './.accelos/data';
        const reviewsDir = path.join(dataDir, 'reviews');

        // Read all files in the reviews directory
        const files = await fs.readdir(reviewsDir);

        // Filter files that start with "REVIEW" and end with ".json"
        const reviewFiles = files.filter(
          (file) => file.startsWith('REVIEW') && file.endsWith('.json'),
        );

        // Read and parse each review file
        const reviews = [];
        for (const file of reviewFiles) {
          try {
            const filePath = path.join(reviewsDir, file);
            const content = await fs.readFile(filePath, 'utf-8');
            const review = JSON.parse(content);
            reviews.push(review);
          } catch (error) {
            console.warn(`Failed to parse review file ${file}:`, error);
          }
        }

        return c.json({
          success: true,
          data: reviews,
          count: reviews.length,
        });
      } catch (error) {
        console.error('Error fetching reviews:', error);
        return c.json(
          {
            success: false,
            error: 'Failed to fetch reviews',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          500,
        );
      }
    }

    // Method not allowed
    return c.text('Method Not Allowed', 405);
  },
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

// Filter GitHub MCP tools to only include readonly operations for production readiness reviews
const readonlyGithubTools = Object.fromEntries(
  Object.entries(githubTools).filter(([key]) => {
    // Keep tools that start with readonly patterns
    const readonlyPatterns = [
      'get_', 'list_', 'search_', 'read_', 'fetch_', 'show_', 'describe_'
    ];
    // Remove tools that start with write operation patterns
    const writePatterns = [
      'create_', 'update_', 'merge_', 'delete_', 'fork_', 'close_', 'reopen_'
    ];
    
    const hasReadonlyPattern = readonlyPatterns.some(pattern => key.includes(pattern));
    const hasWritePattern = writePatterns.some(pattern => key.includes(pattern));
    
    // Include if it matches readonly patterns and doesn't match write patterns
    return hasReadonlyPattern && !hasWritePattern;
  })
);

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
      ekgCrud: ekgCrudTool,
      reviewLoader: reviewLoaderTool,
      prCreation: prCreationWorkflowTool,
      ...readonlyGithubTools, // Only readonly GitHub operations
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

// Create GitHub Workflow Debugger Agent for Mastra
const githubWorkflowDebuggerAgent = new Agent({
  name: 'github-workflow-debugger',
  instructions: githubWorkflowDebuggerPrompt,
  model: anthropic('claude-3-5-sonnet-20241022'),
  defaultGenerateOptions: {
    maxSteps: 100,
  },
  tools: {
    claudeCode: claudeCodeTool,
    ekg: ekgCrudTool,
    ...githubWorkflowTools,
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
    'github-workflow-debugger': githubWorkflowDebuggerAgent,
  },
  workflows: {
    'code-review-workflow': codeReviewWorkflow,
    'simple-code-review-workflow': simpleCodeReviewWorkflow,
    'review-to-pr-streaming-workflow': reviewToPRStreamingWorkflow,
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
    cors: {
      origin: [
        'http://localhost:3000', // Dev server
        'http://localhost:5173', // Vite preview
        'http://localhost:5273', // CLI interface
        /^http:\/\/localhost:\d+$/, // Allow any localhost port
      ],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: [
        'Content-Type',
        'Authorization',
        'Cache-Control',
        'x-mastra-client-type',
      ],
      exposeHeaders: ['Content-Length', 'X-Requested-With'],
      maxAge: 3600,
      credentials: false,
    },
    apiRoutes: [
      reviewsApiRoute,
      streamingSSERoute,
      guardrailsListRoute,
      guardrailByIdRoute,
      reviewsListRoute,
      reviewByIdRoute,
      streamingTestRoute,
    ],
  },
});
