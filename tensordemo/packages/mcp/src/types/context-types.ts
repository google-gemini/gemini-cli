/**
 * PLUMCP Context Type Definitions
 */

export interface ContextProfile {
  name: string;
  description: string;
  triggerWords: string[];
  requiredPlugins: string[];
  optionalPlugins: string[];
  priority: 'security' | 'performance' | 'reliability' | 'intelligence' | 'compatibility';
  maxConcurrency: number;
  timeout: number;
}

export interface OrchestrationResult {
  selectedContext: ContextProfile;
  activatedPlugins: string[];
  executionPlan: {
    plugins: {
      required: string[];
      optional: string[];
    };
    priority: string;
    maxConcurrency: number;
    timeout: number;
  };
  estimatedDuration: number;
  riskAssessment: 'low' | 'medium' | 'high';
}

export interface PluginActivationResult {
  pluginId: string;
  success: boolean;
  duration: number;
  error?: string;
  capabilities?: string[];
}

export interface ContextMetrics {
  totalContexts: number;
  activePlugins: number;
  performance: {
    avgResponseTime: number;
    successRate: number;
    totalRequests: number;
    errorRate: number;
  };
  resourceUsage: {
    memory: number;
    cpu: number;
    network: number;
  };
}
