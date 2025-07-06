/**
 * @license
 * Copyright 2025 TrustOS Contributors
 * SPDX-License-Identifier: Apache-2.0
 */

import * as os from 'os';
import * as process from 'process';

export interface SystemMetrics {
  cpuUsage: number; // Percentage
  memoryUsage: {
    total: number; // Bytes
    used: number; // Bytes
    free: number; // Bytes
    available: number; // Bytes
  };
  nodeMemory: {
    heapUsed: number; // Bytes
    heapTotal: number; // Bytes
    external: number; // Bytes
    rss: number; // Bytes
  };
  loadAverage: number[]; // 1, 5, 15 minute averages
  platform: string;
  uptime: number; // Seconds
}

export interface InferenceMetrics {
  tokensPerSecond: number;
  totalTokens: number;
  inferenceTime: number; // Milliseconds
  modelName: string;
  promptLength: number;
  responseLength: number;
  timestamp: Date;
}

export interface ResourceUsage {
  cpuPercent: number;
  memoryMB: number;
  gpuPercent?: number; // If available
  gpuMemoryMB?: number; // If available
}

export class PerformanceMonitor {
  private inferenceHistory: InferenceMetrics[] = [];
  private maxHistorySize = 100;
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  getSystemMetrics(): SystemMetrics {
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const nodeMemory = process.memoryUsage();

    return {
      cpuUsage: this.getCPUUsage(),
      memoryUsage: {
        total: totalMemory,
        used: totalMemory - freeMemory,
        free: freeMemory,
        available: freeMemory
      },
      nodeMemory: {
        heapUsed: nodeMemory.heapUsed,
        heapTotal: nodeMemory.heapTotal,
        external: nodeMemory.external,
        rss: nodeMemory.rss
      },
      loadAverage: os.loadavg(),
      platform: os.platform(),
      uptime: os.uptime()
    };
  }

  private getCPUUsage(): number {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type as keyof typeof cpu.times];
      }
      totalIdle += cpu.times.idle;
    }

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    
    return 100 - ~~(100 * idle / total);
  }

  recordInference(metrics: InferenceMetrics): void {
    this.inferenceHistory.push(metrics);
    
    // Keep only the last N records
    if (this.inferenceHistory.length > this.maxHistorySize) {
      this.inferenceHistory.shift();
    }
  }

  getInferenceStats(): {
    averageTokensPerSecond: number;
    totalInferences: number;
    averageInferenceTime: number;
    recentMetrics: InferenceMetrics[];
  } {
    if (this.inferenceHistory.length === 0) {
      return {
        averageTokensPerSecond: 0,
        totalInferences: 0,
        averageInferenceTime: 0,
        recentMetrics: []
      };
    }

    const totalTokensPerSecond = this.inferenceHistory.reduce(
      (sum, metric) => sum + metric.tokensPerSecond, 
      0
    );
    const totalInferenceTime = this.inferenceHistory.reduce(
      (sum, metric) => sum + metric.inferenceTime, 
      0
    );

    return {
      averageTokensPerSecond: totalTokensPerSecond / this.inferenceHistory.length,
      totalInferences: this.inferenceHistory.length,
      averageInferenceTime: totalInferenceTime / this.inferenceHistory.length,
      recentMetrics: this.inferenceHistory.slice(-10) // Last 10 inferences
    };
  }

  formatSystemReport(): string {
    const metrics = this.getSystemMetrics();
    const stats = this.getInferenceStats();
    
    let report = '\n🖥️  System Performance Report\n';
    report += '═'.repeat(50) + '\n\n';
    
    // System Resources
    report += '💻 System Resources:\n';
    report += `   CPU Usage: ${metrics.cpuUsage.toFixed(1)}%\n`;
    report += `   Memory: ${this.formatBytes(metrics.memoryUsage.used)} / ${this.formatBytes(metrics.memoryUsage.total)} `;
    report += `(${((metrics.memoryUsage.used / metrics.memoryUsage.total) * 100).toFixed(1)}%)\n`;
    report += `   Load Average: ${metrics.loadAverage.map(l => l.toFixed(2)).join(', ')}\n`;
    report += `   Platform: ${metrics.platform}\n`;
    report += `   Uptime: ${this.formatDuration(metrics.uptime * 1000)}\n\n`;
    
    // Node.js Memory
    report += '🟢 Node.js Memory:\n';
    report += `   Heap Used: ${this.formatBytes(metrics.nodeMemory.heapUsed)}\n`;
    report += `   Heap Total: ${this.formatBytes(metrics.nodeMemory.heapTotal)}\n`;
    report += `   RSS: ${this.formatBytes(metrics.nodeMemory.rss)}\n`;
    report += `   External: ${this.formatBytes(metrics.nodeMemory.external)}\n\n`;
    
    // Inference Performance
    if (stats.totalInferences > 0) {
      report += '🚀 Inference Performance:\n';
      report += `   Total Inferences: ${stats.totalInferences}\n`;
      report += `   Average Speed: ${stats.averageTokensPerSecond.toFixed(1)} tokens/sec\n`;
      report += `   Average Time: ${stats.averageInferenceTime.toFixed(0)}ms\n`;
      
      if (stats.recentMetrics.length > 0) {
        const lastMetric = stats.recentMetrics[stats.recentMetrics.length - 1];
        report += `   Last Model: ${lastMetric.modelName}\n`;
        report += `   Last Speed: ${lastMetric.tokensPerSecond.toFixed(1)} tokens/sec\n`;
      }
    } else {
      report += '🚀 Inference Performance:\n';
      report += '   No inference data available\n';
    }
    
    return report;
  }

  formatCompactStatus(): string {
    const metrics = this.getSystemMetrics();
    const memoryPercent = (metrics.memoryUsage.used / metrics.memoryUsage.total) * 100;
    
    return `CPU: ${metrics.cpuUsage.toFixed(0)}% | ` +
           `MEM: ${memoryPercent.toFixed(0)}% | ` +
           `HEAP: ${this.formatBytes(metrics.nodeMemory.heapUsed)}`;
  }

  monitorResourceUsage(callback: (usage: ResourceUsage) => void, intervalMs = 1000): () => void {
    const interval = setInterval(() => {
      const metrics = this.getSystemMetrics();
      const usage: ResourceUsage = {
        cpuPercent: metrics.cpuUsage,
        memoryMB: metrics.nodeMemory.rss / (1024 * 1024)
      };
      callback(usage);
    }, intervalMs);

    return () => clearInterval(interval);
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  // Utility method to estimate optimal model settings based on current system
  getOptimalModelSettings(): {
    recommendedRAM: number;
    maxContextSize: number;
    preferredQuantization: string;
    estimatedSpeed: 'fast' | 'medium' | 'slow';
  } {
    const metrics = this.getSystemMetrics();
    const totalRAMGB = metrics.memoryUsage.total / (1024 * 1024 * 1024);
    const availableRAMGB = metrics.memoryUsage.available / (1024 * 1024 * 1024);
    const cpuCores = os.cpus().length;

    // Conservative RAM allocation (50% of available)
    const recommendedRAM = Math.floor(availableRAMGB * 0.5);
    
    // Context size based on available memory
    let maxContextSize = 2048;
    if (recommendedRAM >= 8) maxContextSize = 8192;
    if (recommendedRAM >= 16) maxContextSize = 16384;
    if (recommendedRAM >= 32) maxContextSize = 32768;

    // Quantization based on memory constraints
    let preferredQuantization = 'Q4_K_M';
    if (recommendedRAM >= 16) preferredQuantization = 'Q8_0';
    if (recommendedRAM >= 32) preferredQuantization = 'FP16';

    // Speed estimation based on CPU cores and memory
    let estimatedSpeed: 'fast' | 'medium' | 'slow' = 'medium';
    if (cpuCores >= 8 && recommendedRAM >= 16) estimatedSpeed = 'fast';
    if (cpuCores <= 4 || recommendedRAM <= 4) estimatedSpeed = 'slow';

    return {
      recommendedRAM,
      maxContextSize,
      preferredQuantization,
      estimatedSpeed
    };
  }
}

// Global performance monitor instance
export const globalPerformanceMonitor = new PerformanceMonitor();