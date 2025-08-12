#!/usr/bin/env node

import { AccelosAgent } from './agent.js';
import { defaultConfig, type AccelosConfig } from './config.js';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const config: AccelosConfig = {
    ...defaultConfig,
    apiKey: process.env.GOOGLE_API_KEY,
    systemPrompt: 'You are Accelos, a helpful AI assistant specialized in code analysis, file processing, and web research. Always provide detailed and actionable insights.',
  };

  const agent = new AccelosAgent(config);

  console.log('🚀 Accelos Agent initialized with Mastra framework');
  console.log('Configuration:', agent.getConfig());

  try {
    console.log('\n🔍 Testing basic chat functionality...');
    const chatResponse = await agent.chat('Hello! Can you explain what you can help me with?');
    console.log('Chat Response:', chatResponse);

    console.log('\n📄 Testing file analysis...');
    const fileAnalysis = await agent.analyzeFile('./package.json', 'all');
    console.log('File Analysis:', fileAnalysis);

    console.log('\n🌐 Testing web search...');
    const searchResults = await agent.searchWeb('Mastra AI framework TypeScript', 3);
    console.log('Search Results:', searchResults);

    console.log('\n💻 Testing code analysis...');
    const sampleCode = `
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.log(fibonacci(10));
    `;
    const codeAnalysis = await agent.analyzeCode(sampleCode, 'javascript');
    console.log('Code Analysis:', codeAnalysis);

    console.log('\n✅ All tests completed successfully!');
  } catch (error) {
    console.error('❌ Error during testing:', error);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}