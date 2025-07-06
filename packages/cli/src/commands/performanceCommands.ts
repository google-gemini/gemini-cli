/**
 * @license
 * Copyright 2025 Audit Risk Media LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { globalPerformanceMonitor } from '@trustos/trust-cli-core';

export interface PerformanceCommandArgs {
  action: 'status' | 'report' | 'watch' | 'optimize';
  verbose?: boolean;
  watch?: boolean;
  interval?: number;
}

class PerformanceCommandHandler {
  async handleCommand(args: PerformanceCommandArgs): Promise<void> {
    switch (args.action) {
      case 'status':
        await this.showStatus(args.verbose);
        break;
      case 'report':
        await this.showReport();
        break;
      case 'watch':
        await this.watchPerformance(args.interval || 1000);
        break;
      case 'optimize':
        await this.showOptimizationSuggestions();
        break;
      default:
        throw new Error(`Unknown performance command: ${args.action}`);
    }
  }

  private async showStatus(verbose = false): Promise<void> {
    if (verbose) {
      console.log(globalPerformanceMonitor.formatSystemReport());
    } else {
      console.log('\n⚡ System Status');
      console.log('─'.repeat(30));
      console.log(globalPerformanceMonitor.formatCompactStatus());
      
      const metrics = globalPerformanceMonitor.getSystemMetrics();
      const stats = globalPerformanceMonitor.getInferenceStats();
      
      console.log('\n🖥️  Quick Overview:');
      console.log(`   Memory Available: ${this.formatBytes(metrics.memoryUsage.available)}`);
      console.log(`   CPU Cores: ${(await import('os')).default.cpus().length}`);
      console.log(`   Total Inferences: ${stats.totalInferences}`);
      
      if (stats.averageTokensPerSecond > 0) {
        console.log(`   Average Speed: ${stats.averageTokensPerSecond.toFixed(1)} tokens/sec`);
      }
      
      console.log('\n💡 Use "trust perf report" for detailed information');
      console.log('💡 Use "trust perf watch" to monitor in real-time');
    }
  }

  private async showReport(): Promise<void> {
    console.log(globalPerformanceMonitor.formatSystemReport());
    
    const stats = globalPerformanceMonitor.getInferenceStats();
    if (stats.recentMetrics.length > 0) {
      console.log('📊 Recent Inference History:');
      console.log('─'.repeat(50));
      
      stats.recentMetrics.slice(-5).forEach((metric, index) => {
        console.log(`   ${index + 1}. ${metric.modelName}`);
        console.log(`      Speed: ${metric.tokensPerSecond.toFixed(1)} tokens/sec`);
        console.log(`      Time: ${metric.inferenceTime}ms`);
        console.log(`      Tokens: ${metric.totalTokens}`);
        console.log('');
      });
    }
  }

  private async watchPerformance(interval: number): Promise<void> {
    console.log('🔍 Watching system performance (Press Ctrl+C to stop)...\n');
    console.log('Time      | CPU  | Memory | Heap Used | Load Avg');
    console.log('─'.repeat(55));

    const stopMonitoring = globalPerformanceMonitor.monitorResourceUsage((usage) => {
      const metrics = globalPerformanceMonitor.getSystemMetrics();
      const timestamp = new Date().toLocaleTimeString();
      const memoryPercent = (metrics.memoryUsage.used / metrics.memoryUsage.total) * 100;
      const loadAvg = metrics.loadAverage[0].toFixed(2);
      
      process.stdout.write('\r');
      process.stdout.write(
        `${timestamp} | ${usage.cpuPercent.toFixed(0).padStart(3)}% | ` +
        `${memoryPercent.toFixed(0).padStart(5)}% | ` +
        `${this.formatBytes(metrics.nodeMemory.heapUsed).padStart(8)} | ` +
        `${loadAvg.padStart(7)}`
      );
    }, interval);

    // Handle Ctrl+C gracefully
    process.on('SIGINT', () => {
      stopMonitoring();
      console.log('\n\n🛑 Performance monitoring stopped.');
      process.exit(0);
    });

    // Keep the process alive
    await new Promise(() => {}); // Infinite promise
  }

  private async showOptimizationSuggestions(): Promise<void> {
    console.log('\n🎯 System Optimization Suggestions');
    console.log('═'.repeat(50));
    
    const optimal = globalPerformanceMonitor.getOptimalModelSettings();
    const metrics = globalPerformanceMonitor.getSystemMetrics();
    const memoryPercent = (metrics.memoryUsage.used / metrics.memoryUsage.total) * 100;
    
    console.log('\n🚀 Recommended Model Settings:');
    console.log(`   Max RAM Allocation: ${optimal.recommendedRAM}GB`);
    console.log(`   Context Size: ${optimal.maxContextSize} tokens`);
    console.log(`   Quantization: ${optimal.preferredQuantization}`);
    console.log(`   Expected Speed: ${optimal.estimatedSpeed}`);
    
    console.log('\n⚠️  System Analysis:');
    
    if (memoryPercent > 80) {
      console.log('   🔴 High memory usage detected');
      console.log('      → Consider using smaller models or Q4 quantization');
      console.log('      → Close unnecessary applications');
    } else if (memoryPercent > 60) {
      console.log('   🟡 Moderate memory usage');
      console.log('      → Current settings should work well');
    } else {
      console.log('   🟢 Low memory usage');
      console.log('      → You can safely use larger models');
    }
    
    if (metrics.cpuUsage > 80) {
      console.log('   🔴 High CPU usage detected');
      console.log('      → Reduce context size for faster inference');
      console.log('      → Consider lower thread count');
    } else {
      console.log('   🟢 CPU usage is optimal');
    }
    
    const os = await import('os');
    const cpuCores = os.default.cpus().length;
    if (cpuCores <= 4) {
      console.log('   ⚠️  Limited CPU cores detected');
      console.log('      → Use Q4_K_M quantization for better performance');
      console.log('      → Keep context size under 4096 tokens');
    }
    
    console.log('\n💡 Recommendations:');
    
    if (optimal.estimatedSpeed === 'slow') {
      console.log('   → Use qwen2.5-1.5b-instruct for fastest performance');
      console.log('   → Keep prompts short and focused');
    } else if (optimal.estimatedSpeed === 'medium') {
      console.log('   → llama-3.2-3b-instruct offers good balance');
      console.log('   → phi-3.5-mini-instruct excels at coding tasks');
    } else {
      console.log('   → llama-3.1-8b-instruct for highest quality');
      console.log('   → System can handle longer contexts efficiently');
    }
    
    console.log('\n🔧 Performance Tips:');
    console.log('   • Use "trust model recommend <task>" for task-specific models');
    console.log('   • Monitor performance with "trust perf watch"');
    console.log('   • Verify model integrity with "trust model verify"');
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(1)}${units[unitIndex]}`;
  }
}

export async function handlePerformanceCommand(args: PerformanceCommandArgs): Promise<void> {
  const handler = new PerformanceCommandHandler();
  await handler.handleCommand(args);
}