#!/usr/bin/env node

/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { OllamaContentGenerator } from './ollamaContentGenerator.js';
import { Config } from '../config/config.js';
import { ToolRegistry } from '../tools/tool-registry.js';

async function testOllamaIntegration() {
  console.log('🧪 Testing Ollama Integration...\n');

  try {
    // Initialize config
    const config = new Config({
      sessionId: `test_${Date.now()}`,
      targetDir: process.cwd(),
      debugMode: true,
      cwd: process.cwd(),
      model: 'qwen2.5:1.5b',
    });

    // Initialize tool registry
    const toolRegistry = new ToolRegistry(config);

    // Create Ollama content generator
    const generator = new OllamaContentGenerator(config, toolRegistry, {
      model: 'qwen2.5:1.5b',
      enableToolCalling: true,
      maxToolCalls: 3,
    });

    console.log('⚙️  Initializing Ollama content generator...');
    await generator.initialize();
    console.log('✅ Ollama content generator initialized successfully!\n');

    // Test model info
    const modelInfo = await generator.getModelInfo();
    console.log('📊 Model Info:');
    console.log(`  Model: ${modelInfo.model}`);
    console.log(`  Connected: ${modelInfo.connected}`);
    console.log(`  Available Models: ${modelInfo.availableModels.join(', ')}\n`);

    // Test basic content generation
    console.log('💬 Testing basic content generation...');
    const basicResponse = await generator.generateContent({
      model: 'qwen2.5:1.5b',
      contents: [
        {
          role: 'user',
          parts: [{ text: 'Hello! Can you tell me what the current directory is?' }],
        },
      ],
    });
    
    console.log('Response:', basicResponse.text);
    if (basicResponse.functionCalls && basicResponse.functionCalls.length > 0) {
      console.log('Function calls made:');
      for (const call of basicResponse.functionCalls) {
        console.log(`  - ${call.name}(${JSON.stringify(call.args)})`);
      }
    }
    console.log();

    // Test file operations
    console.log('📁 Testing file operations...');
    const fileResponse = await generator.generateContent({
      model: 'qwen2.5:1.5b',
      contents: [
        {
          role: 'user',
          parts: [{ text: 'List the files in the current directory and read the package.json file' }],
        },
      ],
    });
    
    console.log('Response:', fileResponse.text);
    if (fileResponse.functionCalls && fileResponse.functionCalls.length > 0) {
      console.log('Function calls made:');
      for (const call of fileResponse.functionCalls) {
        console.log(`  - ${call.name}(${JSON.stringify(call.args)})`);
      }
    }
    console.log();

    // Test conversation history
    const history = generator.getConversationHistory();
    console.log(`📜 Conversation history has ${history.length} messages`);

    // Test tool registry
    const toolRegistry2 = generator.getToolRegistry();
    const toolNames = toolRegistry2.getToolNames();
    console.log(`🔧 Available tools: ${toolNames.join(', ')}`);

    console.log('\n✅ All tests passed! Ollama integration is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error);
    
    if (error instanceof Error && error.message.includes('Ollama is not running')) {
      console.log('\n💡 To fix this issue:');
      console.log('1. Install Ollama: https://ollama.ai/download');
      console.log('2. Start Ollama: ollama serve');
      console.log('3. Pull a model: ollama pull qwen2.5:7b');
      console.log('4. Run this test again');
    }
    
    process.exit(1);
  }
}

// Run test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testOllamaIntegration().catch(console.error);
}

export { testOllamaIntegration };