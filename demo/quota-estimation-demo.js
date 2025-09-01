#!/usr/bin/env node

/**
 * Demo script for the Quota Estimation feature
 * 
 * This script demonstrates how the quota estimation works
 * without requiring the full Gemini CLI setup.
 */

const { QuotaEstimator } = require('../packages/core/dist/utils/quotaEstimation.js');

// Mock content generator for demo purposes
class MockContentGenerator {
  constructor() {
    this.callCount = 0;
  }

  async countTokens(request) {
    this.callCount++;
    
    // Simulate API response
    if (this.callCount === 1) {
      // First call succeeds
      return { totalTokens: 150 };
    } else {
      // Subsequent calls fail to demonstrate fallback
      throw new Error('API Error - countTokens failed');
    }
  }
}

async function runDemo() {
  console.log('🚀 Gemini CLI Quota Estimation Demo\n');
  
  const mockGenerator = new MockContentGenerator();
  const quotaEstimator = new QuotaEstimator(mockGenerator);
  
  const testQueries = [
    {
      content: [{ text: 'Hello, how are you today?' }],
      model: 'gemini-2.5-flash',
      description: 'Simple greeting query'
    },
    {
      content: [{ text: 'Explain quantum computing in detail, including superposition, entanglement, and quantum gates. Provide examples and applications.' }],
      model: 'gemini-2.5-pro',
      description: 'Complex technical query'
    },
    {
      content: 'This is a fallback test that will trigger the character-based estimation.',
      model: 'gemini-1.5-flash',
      description: 'Fallback estimation test'
    }
  ];
  
  for (const query of testQueries) {
    console.log(`📝 ${query.description}`);
    console.log(`Model: ${query.model}`);
    console.log(`Content: "${query.content[0]?.text || query.content}"\n`);
    
    try {
      const estimate = await quotaEstimator.estimateQuotaUsage(
        query.content,
        { model: query.model }
      );
      
      console.log(quotaEstimator.formatQuotaEstimate(estimate, { showDetailedBreakdown: true }));
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
    }
    
    console.log('\n' + '─'.repeat(60) + '\n');
  }
  
  console.log('✨ Demo completed!');
  console.log('\nTo use this feature in the actual Gemini CLI:');
  console.log('1. Add quota estimation settings to your settings.json');
  console.log('2. Enable the feature with "enabled": true');
  console.log('3. Run your queries and see estimates before execution');
}

// Run the demo if this script is executed directly
if (require.main === module) {
  runDemo().catch(console.error);
}

module.exports = { runDemo };
