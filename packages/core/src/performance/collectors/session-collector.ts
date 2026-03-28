/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
import { BaseCollector } from './base-collector.js';
import type { SessionData } from '../types.js';
import { randomBytes } from 'node:crypto';

export class SessionCollector extends BaseCollector {
  private currentSession: SessionData;
  private sessions: Map<string, SessionData> = new Map();
  private static instance: SessionCollector;

  private constructor() {
    super();
    this.currentSession = this.createNewSession();
  }

  static getInstance(): SessionCollector {
    if (!SessionCollector.instance) {
      SessionCollector.instance = new SessionCollector();
    }
    return SessionCollector.instance;
  }

  private createNewSession(): SessionData {
    return {
      sessionId: `session_${Date.now()}_${randomBytes(4).toString('hex')}`,
      startTime: Date.now(),
      tokens: { prompt: 0, completion: 0, total: 0 },
      toolsCalled: new Map<string, number>(),
      filesModified: new Set<string>(),
      apiCalls: 0,
      errors: 0,
      commands: new Map<string, number>(),
    };
  }

  startNewSession(): void {
    this.endCurrentSession();
    this.currentSession = this.createNewSession();
  }

  endCurrentSession(): void {
    if (this.currentSession && !this.currentSession.endTime) {
      this.currentSession.endTime = Date.now();
      // Create a deep copy for storage
      const sessionCopy: SessionData = {
        ...this.currentSession,
        toolsCalled: new Map(this.currentSession.toolsCalled),
        filesModified: new Set(this.currentSession.filesModified),
        commands: new Map(this.currentSession.commands),
      };
      this.sessions.set(this.currentSession.sessionId, sessionCopy);

      const duration =
        (this.currentSession.endTime - this.currentSession.startTime) / 1000;
      this.record(duration, 's', { type: 'session_duration' });
    }
  }

  trackTokens(promptTokens: number, completionTokens: number): void {
    this.currentSession.tokens.prompt += promptTokens;
    this.currentSession.tokens.completion += completionTokens;
    this.currentSession.tokens.total += promptTokens + completionTokens;
    this.currentSession.apiCalls++;

    this.record(promptTokens + completionTokens, 'tokens', { type: 'total' });
  }

  trackToolCall(toolName: string, success: boolean): void {
    const currentCount = this.currentSession.toolsCalled.get(toolName) || 0;
    this.currentSession.toolsCalled.set(toolName, currentCount + 1);

    if (!success) {
      this.currentSession.errors++;
    }
  }

  trackFileModification(filePath: string): void {
    this.currentSession.filesModified.add(filePath);
    this.record(this.currentSession.filesModified.size, 'files', {
      type: 'modified',
    });
  }

  trackCommand(command: string): void {
    const currentCount = this.currentSession.commands.get(command) || 0;
    this.currentSession.commands.set(command, currentCount + 1);
  }

  getCurrentSession(): {
    sessionId: string;
    duration: number;
    tokens: { prompt: number; completion: number; total: number };
    toolsCalled: Array<{ name: string; count: number }>;
    filesModified: number;
    apiCalls: number;
    errors: number;
    commands: Array<{ name: string; count: number }>;
  } {
    const duration = this.currentSession.endTime
      ? (this.currentSession.endTime - this.currentSession.startTime) / 1000
      : (Date.now() - this.currentSession.startTime) / 1000;

    const toolsCalled = Array.from(this.currentSession.toolsCalled.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const commands = Array.from(this.currentSession.commands.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      sessionId: this.currentSession.sessionId,
      duration: Math.round(duration * 10) / 10,
      tokens: { ...this.currentSession.tokens },
      toolsCalled,
      filesModified: this.currentSession.filesModified.size,
      apiCalls: this.currentSession.apiCalls,
      errors: this.currentSession.errors,
      commands,
    };
  }

  getHistoricalSessions(limit = 10): Array<{
    sessionId: string;
    duration: number;
    tokens: number;
    tools: number;
    files: number;
    date: string;
  }> {
    return Array.from(this.sessions.values())
      .filter((s) => s.endTime)
      .map((s) => ({
        sessionId: s.sessionId,
        duration: (s.endTime! - s.startTime) / 1000,
        tokens: s.tokens.total,
        tools: Array.from(s.toolsCalled.values()).reduce((a, b) => a + b, 0),
        files: s.filesModified.size,
        date: new Date(s.startTime).toLocaleString(),
      }))
      .sort((a, b) => b.duration - a.duration)
      .slice(0, limit);
  }

  getSummary(): {
    totalSessions: number;
    totalTokens: number;
    totalToolsCalled: number;
    totalFilesModified: number;
    avgSessionDuration: number;
    avgTokensPerSession: number;
  } {
    const completedSessions = Array.from(this.sessions.values()).filter(
      (s) => s.endTime,
    );

    if (completedSessions.length === 0) {
      return {
        totalSessions: 0,
        totalTokens: 0,
        totalToolsCalled: 0,
        totalFilesModified: 0,
        avgSessionDuration: 0,
        avgTokensPerSession: 0,
      };
    }

    const totalTokens = completedSessions.reduce(
      (sum, s) => sum + s.tokens.total,
      0,
    );
    const totalTools = completedSessions.reduce(
      (sum, s) =>
        sum + Array.from(s.toolsCalled.values()).reduce((a, b) => a + b, 0),
      0,
    );
    const totalFiles = completedSessions.reduce(
      (sum, s) => sum + s.filesModified.size,
      0,
    );
    const totalDuration = completedSessions.reduce(
      (sum, s) => sum + (s.endTime! - s.startTime) / 1000,
      0,
    );

    return {
      totalSessions: completedSessions.length,
      totalTokens,
      totalToolsCalled: totalTools,
      totalFilesModified: totalFiles,
      avgSessionDuration: totalDuration / completedSessions.length,
      avgTokensPerSession: totalTokens / completedSessions.length,
    };
  }

  reset(): void {
    this.endCurrentSession();
    this.currentSession = this.createNewSession();
    this.sessions.clear();
    this.clear();
  }
}
