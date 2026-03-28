/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { performance } from 'node:perf_hooks';
import { EventEmitter } from 'node:events';
import type { StartupPhase } from '../types.js';
import { BaseCollector } from './base-collector.js';

export class StartupCollector extends BaseCollector {
  private phases: StartupPhase[] = [];
  private marks: Map<string, number> = new Map();
  private static instance: StartupCollector;
  private eventEmitter = new EventEmitter();

  private constructor() {
    super(100);
  }

  static getInstance(): StartupCollector {
    if (!StartupCollector.instance) {
      StartupCollector.instance = new StartupCollector();
    }
    return StartupCollector.instance;
  }

  markStart(phase: string): void {
    this.marks.set(phase, performance.now());
    this.eventEmitter.emit('phase-start', phase);
  }

  markEnd(phase: string): void {
    const start = this.marks.get(phase);
    if (start) {
      const duration = performance.now() - start;
      const phaseData: StartupPhase = {
        name: phase,
        duration,
        timestamp: Date.now(),
      };

      this.phases.push(phaseData);
      this.record(duration, 'ms', { phase });
      this.eventEmitter.emit('phase-complete', phaseData);
      this.marks.delete(phase);
    }
  }

  measureAsync<T>(phase: string, fn: () => Promise<T>): Promise<T> {
    this.markStart(phase);
    return fn().finally(() => this.markEnd(phase));
  }

  measureSync<T>(phase: string, fn: () => T): T {
    this.markStart(phase);
    try {
      return fn();
    } finally {
      this.markEnd(phase);
    }
  }

  getPhases(): StartupPhase[] {
    return [...this.phases];
  }

  getTotalTime(): number {
    return this.phases.reduce((sum, p) => sum + p.duration, 0);
  }

  getBreakdown(): Array<{
    name: string;
    duration: number;
    percentage: number;
  }> {
    const total = this.getTotalTime();
    return this.phases.map((p) => ({
      name: p.name,
      duration: p.duration,
      percentage: total > 0 ? (p.duration / total) * 100 : 0,
    }));
  }

  getOptimizationSuggestions(): string[] {
    const suggestions: string[] = [];
    const slowPhases = this.phases.filter((p) => p.duration > 500);

    const suggestionMap: Record<string, string> = {
      'module-loading': 'Use dynamic imports with import() for lazy loading',
      'config-parsing': 'Cache parsed config and use incremental parsing',
      'auth-check': 'Implement token refresh with background renewal',
      'model-init': 'Use connection pooling and lazy initialization',
      'plugin-loading': 'Load plugins on-demand instead of eagerly',
      'dependency-resolution': 'Cache resolution results between runs',
    };

    slowPhases.forEach((phase) => {
      const suggestion =
        suggestionMap[phase.name] ||
        `Review ${phase.name} phase (${phase.duration.toFixed(0)}ms) for optimization opportunities`;
      suggestions.push(suggestion);
    });

    return suggestions;
  }

  on(
    event: 'phase-start' | 'phase-complete',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listener: (data: any) => void,
  ): void {
    this.eventEmitter.on(event, listener);
  }

  reset(): void {
    this.phases = [];
    this.marks.clear();
    this.clear();
  }
}
