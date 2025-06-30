# Context Optimization Implementation Plan

## Overview

This plan implements smart context pruning and relevance scoring for the Gemini CLI to efficiently manage large conversation histories while preserving important information within token limits.

## Current State Analysis

- **Token Management**: The system supports 1M+ token contexts with different limits per model (tokenLimits.ts)
- **Prompt Construction**: Central prompt building in prompts.ts combines system instructions, conversation history, and tool outputs
- **Memory System**: Persistent conversation state via memoryTool.ts
- **Content Generation**: Handles streaming responses and token counting via contentGenerator.ts

## Architecture Design

### Core Components

#### 1. Context Manager (`packages/core/src/context/`)
- **ContextManager**: Central orchestrator for context optimization
- **ChunkRegistry**: In-memory store with persistent backing for conversation chunks
- **RelevanceScorer**: Multi-algorithm scoring system
- **ContextPruner**: Smart pruning with coherence preservation

#### 2. Scoring Algorithms (`packages/core/src/context/scoring/`)
- **BM25Scorer**: Fast lexical relevance using TF-IDF
- **EmbeddingScorer**: Semantic similarity via embeddings
- **RecencyScorer**: Time-based decay scoring
- **HybridScorer**: Weighted combination of all scorers

#### 3. Data Structures (`packages/core/src/context/types/`)
- **ConversationChunk**: Atomic unit (user+assistant exchange or tool output)
- **ChunkMetadata**: Scoring data, embeddings, token counts
- **ContextWindow**: Current active context with token tracking

### Implementation Strategy

#### Phase 1: Foundation (Week 1)
1. **Basic chunking system** with token counting
2. **BM25 lexical scoring** using `wink-bm25` library
3. **Greedy pruning** by score-per-token ratio
4. **Integration** with existing prompt construction

#### Phase 2: Enhanced Scoring (Week 2)
1. **Embedding integration** with Vertex AI text embeddings
2. **HNSW index** for fast similarity search
3. **Recency weighting** with exponential decay
4. **Hybrid scoring** with configurable weights

#### Phase 3: Advanced Features (Week 3)
1. **Hierarchical summaries** for old conversation segments
2. **Coherence preservation** with thread ancestry tracking
3. **Memory slots** for persistent facts
4. **Background processing** for expensive operations

## Technical Specifications

### Chunk Structure
```typescript
interface ConversationChunk {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  tokens: number;
  timestamp: number;
  metadata: ChunkMetadata;
}

interface ChunkMetadata {
  embedding?: number[];
  bm25Score?: number;
  recencyScore?: number;
  finalScore?: number;
  pinned?: boolean;
  summaryOf?: string;
  tags?: string[];
}
```

### Scoring Function
```
final_score = α × embedding_similarity + β × bm25_score + γ × recency_score + δ × manual_boost

Default weights: α=0.4, β=0.4, γ=0.15, δ=0.05
```

### Pruning Algorithm
1. **Mandatory inclusion**: System prompt, pinned memories, tool definitions
2. **Candidate scoring**: All chunks scored by relevance to current query  
3. **Greedy selection**: Sort by score/token ratio, select until budget reached
4. **Coherence checks**: Preserve conversation flow and role alternation

## Integration Points

### Modified Files
- `packages/core/src/core/prompts.ts`: Add context optimization calls
- `packages/core/src/core/tokenLimits.ts`: Add pruning configuration
- `packages/core/src/tools/memoryTool.ts`: Integrate with chunk registry
- `packages/cli/src/ui/components/ContextSummaryDisplay.tsx`: Show optimization stats

### New Dependencies
- `wink-bm25`: Lexical scoring
- `hnswlib-node`: Fast similarity search  
- `@google-cloud/aiplatform`: Embedding generation
- `tiktoken` or `gpt-3-tokenizer`: Accurate token counting

## Configuration

### Environment Variables
```bash
GEMINI_CONTEXT_OPTIMIZATION=true
GEMINI_CONTEXT_MAX_CHUNKS=200
GEMINI_EMBEDDING_ENABLED=false
GEMINI_PRUNING_AGGRESSIVE=false
```

### Scoring Weights (tokenLimits.ts)
```typescript
export const CONTEXT_SCORING_WEIGHTS = {
  embedding: 0.4,
  bm25: 0.4, 
  recency: 0.15,
  manual: 0.05
};
```

## Performance Targets

- **Prompt building**: < 50ms for 1000 chunks
- **Memory usage**: < 100MB for embeddings cache
- **Token reduction**: 30-50% with <5% relevance loss
- **Latency impact**: < 10ms added per request

## Testing Strategy

### Unit Tests
- Individual scorer accuracy
- Pruning algorithm correctness  
- Token counting precision
- Chunk serialization/deserialization

### Integration Tests  
- End-to-end conversation flows
- Memory persistence across sessions
- Performance benchmarks
- Edge cases (empty history, oversized chunks)

### Validation Metrics
- **Relevance preservation**: Manual evaluation of pruned contexts
- **Performance impact**: Latency measurements  
- **Memory efficiency**: Heap usage tracking
- **Token budget compliance**: Never exceed model limits

## Risk Mitigation

### Fallback Strategies
- **Embedding failures**: Fall back to BM25-only scoring
- **Performance issues**: Disable optimization, use simple truncation
- **Memory pressure**: Aggressive LRU eviction of embeddings

### Monitoring
- **Context optimization metrics** via telemetry
- **Token usage tracking** before/after optimization  
- **Error rate monitoring** for embedding/scoring failures

## Migration Plan

### Phase 1: Feature Flag
- Deploy behind `GEMINI_CONTEXT_OPTIMIZATION` flag
- A/B test with subset of users
- Monitor performance and accuracy metrics

### Phase 2: Gradual Rollout
- Enable for power users first
- Collect feedback and iterate
- Performance tuning based on real usage

### Phase 3: Default Enable
- Make optimization default for all users
- Maintain backward compatibility
- Add UI controls for customization

## Success Metrics

- **30-50% reduction** in token usage for large conversations
- **< 10ms latency** added to prompt construction
- **95% user satisfaction** with context relevance
- **Zero regression** in core CLI functionality

## Dependencies

### Technical Dependencies
- Node.js embedding libraries
- Fast similarity search (HNSW)  
- Tokenization libraries
- Performance monitoring tools

### Team Dependencies
- Backend: Core context management system
- Frontend: UI components for optimization display
- DevOps: Feature flag infrastructure  
- QA: Comprehensive testing across conversation types

## Timeline

- **Week 1**: Foundation implementation and basic testing
- **Week 2**: Enhanced scoring and performance optimization  
- **Week 3**: Advanced features and comprehensive testing
- **Week 4**: Integration, documentation, and rollout preparation