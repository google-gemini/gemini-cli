// Fixed version of fileSystemService.ts for PR3 with all bot feedback addressed

// ... existing imports ...
import { createHash } from 'node:crypto';

// ... existing code ...

// Fixed hashContent method with SHA-256
private hashContent(content: string): string {
  // Using a cryptographic hash is crucial for reliable conflict detection.
  return createHash('sha256').update(content).digest('hex');
}

// Fixed countPatternMatches method with regex escaping to prevent ReDoS
private countPatternMatches(content: string, patterns: any[]): number {
  const escapeRegExp = (str: string) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return patterns.reduce((count, pattern) => {
    const regex = new RegExp(escapeRegExp(pattern.type.replace('_', '')), 'gi');
    const matches = content.match(regex);
    return count + (matches ? matches.length : 0);
  }, 0);
}

// Fixed RecoverySpecialistAgent with actual memory calculation
class RecoverySpecialistAgent implements VFSAgent {
  readonly type = AgentType.RECOVERY_SPECIALIST;
  readonly name = 'Recovery Specialist Agent';
  readonly priority = AgentPriority.HIGH;

  async handle(scenario: AgentScenario): Promise<AgentResult> {
    // Calculate actual freed memory instead of hardcoded value
    const initialMemory = process.memoryUsage().heapUsed;
    // Perform cleanup operations...
    if (global.gc) {
      global.gc();
    }
    const finalMemory = process.memoryUsage().heapUsed;
    const freedMemory = Math.max(0, initialMemory - finalMemory);

    return {
      success: true,
      action: 'Initiated resource cleanup and optimization',
      details: {
        cleanupType: 'memory_optimization',
        freedMemory: `${(freedMemory / 1024 / 1024).toFixed(2)}mb`,
        recoveryType: 'memory_optimization'
      }
    };
  }
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
  readonly type = AgentType.CODE_GENERATION; // Using dedicated type for proper dispatching
  readonly name = 'Code Generation Agent';
  readonly priority = AgentPriority.MEDIUM;
  readonly triggers = [AgentTrigger.ON_DEMAND];

  // ... rest of implementation ...
}

// ... rest of existing code ...
