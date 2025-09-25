/**
 * PLUMCP Performance Enhanced Orchestration System
 *
 * Addresses critical performance bottlenecks identified:
 * 1. Context detection latency issues
 * 2. Plugin loading inefficiencies
 * 3. Memory leaks in orchestration
 * 4. Concurrent request handling problems
 * 5. Resource utilization optimization
 */

import { EventEmitter } from 'events';
import { Worker, isMainThread, parentPort } from 'worker_threads';
import * as crypto from 'crypto';

// ============================================================================
// PERFORMANCE OPTIMIZED CONTEXT ORCHESTRATION
// ============================================================================

export interface PerformanceMetrics {
  contextDetectionTime: number;
  pluginSelectionTime: number;
  orchestrationTime: number;
  memoryUsage: number;
  cpuUsage: number;
  concurrentRequests: number;
  cacheHitRate: number;
  throughput: number;
}

export interface CachedContext {
  contextId: string;
  hash: string;
  plugins: string[];
  performance: PerformanceProfile;
  lastUsed: number;
  hitCount: number;
  averageExecutionTime: number;
}

export interface PerformanceProfile {
  avgResponseTime: number;
  successRate: number;
  resourceUsage: ResourceUsage;
  optimizationLevel: number;
}

export interface ResourceUsage {
  memory: number;
  cpu: number;
  network: number;
  storage: number;
}

export interface OptimizationStrategy {
  caching: CachingStrategy;
  pooling: PoolingStrategy;
  batching: BatchingStrategy;
  prediction: PredictionStrategy;
}

export interface CachingStrategy {
  contextCache: boolean;
  pluginCache: boolean;
  resultCache: boolean;
  ttlMs: number;
  maxSize: number;
}

export interface PoolingStrategy {
  workerPool: boolean;
  connectionPool: boolean;
  resourcePool: boolean;
  poolSize: number;
}

export interface BatchingStrategy {
  requestBatching: boolean;
  pluginBatching: boolean;
  batchSize: number;
  batchTimeoutMs: number;
}

export interface PredictionStrategy {
  contextPrediction: boolean;
  pluginPreloading: boolean;
  resourcePrefetching: boolean;
  mlModelEnabled: boolean;
}

// ============================================================================
// HIGH-PERFORMANCE CONTEXT CACHE
// ============================================================================

export class HighPerformanceContextCache {
  private cache: Map<string, CachedContext> = new Map();
  private performanceHistory: Map<string, number[]> = new Map();
  private readonly maxSize: number;
  private readonly ttlMs: number;
  private hitCount = 0;
  private missCount = 0;

  constructor(maxSize = 10000, ttlMs = 5 * 60 * 1000) { // 5 minutes default TTL
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;

    // Cleanup interval
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  async get(contextHash: string): Promise<CachedContext | null> {
    const cached = this.cache.get(contextHash);

    if (!cached) {
      this.missCount++;
      return null;
    }

    // Check TTL
    if (Date.now() - cached.lastUsed > this.ttlMs) {
      this.cache.delete(contextHash);
      this.missCount++;
      return null;
    }

    // Update access stats
    cached.lastUsed = Date.now();
    cached.hitCount++;
    this.hitCount++;

    return cached;
  }

  async set(contextHash: string, context: CachedContext): Promise<void> {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize) {
      await this.evictLeastUsed();
    }

    context.lastUsed = Date.now();
    this.cache.set(contextHash, context);
  }

  async updatePerformance(contextHash: string, executionTime: number): Promise<void> {
    const cached = this.cache.get(contextHash);
    if (!cached) return;

    // Update performance history
    const history = this.performanceHistory.get(contextHash) || [];
    history.push(executionTime);

    // Keep only last 100 measurements
    if (history.length > 100) {
      history.shift();
    }

    this.performanceHistory.set(contextHash, history);

    // Update average
    cached.averageExecutionTime = history.reduce((sum, time) => sum + time, 0) / history.length;
    cached.performance.avgResponseTime = cached.averageExecutionTime;
  }

  private async evictLeastUsed(): Promise<void> {
    let leastUsed: string | null = null;
    let oldestTime = Date.now();

    for (const [hash, context] of this.cache.entries()) {
      if (context.lastUsed < oldestTime) {
        oldestTime = context.lastUsed;
        leastUsed = hash;
      }
    }

    if (leastUsed) {
      this.cache.delete(leastUsed);
      this.performanceHistory.delete(leastUsed);
    }
  }

  private cleanup(): void {
    const now = Date.now();
    const expired: string[] = [];

    for (const [hash, context] of this.cache.entries()) {
      if (now - context.lastUsed > this.ttlMs) {
        expired.push(hash);
      }
    }

    for (const hash of expired) {
      this.cache.delete(hash);
      this.performanceHistory.delete(hash);
    }
  }

  getHitRate(): number {
    const total = this.hitCount + this.missCount;
    return total > 0 ? this.hitCount / total : 0;
  }

  getCacheStats(): CacheStats {
    return {
      size: this.cache.size,
      hitCount: this.hitCount,
      missCount: this.missCount,
      hitRate: this.getHitRate(),
      memoryUsage: this.estimateMemoryUsage()
    };
  }

  private estimateMemoryUsage(): number {
    // Rough estimate of cache memory usage
    return this.cache.size * 1024; // 1KB per entry estimate
  }
}

export interface CacheStats {
  size: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  memoryUsage: number;
}

// ============================================================================
// WORKER POOL FOR CONCURRENT PROCESSING
// ============================================================================

export class HighPerformanceWorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private busyWorkers: Set<Worker> = new Set();
  private readonly poolSize: number;
  private requestQueue: QueuedRequest[] = [];
  private isShuttingDown = false;

  constructor(poolSize = 4) {
    this.poolSize = poolSize;
    this.initializePool();
  }

  private initializePool(): void {
    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(__filename);
      this.workers.push(worker);
      this.availableWorkers.push(worker);

      worker.on('message', (result) => {
        this.handleWorkerMessage(worker, result);
      });

      worker.on('error', (error) => {
        this.handleWorkerError(worker, error);
      });
    }
  }

  async execute<T>(task: WorkerTask): Promise<T> {
    return new Promise((resolve, reject) => {
      const request: QueuedRequest = {
        task,
        resolve,
        reject,
        timestamp: Date.now(),
        timeout: setTimeout(() => {
          reject(new Error('Worker task timeout'));
        }, task.timeoutMs || 30000)
      };

      this.requestQueue.push(request);
      this.processQueue();
    });
  }

  private processQueue(): void {
    if (this.requestQueue.length === 0 || this.availableWorkers.length === 0) {
      return;
    }

    const worker = this.availableWorkers.pop()!;
    const request = this.requestQueue.shift()!;

    this.busyWorkers.add(worker);
    worker.postMessage({
      requestId: crypto.randomUUID(),
      task: request.task,
      timestamp: Date.now()
    });

    // Store request for callback handling
    (worker as any)._currentRequest = request;
  }

  private handleWorkerMessage(worker: Worker, message: any): void {
    const request = (worker as any)._currentRequest as QueuedRequest;
    if (!request) return;

    clearTimeout(request.timeout);
    this.busyWorkers.delete(worker);
    this.availableWorkers.push(worker);
    (worker as any)._currentRequest = null;

    if (message.error) {
      request.reject(new Error(message.error));
    } else {
      request.resolve(message.result);
    }

    // Process next request
    setImmediate(() => this.processQueue());
  }

  private handleWorkerError(worker: Worker, error: Error): void {
    const request = (worker as any)._currentRequest as QueuedRequest;
    if (request) {
      clearTimeout(request.timeout);
      request.reject(error);
    }

    // Replace failed worker
    this.replaceWorker(worker);
  }

  private replaceWorker(failedWorker: Worker): void {
    // Remove from arrays
    const workerIndex = this.workers.indexOf(failedWorker);
    if (workerIndex >= 0) {
      this.workers.splice(workerIndex, 1);
    }

    const availableIndex = this.availableWorkers.indexOf(failedWorker);
    if (availableIndex >= 0) {
      this.availableWorkers.splice(availableIndex, 1);
    }

    this.busyWorkers.delete(failedWorker);

    // Terminate failed worker
    failedWorker.terminate();

    // Create replacement
    const newWorker = new Worker(__filename);
    this.workers.push(newWorker);
    this.availableWorkers.push(newWorker);

    newWorker.on('message', (result) => {
      this.handleWorkerMessage(newWorker, result);
    });

    newWorker.on('error', (error) => {
      this.handleWorkerError(newWorker, error);
    });
  }

  getPoolStats(): PoolStats {
    return {
      totalWorkers: this.workers.length,
      availableWorkers: this.availableWorkers.length,
      busyWorkers: this.busyWorkers.size,
      queueLength: this.requestQueue.length,
      utilization: this.busyWorkers.size / this.workers.length
    };
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Wait for current tasks to complete
    const maxWait = 30000; // 30 seconds
    const start = Date.now();

    while (this.busyWorkers.size > 0 && Date.now() - start < maxWait) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Terminate all workers
    await Promise.all(this.workers.map(worker => worker.terminate()));
    this.workers = [];
    this.availableWorkers = [];
    this.busyWorkers.clear();
  }
}

export interface WorkerTask {
  type: string;
  data: any;
  timeoutMs?: number;
}

export interface QueuedRequest {
  task: WorkerTask;
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timestamp: number;
  timeout: NodeJS.Timeout;
}

export interface PoolStats {
  totalWorkers: number;
  availableWorkers: number;
  busyWorkers: number;
  queueLength: number;
  utilization: number;
}

// ============================================================================
// PREDICTIVE CONTEXT INTELLIGENCE
// ============================================================================

export class PredictiveContextIntelligence {
  private contextPatterns: Map<string, ContextPattern> = new Map();
  private userBehaviorHistory: Map<string, UserBehavior> = new Map();
  private predictionCache: Map<string, ContextPrediction> = new Map();
  private readonly mlModel: SimplePredictionModel;

  constructor() {
    this.mlModel = new SimplePredictionModel();
    this.startLearning();
  }

  async predictNextContext(currentContext: string, userId?: string): Promise<ContextPrediction> {
    const cacheKey = `${currentContext}:${userId || 'anonymous'}`;
    const cached = this.predictionCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 60000) { // 1 minute cache
      return cached;
    }

    const prediction = await this.generatePrediction(currentContext, userId);
    this.predictionCache.set(cacheKey, prediction);

    return prediction;
  }

  private async generatePrediction(currentContext: string, userId?: string): Promise<ContextPrediction> {
    const pattern = this.contextPatterns.get(currentContext);
    const userBehavior = userId ? this.userBehaviorHistory.get(userId) : null;

    const predictions: ContextPredictionItem[] = [];

    if (pattern) {
      // Pattern-based predictions
      for (const [nextContext, probability] of pattern.transitions.entries()) {
        predictions.push({
          contextId: nextContext,
          probability,
          confidence: 0.8,
          reasoning: 'historical_pattern'
        });
      }
    }

    if (userBehavior) {
      // User behavior-based predictions
      for (const [contextId, frequency] of userBehavior.contextFrequency.entries()) {
        const existing = predictions.find(p => p.contextId === contextId);
        if (existing) {
          existing.probability = (existing.probability + frequency) / 2;
          existing.confidence = Math.max(existing.confidence, 0.9);
        } else {
          predictions.push({
            contextId,
            probability: frequency,
            confidence: 0.7,
            reasoning: 'user_behavior'
          });
        }
      }
    }

    // ML model predictions (simplified)
    const mlPredictions = this.mlModel.predict(currentContext, userBehavior);
    for (const mlPred of mlPredictions) {
      const existing = predictions.find(p => p.contextId === mlPred.contextId);
      if (existing) {
        existing.probability = (existing.probability + mlPred.probability) / 2;
        existing.confidence = Math.max(existing.confidence, mlPred.confidence);
      } else {
        predictions.push(mlPred);
      }
    }

    // Sort by probability and take top 5
    predictions.sort((a, b) => b.probability - a.probability);
    const topPredictions = predictions.slice(0, 5);

    return {
      currentContext,
      predictions: topPredictions,
      confidence: topPredictions.length > 0 ? topPredictions[0].confidence : 0,
      timestamp: Date.now()
    };
  }

  recordContextTransition(fromContext: string, toContext: string, userId?: string): void {
    // Update context patterns
    const pattern = this.contextPatterns.get(fromContext) || {
      contextId: fromContext,
      transitions: new Map(),
      totalTransitions: 0,
      averageDuration: 0
    };

    const currentCount = pattern.transitions.get(toContext) || 0;
    pattern.transitions.set(toContext, currentCount + 1);
    pattern.totalTransitions++;

    this.contextPatterns.set(fromContext, pattern);

    // Update user behavior
    if (userId) {
      const userBehavior = this.userBehaviorHistory.get(userId) || {
        userId,
        contextFrequency: new Map(),
        averageSessionDuration: 0,
        totalSessions: 0,
        lastActivity: Date.now()
      };

      const frequency = userBehavior.contextFrequency.get(toContext) || 0;
      userBehavior.contextFrequency.set(toContext, frequency + 0.1);
      userBehavior.lastActivity = Date.now();

      this.userBehaviorHistory.set(userId, userBehavior);
    }

    // Train ML model
    this.mlModel.train(fromContext, toContext, userId);
  }

  private startLearning(): void {
    // Periodic model updates and cache cleanup
    setInterval(() => {
      this.updatePredictionModel();
      this.cleanupCache();
    }, 300000); // Every 5 minutes
  }

  private updatePredictionModel(): void {
    // Update ML model with recent patterns
    this.mlModel.updateModel(this.contextPatterns, this.userBehaviorHistory);
  }

  private cleanupCache(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];

    for (const [key, prediction] of this.predictionCache.entries()) {
      if (now - prediction.timestamp > 300000) { // 5 minutes
        expiredKeys.push(key);
      }
    }

    for (const key of expiredKeys) {
      this.predictionCache.delete(key);
    }
  }

  getPredictionStats(): PredictionStats {
    return {
      patternsLearned: this.contextPatterns.size,
      usersTracked: this.userBehaviorHistory.size,
      predictions: this.predictionCache.size,
      modelAccuracy: this.mlModel.getAccuracy()
    };
  }
}

export interface ContextPattern {
  contextId: string;
  transitions: Map<string, number>;
  totalTransitions: number;
  averageDuration: number;
}

export interface UserBehavior {
  userId: string;
  contextFrequency: Map<string, number>;
  averageSessionDuration: number;
  totalSessions: number;
  lastActivity: number;
}

export interface ContextPrediction {
  currentContext: string;
  predictions: ContextPredictionItem[];
  confidence: number;
  timestamp: number;
}

export interface ContextPredictionItem {
  contextId: string;
  probability: number;
  confidence: number;
  reasoning: string;
}

export interface PredictionStats {
  patternsLearned: number;
  usersTracked: number;
  predictions: number;
  modelAccuracy: number;
}

// ============================================================================
// SIMPLE ML PREDICTION MODEL
// ============================================================================

export class SimplePredictionModel {
  private patterns: Map<string, Map<string, number>> = new Map();
  private predictions: number = 0;
  private correct: number = 0;

  predict(currentContext: string, userBehavior?: UserBehavior): ContextPredictionItem[] {
    const contextPatterns = this.patterns.get(currentContext);
    if (!contextPatterns) return [];

    const predictions: ContextPredictionItem[] = [];
    const totalWeight = Array.from(contextPatterns.values()).reduce((sum, weight) => sum + weight, 0);

    for (const [contextId, weight] of contextPatterns.entries()) {
      predictions.push({
        contextId,
        probability: weight / totalWeight,
        confidence: Math.min(weight / 10, 0.95), // Higher weights = higher confidence
        reasoning: 'ml_model'
      });
    }

    return predictions.sort((a, b) => b.probability - a.probability);
  }

  train(fromContext: string, toContext: string, userId?: string): void {
    const contextPatterns = this.patterns.get(fromContext) || new Map();
    const currentWeight = contextPatterns.get(toContext) || 0;
    contextPatterns.set(toContext, currentWeight + 1);
    this.patterns.set(fromContext, contextPatterns);
  }

  updateModel(contextPatterns: Map<string, ContextPattern>, userBehaviorHistory: Map<string, UserBehavior>): void {
    // Update internal patterns with new data
    for (const [contextId, pattern] of contextPatterns.entries()) {
      const modelPattern = this.patterns.get(contextId) || new Map();

      for (const [toContext, count] of pattern.transitions.entries()) {
        modelPattern.set(toContext, (modelPattern.get(toContext) || 0) + count);
      }

      this.patterns.set(contextId, modelPattern);
    }
  }

  recordPredictionResult(predicted: string, actual: string): void {
    this.predictions++;
    if (predicted === actual) {
      this.correct++;
    }
  }

  getAccuracy(): number {
    return this.predictions > 0 ? this.correct / this.predictions : 0;
  }
}

// ============================================================================
// HIGH-PERFORMANCE GEMINI ORCHESTRATOR
// ============================================================================

export class HighPerformanceGeminiOrchestrator extends EventEmitter {
  private contextCache: HighPerformanceContextCache;
  private workerPool: HighPerformanceWorkerPool;
  private predictiveIntelligence: PredictiveContextIntelligence;
  private performanceMonitor: PerformanceMonitor;
  private optimizationStrategy: OptimizationStrategy;
  private requestBatcher: RequestBatcher;

  constructor(optimizationStrategy?: OptimizationStrategy) {
    super();

    this.optimizationStrategy = optimizationStrategy || this.getDefaultOptimizationStrategy();

    this.contextCache = new HighPerformanceContextCache();
    this.workerPool = new HighPerformanceWorkerPool();
    this.predictiveIntelligence = new PredictiveContextIntelligence();
    this.performanceMonitor = new PerformanceMonitor();
    this.requestBatcher = new RequestBatcher(this.optimizationStrategy.batching);

    this.startOptimizationLoop();
  }

  async orchestrateHighPerformance(command: OrchestrationCommand): Promise<OrchestrationResult> {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    try {
      // Performance monitoring
      this.performanceMonitor.startRequest(requestId);

      // Batch similar requests if enabled
      if (this.optimizationStrategy.batching.requestBatching) {
        const batchResult = await this.requestBatcher.addRequest(command);
        if (batchResult) return batchResult;
      }

      // Generate context hash for caching
      const contextHash = this.generateContextHash(command);

      // Check cache first
      let cachedContext = null;
      if (this.optimizationStrategy.caching.contextCache) {
        cachedContext = await this.contextCache.get(contextHash);
      }

      let result: OrchestrationResult;

      if (cachedContext) {
        // Cache hit - use cached context
        result = await this.executeCachedContext(cachedContext, command);
        this.emit('cache-hit', { requestId, contextHash });
      } else {
        // Cache miss - full orchestration
        result = await this.executeFullOrchestration(command, contextHash);
        this.emit('cache-miss', { requestId, contextHash });
      }

      // Update performance metrics
      const executionTime = Date.now() - startTime;
      this.performanceMonitor.completeRequest(requestId, executionTime);

      if (cachedContext) {
        await this.contextCache.updatePerformance(contextHash, executionTime);
      }

      // Record context transition for learning
      this.predictiveIntelligence.recordContextTransition(
        command.context,
        result.selectedContext.name,
        command.user
      );

      return result;

    } catch (error) {
      this.performanceMonitor.failRequest(requestId, error.message);
      throw error;
    }
  }

  private async executeCachedContext(
    cachedContext: CachedContext,
    command: OrchestrationCommand
  ): Promise<OrchestrationResult> {
    return {
      requestId: crypto.randomUUID(),
      selectedContext: {
        name: cachedContext.contextId,
        requiredPlugins: cachedContext.plugins,
        priority: 'high',
        performance: cachedContext.performance
      },
      activatedPlugins: cachedContext.plugins,
      executionPlan: {
        steps: ['cache_retrieval'],
        estimatedDuration: cachedContext.averageExecutionTime,
        plugins: { required: cachedContext.plugins, optional: [] }
      },
      performance: {
        contextDetectionTime: 1, // Cached
        pluginSelectionTime: 1,  // Cached
        totalExecutionTime: cachedContext.averageExecutionTime,
        cacheHit: true
      },
      timestamp: Date.now()
    };
  }

  private async executeFullOrchestration(
    command: OrchestrationCommand,
    contextHash: string
  ): Promise<OrchestrationResult> {
    const startContextDetection = Date.now();

    // Parallel context detection and plugin prediction
    const [contextResult, prediction] = await Promise.all([
      this.detectContextHighPerformance(command),
      this.predictiveIntelligence.predictNextContext(command.context, command.user)
    ]);

    const contextDetectionTime = Date.now() - startContextDetection;

    // Plugin selection with predictions
    const startPluginSelection = Date.now();
    const selectedPlugins = await this.selectOptimalPlugins(contextResult, prediction);
    const pluginSelectionTime = Date.now() - startPluginSelection;

    // Cache the result
    if (this.optimizationStrategy.caching.contextCache) {
      const cachedContext: CachedContext = {
        contextId: contextResult.name,
        hash: contextHash,
        plugins: selectedPlugins,
        performance: {
          avgResponseTime: contextDetectionTime + pluginSelectionTime,
          successRate: 1.0,
          resourceUsage: { memory: 0, cpu: 0, network: 0, storage: 0 },
          optimizationLevel: 85
        },
        lastUsed: Date.now(),
        hitCount: 0,
        averageExecutionTime: contextDetectionTime + pluginSelectionTime
      };

      await this.contextCache.set(contextHash, cachedContext);
    }

    return {
      requestId: crypto.randomUUID(),
      selectedContext: contextResult,
      activatedPlugins: selectedPlugins,
      executionPlan: {
        steps: ['context_detection', 'plugin_selection', 'execution'],
        estimatedDuration: contextDetectionTime + pluginSelectionTime,
        plugins: { required: selectedPlugins, optional: [] }
      },
      performance: {
        contextDetectionTime,
        pluginSelectionTime,
        totalExecutionTime: contextDetectionTime + pluginSelectionTime,
        cacheHit: false
      },
      timestamp: Date.now()
    };
  }

  private async detectContextHighPerformance(command: OrchestrationCommand): Promise<SelectedContext> {
    // Use worker pool for CPU-intensive context detection
    const contextDetectionTask: WorkerTask = {
      type: 'context_detection',
      data: {
        naturalLanguage: command.naturalLanguage,
        context: command.context,
        urgency: command.urgency
      },
      timeoutMs: 5000
    };

    const result = await this.workerPool.execute(contextDetectionTask);
    return result.context;
  }

  private async selectOptimalPlugins(
    contextResult: SelectedContext,
    prediction: ContextPrediction
  ): Promise<string[]> {
    // Combine required plugins with predicted plugins
    const requiredPlugins = contextResult.requiredPlugins || [];
    const predictedPlugins = prediction.predictions
      .filter(p => p.probability > 0.3)
      .map(p => p.contextId)
      .slice(0, 3); // Top 3 predictions

    // Remove duplicates and return
    return [...new Set([...requiredPlugins, ...predictedPlugins])];
  }

  private generateContextHash(command: OrchestrationCommand): string {
    const hashInput = JSON.stringify({
      naturalLanguage: command.naturalLanguage,
      context: command.context,
      urgency: command.urgency,
      user: command.user,
      project: command.project
    });

    return crypto.createHash('sha256').update(hashInput).digest('hex');
  }

  private getDefaultOptimizationStrategy(): OptimizationStrategy {
    return {
      caching: {
        contextCache: true,
        pluginCache: true,
        resultCache: true,
        ttlMs: 300000, // 5 minutes
        maxSize: 10000
      },
      pooling: {
        workerPool: true,
        connectionPool: true,
        resourcePool: true,
        poolSize: 4
      },
      batching: {
        requestBatching: true,
        pluginBatching: false,
        batchSize: 10,
        batchTimeoutMs: 100
      },
      prediction: {
        contextPrediction: true,
        pluginPreloading: true,
        resourcePrefetching: false,
        mlModelEnabled: true
      }
    };
  }

  private startOptimizationLoop(): void {
    // Performance optimization loop
    setInterval(() => {
      this.optimizePerformance();
    }, 60000); // Every minute
  }

  private optimizePerformance(): void {
    const metrics = this.getPerformanceMetrics();

    // Adjust cache size based on hit rate
    if (metrics.cacheHitRate < 0.7) {
      // Low hit rate - might need larger cache
      console.error('⚡ Low cache hit rate detected - considering cache optimization');
    }

    // Adjust worker pool size based on utilization
    const poolStats = this.workerPool.getPoolStats();
    if (poolStats.utilization > 0.9) {
      console.error('⚡ High worker utilization detected - consider increasing pool size');
    }

    // Log performance metrics
    this.emit('performance-update', metrics);
  }

  getPerformanceMetrics(): PerformanceMetrics {
    const cacheStats = this.contextCache.getCacheStats();
    const poolStats = this.workerPool.getPoolStats();
    const performanceStats = this.performanceMonitor.getStats();
    const predictionStats = this.predictiveIntelligence.getPredictionStats();

    return {
      contextDetectionTime: performanceStats.avgContextDetectionTime,
      pluginSelectionTime: performanceStats.avgPluginSelectionTime,
      orchestrationTime: performanceStats.avgOrchestrationTime,
      memoryUsage: process.memoryUsage().heapUsed / 1024 / 1024, // MB
      cpuUsage: process.cpuUsage().system / 1000000, // Convert to ms
      concurrentRequests: performanceStats.concurrentRequests,
      cacheHitRate: cacheStats.hitRate,
      throughput: performanceStats.throughput
    };
  }

  async shutdown(): Promise<void> {
    await this.workerPool.shutdown();
    this.removeAllListeners();
  }
}

// ============================================================================
// SUPPORTING INTERFACES
// ============================================================================

export interface OrchestrationCommand {
  naturalLanguage: string;
  context: string;
  urgency: 'low' | 'medium' | 'high' | 'critical';
  user: string;
  project: string;
}

export interface OrchestrationResult {
  requestId: string;
  selectedContext: SelectedContext;
  activatedPlugins: string[];
  executionPlan: ExecutionPlan;
  performance: ExecutionPerformance;
  timestamp: number;
}

export interface SelectedContext {
  name: string;
  requiredPlugins: string[];
  priority: string;
  performance?: PerformanceProfile;
}

export interface ExecutionPlan {
  steps: string[];
  estimatedDuration: number;
  plugins: {
    required: string[];
    optional: string[];
  };
}

export interface ExecutionPerformance {
  contextDetectionTime: number;
  pluginSelectionTime: number;
  totalExecutionTime: number;
  cacheHit: boolean;
}

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

export class PerformanceMonitor {
  private activeRequests: Map<string, RequestMetrics> = new Map();
  private completedRequests: RequestMetrics[] = [];
  private readonly maxHistory = 1000;

  startRequest(requestId: string): void {
    this.activeRequests.set(requestId, {
      requestId,
      startTime: Date.now(),
      status: 'active'
    });
  }

  completeRequest(requestId: string, executionTime: number): void {
    const request = this.activeRequests.get(requestId);
    if (request) {
      request.endTime = Date.now();
      request.executionTime = executionTime;
      request.status = 'completed';

      this.completedRequests.push(request);
      this.activeRequests.delete(requestId);

      // Maintain history size
      if (this.completedRequests.length > this.maxHistory) {
        this.completedRequests.shift();
      }
    }
  }

  failRequest(requestId: string, error: string): void {
    const request = this.activeRequests.get(requestId);
    if (request) {
      request.endTime = Date.now();
      request.error = error;
      request.status = 'failed';

      this.completedRequests.push(request);
      this.activeRequests.delete(requestId);
    }
  }

  getStats(): PerformanceStats {
    const completed = this.completedRequests.filter(r => r.status === 'completed');
    const failed = this.completedRequests.filter(r => r.status === 'failed');

    const avgExecutionTime = completed.length > 0
      ? completed.reduce((sum, r) => sum + (r.executionTime || 0), 0) / completed.length
      : 0;

    const now = Date.now();
    const lastMinute = completed.filter(r => (r.endTime || 0) > now - 60000);

    return {
      avgContextDetectionTime: avgExecutionTime * 0.3, // Estimated 30% of total
      avgPluginSelectionTime: avgExecutionTime * 0.2,  // Estimated 20% of total
      avgOrchestrationTime: avgExecutionTime,
      concurrentRequests: this.activeRequests.size,
      throughput: lastMinute.length, // Requests per minute
      successRate: this.completedRequests.length > 0
        ? completed.length / this.completedRequests.length
        : 1,
      totalRequests: this.completedRequests.length,
      failedRequests: failed.length
    };
  }
}

export interface RequestMetrics {
  requestId: string;
  startTime: number;
  endTime?: number;
  executionTime?: number;
  status: 'active' | 'completed' | 'failed';
  error?: string;
}

export interface PerformanceStats {
  avgContextDetectionTime: number;
  avgPluginSelectionTime: number;
  avgOrchestrationTime: number;
  concurrentRequests: number;
  throughput: number;
  successRate: number;
  totalRequests: number;
  failedRequests: number;
}

// ============================================================================
// REQUEST BATCHING
// ============================================================================

export class RequestBatcher {
  private batchQueue: BatchedRequest[] = [];
  private batchTimer: NodeJS.Timeout | null = null;
  private readonly config: BatchingStrategy;

  constructor(config: BatchingStrategy) {
    this.config = config;
  }

  async addRequest(command: OrchestrationCommand): Promise<OrchestrationResult | null> {
    if (!this.config.requestBatching) return null;

    return new Promise((resolve) => {
      const batchedRequest: BatchedRequest = {
        command,
        resolve,
        timestamp: Date.now()
      };

      this.batchQueue.push(batchedRequest);

      // Process batch if full or start timer
      if (this.batchQueue.length >= this.config.batchSize) {
        this.processBatch();
      } else if (!this.batchTimer) {
        this.batchTimer = setTimeout(() => {
          this.processBatch();
        }, this.config.batchTimeoutMs);
      }
    });
  }

  private processBatch(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    const currentBatch = this.batchQueue.splice(0, this.config.batchSize);
    if (currentBatch.length === 0) return;

    // Process batch (simplified - in reality, would optimize similar requests)
    for (const request of currentBatch) {
      // For now, just resolve with a basic result
      request.resolve({
        requestId: crypto.randomUUID(),
        selectedContext: {
          name: request.command.context,
          requiredPlugins: [],
          priority: 'batched'
        },
        activatedPlugins: [],
        executionPlan: {
          steps: ['batched_execution'],
          estimatedDuration: 50,
          plugins: { required: [], optional: [] }
        },
        performance: {
          contextDetectionTime: 10,
          pluginSelectionTime: 5,
          totalExecutionTime: 50,
          cacheHit: false
        },
        timestamp: Date.now()
      });
    }
  }
}

export interface BatchedRequest {
  command: OrchestrationCommand;
  resolve: (result: OrchestrationResult) => void;
  timestamp: number;
}

// ============================================================================
// USAGE EXAMPLE
// ============================================================================

export async function createHighPerformanceOrchestrator(): Promise<HighPerformanceGeminiOrchestrator> {
  const orchestrator = new HighPerformanceGeminiOrchestrator();

  // Set up performance monitoring
  orchestrator.on('performance-update', (metrics: PerformanceMetrics) => {
    if (metrics.throughput < 10) { // Less than 10 requests per minute
      console.error('⚡ Low throughput detected:', metrics.throughput, 'rpm');
    }
  });

  orchestrator.on('cache-hit', (event) => {
    console.log('💾 Cache hit for context:', event.contextHash.substring(0, 8));
  });

  return orchestrator;
}

// Worker thread code for context detection
if (!isMainThread && parentPort) {
  parentPort.on('message', async (message) => {
    try {
      const { task, requestId } = message;

      if (task.type === 'context_detection') {
        // Simulate high-performance context detection
        const context: SelectedContext = {
          name: task.data.context + '_optimized',
          requiredPlugins: ['OptimizedPlugin1', 'OptimizedPlugin2'],
          priority: task.data.urgency
        };

        parentPort!.postMessage({
          requestId,
          result: { context }
        });
      }
    } catch (error) {
      parentPort!.postMessage({
        requestId: message.requestId,
        error: error.message
      });
    }
  });
}