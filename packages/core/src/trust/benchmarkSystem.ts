/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { TrustModelConfig, GenerationOptions } from './types.js';
import { TrustNodeLlamaClient } from './nodeLlamaClient.js';
import { globalPerformanceMonitor } from './performanceMonitor.js';
import * as os from 'os';

/**
 * Benchmark test configuration
 */
export interface BenchmarkTest {
  id: string;
  name: string;
  description: string;
  prompt: string;
  options: GenerationOptions;
  expectedTokens?: number;
  timeout?: number;
}

/**
 * Benchmark result for a single test
 */
export interface BenchmarkResult {
  testId: string;
  modelName: string;
  tokensPerSecond: number;
  totalTokens: number;
  responseTime: number;
  memoryUsed: number;
  cpuUsage: number;
  success: boolean;
  error?: string;
  timestamp: Date;
}

/**
 * Comprehensive benchmark report
 */
export interface BenchmarkReport {
  modelName: string;
  systemInfo: {
    platform: string;
    cpuCores: number;
    totalRAM: number;
    availableRAM: number;
    nodeVersion: string;
  };
  results: BenchmarkResult[];
  summary: {
    averageTokensPerSecond: number;
    averageResponseTime: number;
    successRate: number;
    totalTests: number;
    recommendedUseCase: string;
  };
  timestamp: Date;
}

/**
 * Performance benchmarking system for Trust CLI
 * Trust: An Open System for Modern Assurance
 */
export class TrustBenchmarkSystem {
  private client: TrustNodeLlamaClient;
  private standardTests: BenchmarkTest[];

  constructor(client: TrustNodeLlamaClient) {
    this.client = client;
    this.standardTests = this.createStandardTests();
  }

  /**
   * Run a comprehensive benchmark suite
   */
  async runBenchmark(
    model: TrustModelConfig,
    options: {
      tests?: string[];
      iterations?: number;
      includeCustomTests?: boolean;
    } = {}
  ): Promise<BenchmarkReport> {
    const { tests, iterations = 1, includeCustomTests = false } = options;
    
    // Load the model if not already loaded
    if (!this.client.isModelLoaded() || this.client.getModelInfo()?.name !== model.name) {
      await this.client.loadModel(model.path, model);
    }

    const results: BenchmarkResult[] = [];
    const testsToRun = tests 
      ? this.standardTests.filter(t => tests.includes(t.id))
      : this.standardTests;

    console.log(`🧪 Running benchmark suite for ${model.name}`);
    console.log(`📋 ${testsToRun.length} tests × ${iterations} iterations`);

    for (let i = 0; i < iterations; i++) {
      console.log(`\\n📊 Iteration ${i + 1}/${iterations}`);
      
      for (const test of testsToRun) {
        console.log(`  ⏳ Running: ${test.name}`);
        
        try {
          const result = await this.runSingleTest(test, model.name);
          results.push(result);
          
          const status = result.success ? '✅' : '❌';
          console.log(`  ${status} ${result.tokensPerSecond.toFixed(1)} t/s (${result.responseTime}ms)`);
          
        } catch (error) {
          console.log(`  ❌ Failed: ${error}`);
          results.push({
            testId: test.id,
            modelName: model.name,
            tokensPerSecond: 0,
            totalTokens: 0,
            responseTime: 0,
            memoryUsed: 0,
            cpuUsage: 0,
            success: false,
            error: String(error),
            timestamp: new Date(),
          });
        }
      }
    }

    return this.generateReport(model.name, results);
  }

  /**
   * Run a quick performance test
   */
  async quickBenchmark(model: TrustModelConfig): Promise<BenchmarkResult> {
    const quickTest: BenchmarkTest = {
      id: 'quick-test',
      name: 'Quick Performance Test',
      description: 'Fast performance check',
      prompt: 'Hello, how are you?',
      options: { temperature: 0.7, maxTokens: 50 },
      timeout: 30000,
    };

    if (!this.client.isModelLoaded() || this.client.getModelInfo()?.name !== model.name) {
      await this.client.loadModel(model.path, model);
    }

    return this.runSingleTest(quickTest, model.name);
  }

  /**
   * Compare multiple models
   */
  async compareModels(
    models: TrustModelConfig[],
    testIds?: string[]
  ): Promise<Map<string, BenchmarkReport>> {
    const results = new Map<string, BenchmarkReport>();
    
    console.log(`🔍 Comparing ${models.length} models`);
    
    for (const model of models) {
      console.log(`\\n📦 Benchmarking: ${model.name}`);
      
      try {
        const report = await this.runBenchmark(model, { tests: testIds });
        results.set(model.name, report);
      } catch (error) {
        console.error(`❌ Failed to benchmark ${model.name}:`, error);
      }
    }
    
    return results;
  }

  /**
   * Generate performance insights
   */
  generateInsights(reports: Map<string, BenchmarkReport>): {
    fastest: string;
    mostEfficient: string;
    bestForCoding: string;
    bestForChat: string;
    recommendations: string[];
  } {
    const reportArray = Array.from(reports.values());
    
    if (reportArray.length === 0) {
      return {
        fastest: 'N/A',
        mostEfficient: 'N/A',
        bestForCoding: 'N/A',
        bestForChat: 'N/A',
        recommendations: ['No benchmark data available'],
      };
    }

    // Find fastest model
    const fastest = reportArray.reduce((prev, current) => 
      current.summary.averageTokensPerSecond > prev.summary.averageTokensPerSecond ? current : prev
    );

    // Find most memory efficient (lowest memory usage with good performance)
    const mostEfficient = reportArray.reduce((prev, current) => {
      const prevEfficiency = prev.summary.averageTokensPerSecond / this.getAverageMemoryUsage(prev);
      const currentEfficiency = current.summary.averageTokensPerSecond / this.getAverageMemoryUsage(current);
      return currentEfficiency > prevEfficiency ? current : prev;
    });

    // Find best for coding (based on code generation test performance)
    const bestForCoding = this.findBestForTask(reportArray, 'code-generation');
    
    // Find best for chat (based on conversation test performance)
    const bestForChat = this.findBestForTask(reportArray, 'conversation');

    const recommendations = this.generateRecommendations(reportArray);

    return {
      fastest: fastest.modelName,
      mostEfficient: mostEfficient.modelName,
      bestForCoding: bestForCoding?.modelName || 'N/A',
      bestForChat: bestForChat?.modelName || 'N/A',
      recommendations,
    };
  }

  private async runSingleTest(test: BenchmarkTest, modelName: string): Promise<BenchmarkResult> {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();
    
    let response = '';
    let tokenCount = 0;
    let success = false;
    let error: string | undefined;

    try {
      // Record system metrics before test
      const beforeMetrics = globalPerformanceMonitor.getSystemMetrics();
      
      // Run the test
      response = await this.client.generateText(test.prompt, test.options);
      tokenCount = this.estimateTokens(response);
      success = true;
      
      // Record system metrics after test
      const afterMetrics = globalPerformanceMonitor.getSystemMetrics();
      
      const endTime = Date.now();
      const responseTime = endTime - startTime;
      const endMemory = process.memoryUsage();
      
      const tokensPerSecond = tokenCount / (responseTime / 1000);
      const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;
      const cpuUsage = afterMetrics.cpuUsage - beforeMetrics.cpuUsage;

      return {
        testId: test.id,
        modelName,
        tokensPerSecond,
        totalTokens: tokenCount,
        responseTime,
        memoryUsed,
        cpuUsage,
        success,
        timestamp: new Date(),
      };
      
    } catch (testError) {
      error = String(testError);
      success = false;
      
      return {
        testId: test.id,
        modelName,
        tokensPerSecond: 0,
        totalTokens: 0,
        responseTime: Date.now() - startTime,
        memoryUsed: 0,
        cpuUsage: 0,
        success,
        error,
        timestamp: new Date(),
      };
    }
  }

  private generateReport(modelName: string, results: BenchmarkResult[]): BenchmarkReport {
    const successfulResults = results.filter(r => r.success);
    const totalTests = results.length;
    const successRate = successfulResults.length / totalTests;
    
    const averageTokensPerSecond = successfulResults.length > 0
      ? successfulResults.reduce((sum, r) => sum + r.tokensPerSecond, 0) / successfulResults.length
      : 0;
    
    const averageResponseTime = successfulResults.length > 0
      ? successfulResults.reduce((sum, r) => sum + r.responseTime, 0) / successfulResults.length
      : 0;

    const recommendedUseCase = this.determineRecommendedUseCase(averageTokensPerSecond, averageResponseTime);

    return {
      modelName,
      systemInfo: {
        platform: os.platform(),
        cpuCores: os.cpus().length,
        totalRAM: Math.floor(os.totalmem() / (1024 ** 3)),
        availableRAM: Math.floor(os.freemem() / (1024 ** 3)),
        nodeVersion: process.version,
      },
      results,
      summary: {
        averageTokensPerSecond,
        averageResponseTime,
        successRate,
        totalTests,
        recommendedUseCase,
      },
      timestamp: new Date(),
    };
  }

  private createStandardTests(): BenchmarkTest[] {
    return [
      {
        id: 'quick-response',
        name: 'Quick Response',
        description: 'Test basic response speed',
        prompt: 'Hello! How are you today?',
        options: { temperature: 0.7, maxTokens: 30 },
        expectedTokens: 20,
        timeout: 15000,
      },
      {
        id: 'conversation',
        name: 'Conversation',
        description: 'Test conversational ability',
        prompt: 'Explain the concept of artificial intelligence in simple terms.',
        options: { temperature: 0.7, maxTokens: 150 },
        expectedTokens: 120,
        timeout: 30000,
      },
      {
        id: 'code-generation',
        name: 'Code Generation',
        description: 'Test programming assistance',
        prompt: 'Write a Python function to calculate the factorial of a number.',
        options: { temperature: 0.3, maxTokens: 200 },
        expectedTokens: 150,
        timeout: 45000,
      },
      {
        id: 'reasoning',
        name: 'Logical Reasoning',
        description: 'Test reasoning capabilities',
        prompt: 'If all roses are flowers and some flowers are red, can we conclude that some roses are red?',
        options: { temperature: 0.5, maxTokens: 100 },
        expectedTokens: 80,
        timeout: 30000,
      },
      {
        id: 'long-context',
        name: 'Long Context',
        description: 'Test handling of longer inputs',
        prompt: 'Summarize the key benefits of using local AI models instead of cloud-based services for privacy-sensitive applications. Consider factors like data security, latency, costs, and control over the inference process. Provide a comprehensive analysis.',
        options: { temperature: 0.6, maxTokens: 300 },
        expectedTokens: 250,
        timeout: 60000,
      },
    ];
  }

  private estimateTokens(text: string): number {
    // Simple token estimation: roughly 4 characters per token
    return Math.ceil(text.length / 4);
  }

  private getAverageMemoryUsage(report: BenchmarkReport): number {
    const successfulResults = report.results.filter(r => r.success);
    if (successfulResults.length === 0) return 1; // Avoid division by zero
    
    return successfulResults.reduce((sum, r) => sum + r.memoryUsed, 0) / successfulResults.length;
  }

  private findBestForTask(reports: BenchmarkReport[], taskId: string): BenchmarkReport | null {
    let bestReport: BenchmarkReport | null = null;
    let bestScore = 0;
    
    for (const report of reports) {
      const taskResult = report.results.find(r => r.testId === taskId && r.success);
      if (taskResult && taskResult.tokensPerSecond > bestScore) {
        bestScore = taskResult.tokensPerSecond;
        bestReport = report;
      }
    }
    
    return bestReport;
  }

  private generateRecommendations(reports: BenchmarkReport[]): string[] {
    const recommendations: string[] = [];
    
    for (const report of reports) {
      const speed = report.summary.averageTokensPerSecond;
      const reliability = report.summary.successRate;
      
      if (speed > 50 && reliability > 0.9) {
        recommendations.push(`${report.modelName}: Excellent for production use - high speed and reliability`);
      } else if (speed > 20 && reliability > 0.8) {
        recommendations.push(`${report.modelName}: Good for general use - balanced performance`);
      } else if (speed < 10) {
        recommendations.push(`${report.modelName}: Consider upgrading hardware or using a smaller model`);
      } else if (reliability < 0.7) {
        recommendations.push(`${report.modelName}: May need troubleshooting - low success rate`);
      }
    }
    
    if (recommendations.length === 0) {
      recommendations.push('No specific recommendations - all models performed adequately');
    }
    
    return recommendations;
  }

  private determineRecommendedUseCase(speed: number, responseTime: number): string {
    if (speed > 50) {
      return 'Excellent for real-time applications and interactive use';
    } else if (speed > 20) {
      return 'Good for general purpose tasks and development';
    } else if (speed > 10) {
      return 'Suitable for batch processing and non-interactive tasks';
    } else {
      return 'Best for light usage or consider hardware upgrade';
    }
  }
}