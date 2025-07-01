/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Example demonstrating context optimization logging and monitoring.
 * Run this file to see the logging system in action.
 */

import { ContextManager } from './ContextManager.js';
import type { ConversationChunk } from './types.js';

async function demonstrateContextOptimization() {
  console.log('🚀 Context Optimization Logging Demo\n');

  // Initialize with debug logging to see all details
  const contextManager = new ContextManager(
    {
      enabled: true,
      maxChunks: 100,
      embeddingEnabled: false,
      aggressivePruning: false,
      scoringWeights: {
        embedding: 0.4,
        bm25: 0.4,
        recency: 0.15,
        manual: 0.05,
      },
    },
    'debug',
  );

  // Create sample conversation chunks
  const chunks: ConversationChunk[] = [
    {
      id: 'system-1',
      role: 'assistant',
      content:
        'I am your helpful AI assistant. I can help with coding, debugging, and technical questions.',
      tokens: 20,
      timestamp: Date.now() - 3600000, // 1 hour ago
      metadata: {
        pinned: true,
        tags: ['system-prompt'],
      },
    },
    {
      id: 'user-1',
      role: 'user',
      content: 'How do I implement authentication in a Node.js application?',
      tokens: 15,
      timestamp: Date.now() - 1800000, // 30 minutes ago
      metadata: {},
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      content:
        "To implement authentication in Node.js, you can use several approaches. The most common are JWT tokens, session-based auth, or OAuth. Here's a basic JWT example...",
      tokens: 45,
      timestamp: Date.now() - 1790000,
      metadata: {},
    },
    {
      id: 'user-2',
      role: 'user',
      content: 'Can you show me how to hash passwords securely?',
      tokens: 12,
      timestamp: Date.now() - 900000, // 15 minutes ago
      metadata: {},
    },
    {
      id: 'assistant-2',
      role: 'assistant',
      content:
        "Absolutely! For secure password hashing, use bcrypt. Here's how: const bcrypt = require('bcrypt'); const saltRounds = 10; const hashedPassword = await bcrypt.hash(password, saltRounds);",
      tokens: 35,
      timestamp: Date.now() - 890000,
      metadata: {},
    },
    {
      id: 'user-3',
      role: 'user',
      content: 'What about database connection setup?',
      tokens: 8,
      timestamp: Date.now() - 300000, // 5 minutes ago
      metadata: {},
    },
    {
      id: 'assistant-3',
      role: 'assistant',
      content:
        'For database connections, I recommend using a connection pool. With PostgreSQL, you can use pg-pool, and with MongoDB, use mongoose with connection pooling enabled.',
      tokens: 28,
      timestamp: Date.now() - 290000,
      metadata: {},
    },
    {
      id: 'user-4',
      role: 'user',
      content: 'Now I need help with user session management',
      tokens: 10,
      timestamp: Date.now() - 60000, // 1 minute ago
      metadata: {},
    },
  ];

  // Add chunks to the context manager
  console.log('📥 Adding conversation chunks...');
  for (const chunk of chunks) {
    await contextManager.addChunk(chunk);
  }

  console.log(`\n✅ Added ${chunks.length} chunks to conversation history\n`);

  // Demonstrate optimization with different queries
  const queries = [
    'authentication and password security best practices',
    'database connection and session management',
    'help with user login implementation',
  ];

  for (let i = 0; i < queries.length; i++) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 OPTIMIZATION ${i + 1}: "${queries[i]}"`);
    console.log(`${'='.repeat(60)}\n`);

    const tokenBudget = 100; // Tight budget to force pruning

    const optimizedContext = await contextManager.optimizeContext(
      {
        text: queries[i],
        timestamp: Date.now(),
      },
      tokenBudget,
    );

    // Show results summary
    console.log(`\n📋 OPTIMIZATION RESULTS:`);
    console.log(`   Selected chunks: ${optimizedContext.chunks.length}`);
    console.log(
      `   Token usage: ${optimizedContext.totalTokens}/${optimizedContext.maxTokens}`,
    );
    console.log(
      `   Chunk IDs: ${optimizedContext.chunks.map((c) => c.id).join(', ')}`,
    );

    // Wait a bit between optimizations
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  // Show comprehensive performance summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 PERFORMANCE SUMMARY`);
  console.log(`${'='.repeat(60)}\n`);

  const performanceSummary = contextManager.getPerformanceSummary();
  console.log('Overall Performance:');
  console.log(
    `   Total optimizations: ${performanceSummary.totalOptimizations}`,
  );
  console.log(
    `   Average processing time: ${performanceSummary.averageProcessingTime.toFixed(1)}ms`,
  );
  console.log(
    `   Average token reduction: ${performanceSummary.averageTokenReduction.toFixed(1)}%`,
  );
  console.log(
    `   Average chunk reduction: ${performanceSummary.averageChunkReduction.toFixed(1)}%`,
  );
  console.log(`   Error rate: ${performanceSummary.errorRate.toFixed(1)}%`);

  // Show recent optimization details
  console.log(`\n📈 RECENT OPTIMIZATION DETAILS:`);
  const recentOptimizations = contextManager.getRecentOptimizations(3);

  recentOptimizations.forEach((optimization, index) => {
    console.log(`\n   Optimization ${index + 1}:`);
    console.log(`     Query: "${optimization.query.substring(0, 40)}..."`);
    console.log(
      `     Reduction: ${optimization.originalChunks} -> ${optimization.finalChunks} chunks (${(((optimization.originalChunks - optimization.finalChunks) / optimization.originalChunks) * 100).toFixed(1)}%)`,
    );
    console.log(
      `     Tokens: ${optimization.originalTokens} -> ${optimization.finalTokens} (${optimization.reductionPercentage.toFixed(1)}%)`,
    );
    console.log(`     Processing time: ${optimization.processingTimeMs}ms`);
    console.log(
      `     Top chunks: ${optimization.topScoredChunks.map((c) => `${c.id}(${c.score.toFixed(2)})`).join(', ')}`,
    );
    console.log(
      `     Scoring: BM25=${optimization.scoringBreakdown.bm25Average.toFixed(3)}, Recency=${optimization.scoringBreakdown.recencyAverage.toFixed(3)}`,
    );
  });

  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ Context optimization logging demo complete!');
  console.log(`${'='.repeat(60)}\n`);

  console.log('🎯 Key takeaways:');
  console.log(
    '   - System logs show optimization start, scoring, pruning, and completion',
  );
  console.log('   - Performance metrics track effectiveness over time');
  console.log('   - Detailed breakdown helps debug scoring and selection');
  console.log('   - Mandatory chunks (system prompts) are always preserved');
  console.log(
    '   - Recent conversations score higher due to recency weighting',
  );
  console.log(
    '   - Relevant content scores higher due to BM25 lexical matching',
  );
}

// Run the demonstration
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateContextOptimization().catch(console.error);
}

export { demonstrateContextOptimization };
