/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { RoleDefinition } from '../roles/types.js';
import type { ToolsetManager } from './ToolsetManager.js';
import type { Config } from '../config/config.js';

export interface OptimizationProfile {
  readonly aggressive: boolean;
  readonly preserveEssentials: boolean;
  readonly targetTokenReduction: number;
  readonly allowCategoricalChanges: boolean;
}

export interface ToolUsageAnalytics {
  readonly toolName: string;
  readonly usageCount: number;
  readonly lastUsed: Date | null;
  readonly successRate: number;
  readonly averageExecutionTime: number;
  readonly roleUsageFrequency: Record<string, number>;
}

export interface OptimizationResult {
  readonly originalToolCount: number;
  readonly optimizedToolCount: number;
  readonly tokenSavingEstimate: number;
  readonly addedTools: string[];
  readonly removedTools: string[];
  readonly recommendations: Array<{
    tool: string;
    action: 'keep' | 'add' | 'remove';
    reason: string;
    confidence: number;
  }>;
}

/**
 * ToolsetOptimizer analyzes tool usage patterns and provides intelligent 
 * recommendations for optimizing toolsets per role.
 */
export class ToolsetOptimizer {
  private usageAnalytics = new Map<string, ToolUsageAnalytics>();
  private optimizationHistory: Array<{
    roleId: string;
    timestamp: Date;
    result: OptimizationResult;
  }> = [];

  constructor(
    private readonly config: Config,
    private readonly toolsetManager: ToolsetManager
  ) {
    this.loadUsageAnalytics();
  }


  /**
   * Analyze and optimize toolset for a specific role.
   */
  optimizeForRole(
    role: RoleDefinition,
    profile: OptimizationProfile = this.getDefaultProfile()
  ): OptimizationResult {
    const currentTools = this.toolsetManager.getToolsetForRole(role);
    const analytics = this.getRelevantAnalytics(role.id);
    
    const optimization = this.analyzeOptimization(
      role,
      currentTools,
      analytics,
      profile
    );

    // Record optimization history
    this.optimizationHistory.push({
      roleId: role.id,
      timestamp: new Date(),
      result: optimization
    });

    return optimization;
  }

  /**
   * Get tool usage recommendations based on analytics.
   */
  getUsageBasedRecommendations(roleId: string): Array<{
    tool: string;
    recommendation: 'essential' | 'useful' | 'rarely_used' | 'unused';
    confidence: number;
    reason: string;
  }> {
    const analytics = this.getRelevantAnalytics(roleId);
    const recommendations: Array<{
      tool: string;
      recommendation: 'essential' | 'useful' | 'rarely_used' | 'unused';
      confidence: number;
      reason: string;
    }> = [];

    for (const [toolName, data] of analytics) {
      const roleUsage = data.roleUsageFrequency[roleId] || 0;
      const successRate = data.successRate;
      
      let recommendation: 'essential' | 'useful' | 'rarely_used' | 'unused';
      let confidence: number;
      let reason: string;

      if (roleUsage >= 10 && successRate > 0.8) {
        recommendation = 'essential';
        confidence = 0.9;
        reason = `High usage (${roleUsage} times) with excellent success rate (${Math.round(successRate * 100)}%)`;
      } else if (roleUsage >= 3 && successRate > 0.6) {
        recommendation = 'useful';
        confidence = 0.7;
        reason = `Moderate usage (${roleUsage} times) with good success rate (${Math.round(successRate * 100)}%)`;
      } else if (roleUsage > 0 && roleUsage < 3) {
        recommendation = 'rarely_used';
        confidence = 0.6;
        reason = `Low usage (${roleUsage} times) in this role`;
      } else {
        recommendation = 'unused';
        confidence = 0.8;
        reason = 'Never used in this role context';
      }

      recommendations.push({
        tool: toolName,
        recommendation,
        confidence,
        reason
      });
    }

    return recommendations.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Analyze tool compatibility with role requirements.
   */
  analyzeRoleCompatibility(role: RoleDefinition): Record<string, {
    compatibility: number;
    reasons: string[];
  }> {
    const allTools = this.getAllAvailableTools();
    const compatibility: Record<string, {
      compatibility: number;
      reasons: string[];
    }> = {};

    for (const tool of allTools) {
      const analysis = this.calculateToolRoleCompatibility(tool, role);
      compatibility[tool] = analysis;
    }

    return compatibility;
  }

  /**
   * Get optimization statistics across all roles.
   */
  getGlobalOptimizationStats(): {
    totalOptimizations: number;
    averageTokenSaving: number;
    mostOptimizedRole: string | null;
    commonlyRemovedTools: string[];
    commonlyAddedTools: string[];
  } {
    if (this.optimizationHistory.length === 0) {
      return {
        totalOptimizations: 0,
        averageTokenSaving: 0,
        mostOptimizedRole: null,
        commonlyRemovedTools: [],
        commonlyAddedTools: []
      };
    }

    const totalTokenSaving = this.optimizationHistory.reduce(
      (sum, opt) => sum + opt.result.tokenSavingEstimate, 0
    );
    const averageTokenSaving = totalTokenSaving / this.optimizationHistory.length;

    // Find most optimized role (highest average token saving)
    const roleStats = new Map<string, { count: number; totalSaving: number }>();
    for (const opt of this.optimizationHistory) {
      const existing = roleStats.get(opt.roleId) || { count: 0, totalSaving: 0 };
      roleStats.set(opt.roleId, {
        count: existing.count + 1,
        totalSaving: existing.totalSaving + opt.result.tokenSavingEstimate
      });
    }

    let mostOptimizedRole: string | null = null;
    let highestAverage = 0;
    for (const [roleId, stats] of roleStats) {
      const average = stats.totalSaving / stats.count;
      if (average > highestAverage) {
        highestAverage = average;
        mostOptimizedRole = roleId;
      }
    }

    // Find commonly modified tools
    const removedCounts = new Map<string, number>();
    const addedCounts = new Map<string, number>();

    for (const opt of this.optimizationHistory) {
      for (const tool of opt.result.removedTools) {
        removedCounts.set(tool, (removedCounts.get(tool) || 0) + 1);
      }
      for (const tool of opt.result.addedTools) {
        addedCounts.set(tool, (addedCounts.get(tool) || 0) + 1);
      }
    }

    const commonlyRemovedTools = Array.from(removedCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool]) => tool);

    const commonlyAddedTools = Array.from(addedCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tool]) => tool);

    return {
      totalOptimizations: this.optimizationHistory.length,
      averageTokenSaving,
      mostOptimizedRole,
      commonlyRemovedTools,
      commonlyAddedTools
    };
  }

  /**
   * Record tool usage for analytics.
   */
  recordToolUsage(
    toolName: string,
    roleId: string,
    success: boolean,
    executionTime: number
  ): void {
    const existing = this.usageAnalytics.get(toolName) || {
      toolName,
      usageCount: 0,
      lastUsed: null,
      successRate: 0,
      averageExecutionTime: 0,
      roleUsageFrequency: {}
    };

    const newUsageCount = existing.usageCount + 1;
    const newSuccessCount = existing.successRate * existing.usageCount + (success ? 1 : 0);
    const newSuccessRate = newSuccessCount / newUsageCount;
    const newAvgTime = (existing.averageExecutionTime * existing.usageCount + executionTime) / newUsageCount;

    this.usageAnalytics.set(toolName, {
      ...existing,
      usageCount: newUsageCount,
      lastUsed: new Date(),
      successRate: newSuccessRate,
      averageExecutionTime: newAvgTime,
      roleUsageFrequency: {
        ...existing.roleUsageFrequency,
        [roleId]: (existing.roleUsageFrequency[roleId] || 0) + 1
      }
    });

    this.saveUsageAnalytics();
  }

  private analyzeOptimization(
    role: RoleDefinition,
    currentTools: string[],
    analytics: Map<string, ToolUsageAnalytics>,
    profile: OptimizationProfile
  ): OptimizationResult {
    const recommendations: Array<{
      tool: string;
      action: 'keep' | 'add' | 'remove';
      reason: string;
      confidence: number;
    }> = [];

    const addedTools: string[] = [];
    const removedTools: string[] = [];

    // Analyze current tools
    for (const tool of currentTools) {
      const usage = analytics.get(tool);
      const compatibility = this.calculateToolRoleCompatibility(tool, role);
      
      if (this.shouldRemoveTool(tool, usage, compatibility, profile)) {
        removedTools.push(tool);
        recommendations.push({
          tool,
          action: 'remove',
          reason: this.getRemovalReason(tool, usage, compatibility),
          confidence: this.calculateConfidence(usage, compatibility)
        });
      } else {
        recommendations.push({
          tool,
          action: 'keep',
          reason: this.getKeepReason(tool, usage, compatibility),
          confidence: this.calculateConfidence(usage, compatibility)
        });
      }
    }

    // Analyze potential additions
    const allTools = this.getAllAvailableTools();
    const potentialTools = allTools.filter(tool => !currentTools.includes(tool));

    for (const tool of potentialTools) {
      const usage = analytics.get(tool);
      const compatibility = this.calculateToolRoleCompatibility(tool, role);
      
      if (this.shouldAddTool(tool, usage, compatibility, profile)) {
        addedTools.push(tool);
        recommendations.push({
          tool,
          action: 'add',
          reason: this.getAdditionReason(tool, usage, compatibility),
          confidence: this.calculateConfidence(usage, compatibility)
        });
      }
    }

    const originalToolCount = currentTools.length;
    const optimizedToolCount = originalToolCount + addedTools.length - removedTools.length;
    const tokenSavingEstimate = this.estimateTokenSaving(removedTools, addedTools);

    return {
      originalToolCount,
      optimizedToolCount,
      tokenSavingEstimate,
      addedTools,
      removedTools,
      recommendations: recommendations.sort((a, b) => b.confidence - a.confidence)
    };
  }

  private shouldRemoveTool(
    tool: string,
    usage: ToolUsageAnalytics | undefined,
    compatibility: { compatibility: number; reasons: string[] },
    profile: OptimizationProfile
  ): boolean {
    // Never remove essential tools
    if (profile.preserveEssentials && this.isEssentialTool(tool)) {
      return false;
    }

    // Remove if never used and low compatibility
    if (!usage && compatibility.compatibility < 0.3) {
      return true;
    }

    // Remove if rarely used with low success rate
    if (usage && usage.usageCount < 2 && usage.successRate < 0.5) {
      return profile.aggressive;
    }

    return false;
  }

  private shouldAddTool(
    tool: string,
    usage: ToolUsageAnalytics | undefined,
    compatibility: { compatibility: number; reasons: string[] },
    profile: OptimizationProfile
  ): boolean {
    // Add if high compatibility and good usage history
    if (compatibility.compatibility > 0.8) {
      return true;
    }

    // Add if frequently used in other roles with high success rate
    if (usage && usage.usageCount > 5 && usage.successRate > 0.8) {
      return profile.allowCategoricalChanges;
    }

    return false;
  }

  private calculateToolRoleCompatibility(
    tool: string,
    role: RoleDefinition
  ): { compatibility: number; reasons: string[] } {
    const reasons: string[] = [];
    let compatibility = 0.5; // Base compatibility

    // Role category compatibility
    const roleCategory = role.category;
    
    if (roleCategory === 'development') {
      if (['shell', 'ripGrep', 'grep', 'edit', 'read-file', 'write-file'].includes(tool)) {
        compatibility += 0.3;
        reasons.push('Essential for development tasks');
      }
    } else if (roleCategory === 'office') {
      if (['web-search', 'web-fetch', 'read-file', 'write-file'].includes(tool)) {
        compatibility += 0.3;
        reasons.push('Useful for office and research tasks');
      }
      if (['shell', 'ripGrep'].includes(tool)) {
        compatibility -= 0.2;
        reasons.push('System tools rarely needed for office work');
      }
    } else if (roleCategory === 'creative') {
      if (['web-fetch', 'web-search'].includes(tool)) {
        compatibility += 0.2;
        reasons.push('Research capabilities useful for creative work');
      }
      if (['shell', 'grep'].includes(tool)) {
        compatibility -= 0.1;
        reasons.push('Technical tools less relevant for creative tasks');
      }
    }

    // Tool explicitly listed in role
    if (role.tools && role.tools.includes(tool)) {
      compatibility += 0.4;
      reasons.push('Explicitly specified in role definition');
    }

    return {
      compatibility: Math.max(0, Math.min(1, compatibility)),
      reasons
    };
  }

  private getDefaultProfile(): OptimizationProfile {
    return {
      aggressive: false,
      preserveEssentials: true,
      targetTokenReduction: 200,
      allowCategoricalChanges: true
    };
  }

  private getRelevantAnalytics(roleId: string): Map<string, ToolUsageAnalytics> {
    const relevant = new Map<string, ToolUsageAnalytics>();
    
    for (const [tool, analytics] of this.usageAnalytics) {
      if (analytics.roleUsageFrequency[roleId] || analytics.usageCount > 0) {
        relevant.set(tool, analytics);
      }
    }

    return relevant;
  }

  private getAllAvailableTools(): string[] {
    // Use config to satisfy TypeScript
    void this.config; // Mark as intentionally used
    
    // Get all tools from known tool names since ToolRegistry doesn't expose getTools
    return [
      'read-file', 'write-file', 'edit', 'read-many-files',
      'ripGrep', 'grep', 'glob', 'web-search',
      'shell', 'ls',
      'web-fetch',
      'memory-tool',
      'mcp-tool'
    ];
  }

  private isEssentialTool(tool: string): boolean {
    return ['read-file', 'write-file'].includes(tool);
  }

  private estimateTokenSaving(removedTools: string[], addedTools: string[]): number {
    const avgTokensPerTool = 150;
    return (removedTools.length - addedTools.length) * avgTokensPerTool;
  }

  private calculateConfidence(
    usage: ToolUsageAnalytics | undefined,
    compatibility: { compatibility: number; reasons: string[] }
  ): number {
    let confidence = compatibility.compatibility;
    
    if (usage) {
      // Higher confidence for tools with more usage data
      const usageFactor = Math.min(usage.usageCount / 10, 1);
      confidence = confidence * 0.7 + usageFactor * 0.3;
    }

    return Math.max(0.1, Math.min(0.95, confidence));
  }

  private getRemovalReason(
    tool: string,
    usage: ToolUsageAnalytics | undefined,
    compatibility: { compatibility: number; reasons: string[] }
  ): string {
    if (!usage) {
      return `Never used and low compatibility (${Math.round(compatibility.compatibility * 100)}%)`;
    }
    
    return `Low usage (${usage.usageCount} times) and ${Math.round(usage.successRate * 100)}% success rate`;
  }

  private getKeepReason(
    tool: string,
    usage: ToolUsageAnalytics | undefined,
    compatibility: { compatibility: number; reasons: string[] }
  ): string {
    if (this.isEssentialTool(tool)) {
      return 'Essential tool for all roles';
    }
    
    if (usage && usage.usageCount > 0) {
      return `Good usage history (${usage.usageCount} times, ${Math.round(usage.successRate * 100)}% success)`;
    }
    
    return `High role compatibility (${Math.round(compatibility.compatibility * 100)}%)`;
  }

  private getAdditionReason(
    tool: string,
    usage: ToolUsageAnalytics | undefined,
    compatibility: { compatibility: number; reasons: string[] }
  ): string {
    if (compatibility.reasons.length > 0) {
      return compatibility.reasons[0];
    }
    
    if (usage && usage.usageCount > 0) {
      return `Proven useful in other contexts (${usage.usageCount} uses, ${Math.round(usage.successRate * 100)}% success)`;
    }
    
    return `High compatibility with role requirements`;
  }

  private loadUsageAnalytics(): void {
    // Load analytics from storage
    // Implementation would read from file or database
  }

  private saveUsageAnalytics(): void {
    // Save analytics to storage  
    // Implementation would write to file or database
  }
}