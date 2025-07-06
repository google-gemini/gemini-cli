#!/usr/bin/env node

/**
 * Simple test CLI for TrustOS
 */

import { 
  TrustOSConfig,
  TrustContentGenerator,
  AuthType,
  createContentGenerator
} from './packages/core/dist/index.js';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`
🛡️  TrustCLI - Local-first AI Assistant

Usage:
  node trust-test.js models           List available models
  node trust-test.js config           Show configuration  
  node trust-test.js recommend <task> Get model recommendation
  node trust-test.js chat <message>   Test chat (placeholder)

Examples:
  node trust-test.js models
  node trust-test.js recommend coding
  node trust-test.js config
    `);
    return;
  }

  try {
    const config = new TrustOSConfig();
    await config.initialize();

    switch (command) {
      case 'models':
        await showModels(config);
        break;
      case 'config':
        await showConfig(config);
        break;
      case 'recommend':
        await recommendModel(config, args[1] || 'default');
        break;
      case 'chat':
        await testChat(config, args.slice(1).join(' '));
        break;
      default:
        console.log(`❌ Unknown command: ${command}`);
        process.exit(1);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

async function showModels(config) {
  const { TrustOSModelManager } = await import('./packages/core/dist/index.js');
  const modelManager = new TrustOSModelManager(config.getModelsDirectory());
  await modelManager.initialize();
  
  const models = modelManager.listAvailableModels();
  const currentModel = modelManager.getCurrentModel();
  
  console.log('\n📦 Available Models:');
  console.log('─'.repeat(60));
  
  models.forEach(model => {
    const current = currentModel?.name === model.name ? ' (current)' : '';
    console.log(`${model.name}${current}`);
    console.log(`  Size: ${model.parameters} | RAM: ${model.ramRequirement} | Trust: ${model.trustScore}/10`);
    console.log(`  ${model.description}`);
    console.log();
  });
}

async function showConfig(config) {
  const settings = config.get();
  console.log('\n⚙️  TrustOS Configuration:');
  console.log('─'.repeat(40));
  console.log(`Default Model: ${settings.models.default}`);
  console.log(`Models Directory: ${settings.models.directory}`);
  console.log(`Privacy Mode: ${settings.privacy.privacyMode}`);
  console.log(`Model Verification: ${settings.privacy.modelVerification ? 'enabled' : 'disabled'}`);
  console.log(`Audit Logging: ${settings.privacy.auditLogging ? 'enabled' : 'disabled'}`);
  console.log();
  
  console.log('Inference Settings:');
  console.log(`  Temperature: ${settings.inference.temperature}`);
  console.log(`  Max Tokens: ${settings.inference.maxTokens}`);
  console.log(`  Streaming: ${settings.inference.stream ? 'enabled' : 'disabled'}`);
  console.log();
}

async function recommendModel(config, task) {
  const { TrustOSModelManager } = await import('./packages/core/dist/index.js');
  const modelManager = new TrustOSModelManager(config.getModelsDirectory());
  await modelManager.initialize();
  
  const recommended = modelManager.getRecommendedModel(task, 16); // Assume 16GB available
  
  console.log(`\n🎯 Recommended model for "${task}":`);
  if (recommended) {
    console.log(`${recommended.name} - ${recommended.description}`);
    console.log(`RAM requirement: ${recommended.ramRequirement}`);
    console.log(`Trust score: ${recommended.trustScore}/10`);
  } else {
    console.log('No suitable model found for your requirements.');
  }
  console.log();
}

async function testChat(config, message) {
  if (!message) {
    console.log('❌ Please provide a message to chat with.');
    return;
  }

  console.log(`\n💬 Testing chat with TrustOS (placeholder mode):`);
  console.log(`User: ${message}`);
  console.log(`Assistant: I'm a placeholder response! The actual model isn't loaded yet, but the TrustOS system is ready. To enable real chat, download a model file and update the system to load it.`);
  console.log();
  console.log('📝 To enable real chat:');
  console.log('   1. Download a model file (e.g., from Hugging Face)');
  console.log('   2. Place it in the models directory');
  console.log('   3. The system will automatically detect and use it');
  console.log();
}

main().catch(console.error);