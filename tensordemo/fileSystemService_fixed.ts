// Fixed version of fileSystemService.ts with all bot feedback addressed

// ... existing imports ...
import * as crypto from 'node:crypto';

// ... existing code ...

// Fixed readTextFile method with improved cache validation
export async function readTextFile(normalizedPath: string): Promise<string> {
  const startTime = Date.now();

  // Check cache first with robust validation
  const cached = this.cache.get(normalizedPath);
  if (cached && (Date.now() - cached.cachedAt <= this.config.cacheTTL)) {
    const isStale = await this.detectConflict(normalizedPath, cached.metadata);
    if (!isStale) {
      this.stats.cacheHits++;
      cached.accessCount++;
      cached.lastAccessed = Date.now();
      if (this.config.enableLogging) {
        console.log(`[VFS] Cache hit for ${normalizedPath}`);
      }
      return cached.content;
    }
  }

  // Cache miss or stale - read from disk
  const content = await this.realFileSystem.readTextFile(normalizedPath);
  const metadata = await this.getFileMetadata(normalizedPath);

  // Store in cache
  this.cache.set(normalizedPath, {
    content,
    metadata,
    cachedAt: Date.now(),
    accessCount: 1,
    lastAccessed: Date.now()
  });

  this.stats.cacheMisses++;

  if (this.config.enableLogging) {
    console.log(`[VFS] Cache miss for ${normalizedPath}`);
  }

  return content;
}

// Fixed writeTextFile method with correct diskContent for conflict resolution
export async function writeTextFile(normalizedPath: string, content: string): Promise<void> {
  const startTime = Date.now();

  // Check for existing entry
  const existingEntry = this.cache.get(normalizedPath);

  if (existingEntry) {
    // Detect conflicts
    const hasConflict = await this.detectConflict(normalizedPath, existingEntry.metadata);

    if (hasConflict) {
      // Get current disk content for conflict resolution
      const diskContent = await this.realFileSystem.readTextFile(normalizedPath);

      // Trigger conflict resolution agent
      const agent = this.getConflictResolutionAgent();
      if (agent) {
        const scenario: AgentScenario = {
          type: 'conflict',
          path: normalizedPath,
          cachedContent: existingEntry.content,
          newContent: content,
          diskContent: diskContent, // Fixed: Use actual disk content
          metadata: existingEntry.metadata
        };

        try {
          const result = await agent.handle(scenario);
          if (result.success && result.resolution) {
            // Apply agent resolution
            await this.applyAgentResolution(normalizedPath, result.resolution);
            return;
          }
        } catch (error) {
          if (this.config.enableLogging) {
            console.error(`[VFS] Agent conflict resolution failed: ${error}`);
          }
        }
      }

      // Fallback to default conflict resolution
      await this.handleConflict(normalizedPath, existingEntry, content);
    }
  }

  // No conflict - write directly
  await this.realFileSystem.writeTextFile(normalizedPath, content);

  // Update cache
  const metadata = await this.getFileMetadata(normalizedPath);
  this.cache.set(normalizedPath, {
    content,
    metadata,
    cachedAt: Date.now(),
    accessCount: 1,
    lastAccessed: Date.now()
  });

  this.stats.writes++;
}

// Fixed hashContent method with SHA-256
private hashContent(content: string): string {
  // Use a standard cryptographic hash for much stronger collision resistance.
  return crypto.createHash('sha256').update(content).digest('hex');
}

// Removed flawed isCacheValid method - no longer needed with detectConflict approach

// Fixed agent metrics handling with null checks
private async processAgentResponse(agent: VFSAgent, responseTime: number): Promise<void> {
  // Update metrics with null safety
  const metrics = this.agentMetrics.get(agent.type);
  if (!metrics) {
    if (this.config.enableLogging) {
      console.error(`[VFS] Metrics not found for agent: ${agent.name}`);
    }
    return;
  }

  metrics.totalCalls++;
  metrics.totalResponseTime += responseTime;
  metrics.averageResponseTime = metrics.totalResponseTime / metrics.totalCalls;
  metrics.lastCalled = Date.now();

  // ... rest of metrics logic ...
}

// Add CODE_GENERATION to AgentType enum
export enum AgentType {
  CONFLICT_RESOLUTION = 'conflict_resolution',
  CONSISTENCY_MAINTENANCE = 'consistency_maintenance',
  RECOVERY_SPECIALIST = 'recovery_specialist',
  OPTIMIZATION_ENGINE = 'optimization_engine',
  SECURITY_GUARDIAN = 'security_guardian',
  ANALYSIS_INSIGHT = 'analysis_insight',
  CODE_GENERATION = 'code_generation' // Added for proper agent dispatching
}

// Fixed CodeGenerationAgent with proper type
class CodeGenerationAgent implements VFSAgent {
  readonly type = AgentType.CODE_GENERATION; // Using a dedicated type
  readonly name = 'Code Generation Agent';
  readonly priority = AgentPriority.MEDIUM;
  readonly triggers = [AgentTrigger.ON_DEMAND];

  // ... rest of implementation ...
}

// Fixed performance metrics with actual measurements
private updatePerformanceMetrics(operation: string, duration: number): void {
  const metrics = this.performanceMetrics[operation] || {
    totalOperations: 0,
    totalDuration: 0,
    averageDuration: 0,
    minDuration: Infinity,
    maxDuration: 0
  };

  metrics.totalOperations++;
  metrics.totalDuration += duration;
  metrics.averageDuration = metrics.totalDuration / metrics.totalOperations;
  metrics.minDuration = Math.min(metrics.minDuration, duration);
  metrics.maxDuration = Math.max(metrics.maxDuration, duration);

  this.performanceMetrics[operation] = metrics;
}
