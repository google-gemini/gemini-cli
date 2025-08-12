import { Mastra, Agent } from '@mastra/core';
import { PinoLogger } from '@mastra/loggers';
import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { fileAnalyzerTool, webSearchTool, codeAnalysisTool } from '../tools/index.js';
import { defaultConfig } from '../config.js';
import * as dotenv from 'dotenv';

dotenv.config();

// Create agents using the Agent class
const accelosGoogleAgent = new Agent({
  name: 'accelos-google',
  instructions: defaultConfig.systemPrompt,
  model: google('gemini-2.0-flash-exp'),
  tools: {
    fileAnalyzer: fileAnalyzerTool,
    webSearch: webSearchTool,
    codeAnalysis: codeAnalysisTool,
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
  },
});

const accelosAnthropicAgent = new Agent({
  name: 'accelos-anthropic',
  instructions: defaultConfig.systemPrompt,
  model: anthropic('claude-3-5-sonnet-20241022'),
  tools: {
    fileAnalyzer: fileAnalyzerTool,
    webSearch: webSearchTool,
    codeAnalysis: codeAnalysisTool,
  },
});

export const mastra = new Mastra({
  agents: {
    'accelos-google': accelosGoogleAgent,
    'accelos-openai': accelosOpenAIAgent,
    'accelos-anthropic': accelosAnthropicAgent,
  },
  logger: new PinoLogger({
    name: 'Mastra',
    level: 'info',
  }),
  server: {
    port: 4111,
    host: '0.0.0.0',
    build: {
      openAPIDocs: true,
      swaggerUI: true,
    },
  },
});