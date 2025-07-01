# Context Optimization Monitoring Guide

## How to Know if Context Optimization is Working

The context optimization system includes comprehensive logging and monitoring to help you verify it's working correctly. Here's how to check its performance and effectiveness.

---

## 🔍 **Quick Verification**

### **1. Basic Console Output**

When context optimization is enabled, you'll see console output like this:

```bash
🎯 Context optimization started: 150 chunks (75000 tokens) -> budget: 50000 tokens
📊 Scoring complete: 150 chunks in 45ms
   BM25: 0.642, Recency: 0.758, Embedding: 0.701, Hybrid: 0.685
✂️  Pruning complete: 150 -> 85 chunks (43.3% reduction)
   Tokens: 75000 -> 42500 (43.3% reduction)
   Mandatory chunks preserved: 8
🎉 Context optimization complete:
   Query: "How do I implement authentication?"
   Chunks: 150 -> 85 (43.3% reduction)
   Tokens: 75000 -> 42500 (43.3% reduction)
   Processing time: 52ms
   Top chunks: auth-1(0.95), user-2(0.89), login-3(0.84)
```

### **2. Environment Variables**

Enable context optimization with:

```bash
export GEMINI_CONTEXT_OPTIMIZATION=true
export GEMINI_CONTEXT_MAX_CHUNKS=200
export GEMINI_EMBEDDING_ENABLED=false  # Set true when embeddings available
```

---

## 📊 **Programmatic Monitoring**

### **Usage Example with Logging**

```typescript
import { ContextManager } from '@google/gemini-cli-core';

// Initialize with debug logging to see detailed output
const contextManager = new ContextManager(
  {
    enabled: true,
    maxChunks: 200,
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
); // Enable debug-level logging

// Add conversation chunks
await contextManager.addChunk({
  id: 'user-1',
  role: 'user',
  content: 'How do I implement authentication?',
  tokens: 8,
  timestamp: Date.now(),
  metadata: {},
});

// Optimize context
const optimizedContext = await contextManager.optimizeContext(
  { text: 'authentication implementation help' },
  50000, // token budget
);

// Check performance metrics
const performanceData = contextManager.getPerformanceSummary();
console.log('Performance Summary:', performanceData);
/*
Output:
{
  totalOptimizations: 1,
  averageProcessingTime: 52,
  averageTokenReduction: 43.3,
  averageChunkReduction: 43.3,
  errorRate: 0
}
*/

// Get recent optimization details
const recentOptimizations = contextManager.getRecentOptimizations(5);
console.log('Recent optimizations:', recentOptimizations);

// Get last optimization stats
const lastStats = contextManager.getOptimizationStats();
console.log('Last optimization:', lastStats);
```

---

## 📈 **Key Metrics to Monitor**

### **1. Performance Metrics**

| Metric              | Good Value | Warning     | Critical   |
| ------------------- | ---------- | ----------- | ---------- |
| **Processing Time** | <100ms     | 100-500ms   | >500ms     |
| **Token Reduction** | 30-60%     | 10-30%      | <10%       |
| **Error Rate**      | 0%         | 1-5%        | >5%        |
| **Throughput**      | >5 req/sec | 2-5 req/sec | <2 req/sec |

### **2. Quality Metrics**

```typescript
// Check optimization effectiveness
const stats = contextManager.getOptimizationStats();
if (stats) {
  console.log(`Token reduction: ${stats.reductionPercentage.toFixed(1)}%`);
  console.log(`Chunks: ${stats.originalChunks} -> ${stats.prunedChunks}`);
  console.log(`Processing time: ${stats.processingTimeMs}ms`);
}

// Verify top-scored chunks are relevant
const recent = contextManager.getRecentOptimizations(1)[0];
if (recent) {
  console.log('Top scored chunks:');
  recent.topScoredChunks.forEach((chunk) => {
    console.log(
      `  ${chunk.id}: score=${chunk.score.toFixed(3)}, tokens=${chunk.tokens}`,
    );
  });
}
```

### **3. Scoring Breakdown**

```typescript
// Check that all scoring algorithms are working
const recent = contextManager.getRecentOptimizations(1)[0];
if (recent) {
  const { bm25Average, recencyAverage, embeddingAverage, hybridAverage } =
    recent.scoringBreakdown;

  console.log('Scoring breakdown:');
  console.log(`  BM25 (lexical): ${bm25Average.toFixed(3)}`);
  console.log(`  Recency: ${recencyAverage.toFixed(3)}`);
  console.log(`  Embedding: ${embeddingAverage.toFixed(3)}`);
  console.log(`  Hybrid final: ${hybridAverage.toFixed(3)}`);

  // All should be > 0 if working correctly
  if (bm25Average === 0) console.warn('⚠️ BM25 scoring may not be working');
  if (recencyAverage === 0)
    console.warn('⚠️ Recency scoring may not be working');
  if (embeddingAverage === 0 && recent.query.includes('embedding')) {
    console.warn('⚠️ Embedding scoring expected but not working');
  }
}
```

---

## 🚨 **Troubleshooting Common Issues**

### **Problem: No Token Reduction**

**Symptoms:**

- `reductionPercentage: 0`
- Same number of chunks before/after optimization

**Checks:**

```typescript
// 1. Verify optimization is enabled
const config = contextManager.getConfig();
console.log('Optimization enabled:', config.enabled);

// 2. Check token budget vs total tokens
const stats = contextManager.getOptimizationStats();
console.log(`Budget: ${stats?.originalTokens}, Used: ${stats?.prunedTokens}`);

// 3. Check for mandatory chunks
const recent = contextManager.getRecentOptimizations(1)[0];
console.log(
  `Mandatory chunks: ${recent?.mandatoryChunks} of ${recent?.originalChunks}`,
);
```

**Solutions:**

- Ensure `GEMINI_CONTEXT_OPTIMIZATION=true`
- Increase token budget if all chunks are mandatory
- Check that chunks have token counts > 0

### **Problem: High Processing Time**

**Symptoms:**

- `processingTimeMs > 500ms`
- Slow response times

**Checks:**

```typescript
// Check chunk count and complexity
const performance = contextManager.getPerformanceSummary();
console.log(`Avg processing time: ${performance.averageProcessingTime}ms`);

// Check for large conversations
const recent = contextManager.getRecentOptimizations(1)[0];
console.log(`Chunk count: ${recent?.originalChunks}`);
```

**Solutions:**

- Reduce `maxChunks` configuration
- Enable `aggressivePruning` for faster processing
- Consider chunking very large conversations

### **Problem: Low Relevance Scores**

**Symptoms:**

- All scores near 0
- Poor chunk selection

**Checks:**

```typescript
// Check scoring breakdown
const recent = contextManager.getRecentOptimizations(1)[0];
console.log('Scoring averages:', recent?.scoringBreakdown);

// Check query and content similarity
console.log(`Query: "${recent?.query}"`);
recent?.topScoredChunks.forEach((chunk) => {
  console.log(`Top chunk ${chunk.id}: ${chunk.score.toFixed(3)}`);
});
```

**Solutions:**

- Verify query text is meaningful
- Check that chunk content is relevant to queries
- Adjust scoring weights in configuration

---

## 🔧 **Production Monitoring Setup**

### **1. Log Level Configuration**

```typescript
// Production: info level (shows optimization results)
const contextManager = new ContextManager(config, 'info');

// Development: debug level (shows detailed breakdown)
const contextManager = new ContextManager(config, 'debug');

// Error tracking: error level only
const contextManager = new ContextManager(config, 'error');
```

### **2. Metrics Collection**

```typescript
// Collect metrics periodically
setInterval(() => {
  const performance = contextManager.getPerformanceSummary();

  // Send to monitoring system
  sendMetrics({
    'context_optimization.total_optimizations': performance.totalOptimizations,
    'context_optimization.avg_processing_time':
      performance.averageProcessingTime,
    'context_optimization.avg_token_reduction':
      performance.averageTokenReduction,
    'context_optimization.error_rate': performance.errorRate,
  });
}, 60000); // Every minute
```

### **3. Alert Thresholds**

```typescript
// Set up alerting
const performance = contextManager.getPerformanceSummary();

if (performance.errorRate > 5) {
  alert('High context optimization error rate');
}

if (performance.averageProcessingTime > 1000) {
  alert('Context optimization taking too long');
}

if (performance.averageTokenReduction < 10) {
  alert('Context optimization not effective');
}
```

---

## 📋 **Validation Checklist**

### **✅ Basic Functionality**

- [ ] Console shows optimization start/complete messages
- [ ] Token count reduces when over budget
- [ ] Processing time < 100ms for typical conversations
- [ ] No error messages in logs

### **✅ Scoring Quality**

- [ ] BM25 scores > 0 for relevant content
- [ ] Recency scores favor recent messages
- [ ] Top-scored chunks are actually relevant
- [ ] Mandatory chunks (pinned, system) preserved

### **✅ Performance**

- [ ] Handles 100+ chunks efficiently
- [ ] Memory usage remains stable
- [ ] No memory leaks in long-running processes
- [ ] Scales linearly with conversation size

### **✅ Error Handling**

- [ ] Graceful fallback when scoring fails
- [ ] Continues working with malformed chunks
- [ ] Handles edge cases (empty conversations, zero budgets)
- [ ] Logs meaningful error messages

---

## 🎯 **Success Indicators**

**🟢 Working Well:**

- 30-60% token reduction under budget pressure
- <100ms processing time for typical conversations
- Relevant chunks consistently scored higher
- Error rate < 1%

**🟡 Needs Tuning:**

- 10-30% token reduction (adjust scoring weights)
- 100-500ms processing time (reduce chunk count)
- Mixed relevance in top chunks (improve query matching)

**🔴 Requires Investigation:**

- <10% token reduction (check configuration)
- > 500ms processing time (performance issue)
- Frequent errors (system problem)
- No console output (feature not enabled)

This comprehensive monitoring setup ensures you can verify the context optimization is working correctly and troubleshoot any issues that arise.
