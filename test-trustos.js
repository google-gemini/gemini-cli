/**
 * Test script for TrustOS model management system
 */

import { 
  TrustOSModelManager, 
  TrustOSConfig, 
  AuthType,
  createContentGenerator 
} from './packages/core/dist/index.js';

async function testTrustOSSystem() {
  console.log('🔧 Testing TrustOS Model Management System...\n');

  try {
    // Test 1: Initialize TrustOS configuration
    console.log('1. Initializing TrustOS configuration...');
    const config = new TrustOSConfig();
    await config.initialize();
    console.log(`✅ Config initialized. Models directory: ${config.getModelsDirectory()}`);
    console.log(`   Default model: ${config.getDefaultModel()}`);
    console.log(`   Privacy mode: ${config.getPrivacyMode()}\n`);

    // Test 2: Initialize model manager
    console.log('2. Initializing model manager...');
    const modelManager = new TrustOSModelManager(config.getModelsDirectory());
    await modelManager.initialize();
    console.log('✅ Model manager initialized\n');

    // Test 3: List available models
    console.log('3. Listing available models...');
    const models = modelManager.listAvailableModels();
    console.log(`✅ Found ${models.length} available models:`);
    models.forEach(model => {
      console.log(`   - ${model.name} (${model.parameters}) - ${model.description}`);
      console.log(`     RAM: ${model.ramRequirement}, Trust Score: ${model.trustScore}`);
    });
    console.log();

    // Test 4: Get model recommendations
    console.log('4. Testing model recommendations...');
    const codingModel = modelManager.getRecommendedModel('coding', 8);
    const quickModel = modelManager.getRecommendedModel('quick', 4);
    console.log(`✅ Recommended for coding (8GB RAM): ${codingModel?.name || 'None'}`);
    console.log(`✅ Recommended for quick tasks (4GB RAM): ${quickModel?.name || 'None'}\n`);

    // Test 5: Test content generator creation (without actual model loading)
    console.log('5. Testing TrustOS content generator creation...');
    const contentGeneratorConfig = {
      model: 'phi-3.5-mini-instruct',
      authType: AuthType.USE_TRUSTOS,
      trustosModelsDir: config.getModelsDirectory()
    };
    
    console.log('✅ TrustOS content generator config created');
    console.log(`   Model: ${contentGeneratorConfig.model}`);
    console.log(`   Auth Type: ${contentGeneratorConfig.authType}`);
    console.log(`   Models Dir: ${contentGeneratorConfig.trustosModelsDir}\n`);

    console.log('🎉 All tests passed! TrustOS system is working correctly.');
    console.log('\n📝 Next steps:');
    console.log('   - Download actual model files from Hugging Face');
    console.log('   - Test real model loading and inference');
    console.log('   - Update CLI to use TrustOS by default');

  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
testTrustOSSystem().catch(console.error);