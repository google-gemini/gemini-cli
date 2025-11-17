/**
 * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Explain Mode Manager
 *
 * Provides transparency into tool usage and educational annotations
 *
 * @module explain/explain-mode
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type {
  ExplainConfig,
  ToolExplanation,
  OperationExplanation,
  ReasoningStep,
  ExplainStats,
  VerbosityLevel,
} from './types.js';
import { EXPLANATION_TEMPLATES } from './templates.js';

const DEFAULT_CONFIG: ExplainConfig = {
  enabled: false,
  verbosity: 'normal',
  showTips: true,
  showReasoning: true,
  showTools: true,
  autoEnableForNewUsers: true,
};

/**
 * Get config file path
 */
function getConfigPath(): string {
  const homeDir = os.homedir();
  const configDir = path.join(homeDir, '.gemini-cli');
  return path.join(configDir, 'explain-config.json');
}

/**
 * Explain Mode Manager
 */
export class ExplainMode {
  private config: ExplainConfig;
  private configPath: string;
  private explanations: OperationExplanation[] = [];
  private toolUsage: Map<string, number> = new Map();

  constructor(configPath?: string) {
    this.configPath = configPath || getConfigPath();
    this.config = this.loadConfig();
  }

  /**
   * Check if explain mode is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }

  /**
   * Enable explain mode
   */
  enable(): void {
    this.config.enabled = true;
    this.saveConfig();
  }

  /**
   * Disable explain mode
   */
  disable(): void {
    this.config.enabled = false;
    this.saveConfig();
  }

  /**
   * Toggle explain mode
   */
  toggle(): boolean {
    this.config.enabled = !this.config.enabled;
    this.saveConfig();
    return this.config.enabled;
  }

  /**
   * Set verbosity level
   */
  setVerbosity(level: VerbosityLevel): void {
    this.config.verbosity = level;
    this.saveConfig();
  }

  /**
   * Get current verbosity
   */
  getVerbosity(): VerbosityLevel {
    return this.config.verbosity;
  }

  /**
   * Get configuration
   */
  getConfig(): ExplainConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ExplainConfig>): void {
    this.config = { ...this.config, ...updates };
    this.saveConfig();
  }

  /**
   * Explain a tool usage
   */
  explainTool(
    toolName: string,
    input?: string,
    reason?: string,
  ): ToolExplanation {
    const template = EXPLANATION_TEMPLATES.get(toolName);

    // Track usage
    this.toolUsage.set(toolName, (this.toolUsage.get(toolName) || 0) + 1);

    const explanation: ToolExplanation = {
      toolName,
      purpose: template?.brief || `${toolName} tool`,
      reason: reason || 'Used to complete the requested operation',
      input,
      tip:
        this.config.showTips && template?.tips && template.tips.length > 0
          ? template.tips[0]
          : undefined,
      docLink: template?.docLink,
      timestamp: Date.now(),
    };

    return explanation;
  }

  /**
   * Explain an operation
   */
  explainOperation(
    request: string,
    approach: string,
    tools: ToolExplanation[],
    reasoning?: ReasoningStep[],
  ): OperationExplanation {
    const explanation: OperationExplanation = {
      id: `op-${Date.now()}`,
      request,
      approach,
      tools,
      reasoning: this.config.showReasoning ? reasoning : undefined,
      tips: this.getTipsForOperation(tools),
      timestamp: Date.now(),
    };

    this.explanations.push(explanation);

    // Keep only last 100 explanations
    if (this.explanations.length > 100) {
      this.explanations = this.explanations.slice(-100);
    }

    return explanation;
  }

  /**
   * Get tips for operation
   */
  private getTipsForOperation(tools: ToolExplanation[]): string[] | undefined {
    if (!this.config.showTips) return undefined;

    const tips: string[] = [];
    for (const tool of tools) {
      if (tool.tip) {
        tips.push(tool.tip);
      }
    }

    return tips.length > 0 ? tips : undefined;
  }

  /**
   * Format explanation for display
   */
  formatExplanation(explanation: OperationExplanation): string {
    const lines: string[] = [];

    lines.push(`📖 **Explanation**\n`);
    lines.push(`Request: ${explanation.request}`);
    lines.push(`Approach: ${explanation.approach}\n`);

    if (this.config.showTools && explanation.tools.length > 0) {
      lines.push(`**Tools Used:**`);
      for (const tool of explanation.tools) {
        lines.push(`- ${tool.toolName}: ${tool.purpose}`);
        if (this.config.verbosity !== 'brief' && tool.reason) {
          lines.push(`  Why: ${tool.reason}`);
        }
      }
      lines.push('');
    }

    if (this.config.showReasoning && explanation.reasoning) {
      lines.push(`**Reasoning:**`);
      for (const step of explanation.reasoning) {
        lines.push(`${step.step}. ${step.description}`);
        if (this.config.verbosity === 'detailed' && step.rationale) {
          lines.push(`   ${step.rationale}`);
        }
      }
      lines.push('');
    }

    if (this.config.showTips && explanation.tips && explanation.tips.length > 0) {
      lines.push(`**💡 Tips:**`);
      for (const tip of explanation.tips) {
        lines.push(`- ${tip}`);
      }
    }

    return lines.join('\n');
  }

  /**
   * Get statistics
   */
  getStats(): ExplainStats {
    const byTool: Record<string, number> = {};
    for (const [tool, count] of this.toolUsage.entries()) {
      byTool[tool] = count;
    }

    return {
      totalExplanations: this.explanations.length,
      byTool,
      tipsShown: this.explanations.filter((e) => e.tips && e.tips.length > 0)
        .length,
      engagement: 0, // Would need user interaction tracking
      avgVerbosity: this.config.verbosity,
    };
  }

  /**
   * Clear explanations history
   */
  clearHistory(): void {
    this.explanations = [];
  }

  /**
   * Get recent explanations
   */
  getRecentExplanations(limit = 10): OperationExplanation[] {
    return this.explanations.slice(-limit);
  }

  /**
   * Load configuration from disk
   */
  private loadConfig(): ExplainConfig {
    try {
      if (fs.existsSync(this.configPath)) {
        const json = fs.readFileSync(this.configPath, 'utf8');
        const loaded = JSON.parse(json);
        return { ...DEFAULT_CONFIG, ...loaded };
      }
    } catch (error) {
      console.error('Failed to load explain config:', error);
    }

    return { ...DEFAULT_CONFIG };
  }

  /**
   * Save configuration to disk
   */
  private saveConfig(): void {
    try {
      const dirPath = path.dirname(this.configPath);
      if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
      }
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        'utf8',
      );
    } catch (error) {
      console.error('Failed to save explain config:', error);
    }
  }
}

/**
 * Singleton instance
 */
let explainModeInstance: ExplainMode | null = null;

/**
 * Get global explain mode instance
 */
export function getExplainMode(): ExplainMode {
  if (!explainModeInstance) {
    explainModeInstance = new ExplainMode();
  }
  return explainModeInstance;
}

/**
 * Reset explain mode instance (for testing)
 */
export function resetExplainMode(): void {
  explainModeInstance = null;
}
