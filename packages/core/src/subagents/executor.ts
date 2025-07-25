/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Subagent, SubagentStatus, addTaskHistory, updateSubagent } from '../config/subagents.js';
import { generateTaskId } from '../utils/taskUtils.js';
import { GeminiClient, GeminiRequest } from './geminiClient.js';

export interface SubagentTask {
  taskId: string;
  task: string;
  context?: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  timeout?: number;
  dependencies?: string[];
  metadata?: Record<string, any>;
}

export interface SubagentResult {
  taskId: string;
  subagentId: string;
  result: string;
  status: 'success' | 'failed' | 'partial';
  executionTime: number;
  tokensUsed?: number;
  error?: string;
  metadata?: Record<string, any>;
}

export interface SubagentExecutionOptions {
  timeout?: number;
  maxRetries?: number;
  enableLogging?: boolean;
  parallelExecution?: boolean;
  resultAggregation?: 'first' | 'best' | 'all' | 'consensus';
}

/**
 * サブエージェント実行エンジン
 */
export class SubagentExecutor {
  private runningTasks: Map<string, Promise<SubagentResult>> = new Map();
  private taskQueue: Array<{ task: SubagentTask; subagent: Subagent }> = [];
  private maxConcurrentTasks: number;
  private defaultTimeout: number;
  private geminiClient: GeminiClient | null = null;

  constructor(options: { 
    maxConcurrentTasks?: number; 
    defaultTimeout?: number;
    geminiClient?: GeminiClient;
  } = {}) {
    this.maxConcurrentTasks = options.maxConcurrentTasks || 5;
    this.defaultTimeout = options.defaultTimeout || 300000; // 5分
    this.geminiClient = options.geminiClient || null;
  }

  /**
   * 単一のサブエージェントでタスクを実行する
   */
  async executeTask(
    subagent: Subagent,
    task: Omit<SubagentTask, 'taskId'>,
    options: SubagentExecutionOptions = {}
  ): Promise<SubagentResult> {
    const taskId = generateTaskId();
    const fullTask: SubagentTask = { ...task, taskId };
    
    // サブエージェントの状態を更新
    await updateSubagent(subagent.id, { 
      status: 'running' as SubagentStatus,
      lastUsed: new Date().toISOString()
    });

    const startTime = Date.now();
    const timeout = options.timeout || this.defaultTimeout;

    try {
      // タスク実行のタイムアウト設定
      const result = await Promise.race([
        this.executeSubagentTask(subagent, fullTask),
        this.createTimeoutPromise(timeout)
      ]) as SubagentResult;

      const executionTime = Date.now() - startTime;
      const finalResult: SubagentResult = {
        ...result,
        executionTime,
        status: result.status || 'success'
      };

      // タスク履歴を追加
      await addTaskHistory(subagent.id, {
        taskId,
        task: fullTask.task,
        result: finalResult.result,
        timestamp: new Date().toISOString(),
        status: finalResult.status
      });

      // サブエージェントの状態を更新
      await updateSubagent(subagent.id, { 
        status: 'completed' as SubagentStatus 
      });

      return finalResult;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorResult: SubagentResult = {
        taskId,
        subagentId: subagent.id,
        result: '',
        status: 'failed',
        executionTime,
        error: error instanceof Error ? error.message : String(error)
      };

      // エラー履歴を追加
      await addTaskHistory(subagent.id, {
        taskId,
        task: fullTask.task,
        result: errorResult.error || 'Unknown error',
        timestamp: new Date().toISOString(),
        status: 'failed'
      });

      // サブエージェントの状態を更新
      await updateSubagent(subagent.id, { 
        status: 'failed' as SubagentStatus 
      });

      return errorResult;
    }
  }

  /**
   * 複数のサブエージェントで並列実行する
   */
  async executeParallel(
    subagents: Subagent[],
    task: Omit<SubagentTask, 'taskId'>,
    options: SubagentExecutionOptions = {}
  ): Promise<SubagentResult[]> {
    const taskId = generateTaskId();
    const fullTask: SubagentTask = { ...task, taskId };

    // 並列実行の制限チェック
    if (subagents.length > this.maxConcurrentTasks) {
      throw new Error(`Too many subagents (${subagents.length}). Maximum allowed: ${this.maxConcurrentTasks}`);
    }

    // 全サブエージェントを実行状態に更新
    await Promise.all(
      subagents.map(subagent => 
        updateSubagent(subagent.id, { 
          status: 'running' as SubagentStatus,
          lastUsed: new Date().toISOString()
        })
      )
    );

    try {
      // 並列実行
      const results = await Promise.allSettled(
        subagents.map(subagent => this.executeSubagentTask(subagent, fullTask))
      );

      // 結果を処理
      const processedResults: SubagentResult[] = results.map((result, index) => {
        const subagent = subagents[index];
        if (result.status === 'fulfilled') {
          return result.value;
        } else {
          return {
            taskId,
            subagentId: subagent.id,
            result: '',
            status: 'failed' as const,
            executionTime: 0,
            error: result.reason?.message || 'Unknown error'
          };
        }
      });

      // 結果集約
      const aggregatedResults = this.aggregateResults(processedResults, options.resultAggregation || 'all');

      // 各サブエージェントの状態を更新
      await Promise.all(
        subagents.map(subagent => {
          const result = processedResults.find(r => r.subagentId === subagent.id);
          const status = result?.status === 'success' ? 'completed' : 'failed';
          return updateSubagent(subagent.id, { status: status as SubagentStatus });
        })
      );

      return aggregatedResults;

    } catch (error) {
      // エラー時の状態更新
      await Promise.all(
        subagents.map(subagent => 
          updateSubagent(subagent.id, { status: 'failed' as SubagentStatus })
        )
      );
      throw error;
    }
  }

  /**
   * サブエージェントの実際のタスク実行
   */
  private async executeSubagentTask(subagent: Subagent, task: SubagentTask): Promise<SubagentResult> {
    if (!this.geminiClient) {
      // Gemini APIクライアントが設定されていない場合はモック実装
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({
            taskId: task.taskId,
            subagentId: subagent.id,
            result: `Task completed by ${subagent.name} (${subagent.specialty})`,
            status: 'success',
            executionTime: Math.random() * 1000 + 500, // 500-1500ms
            tokensUsed: Math.floor(Math.random() * 1000) + 100
          });
        }, Math.random() * 2000 + 1000); // 1-3秒のランダム実行時間
      });
    }

    try {
      const startTime = Date.now();
      
      // Gemini APIを使用してタスクを実行
      const response = await this.geminiClient.executeSubagentTask(
        subagent,
        task.task,
        task.context,
        {
          maxTokens: task.metadata?.maxTokens || 4096,
          temperature: task.metadata?.temperature || 0.7
        }
      );

      const executionTime = Date.now() - startTime;

      return {
        taskId: task.taskId,
        subagentId: subagent.id,
        result: response.text,
        status: 'success',
        executionTime,
        tokensUsed: response.tokensUsed,
        metadata: {
          model: response.model,
          finishReason: response.finishReason
        }
      };

    } catch (error) {
      return {
        taskId: task.taskId,
        subagentId: subagent.id,
        result: `Error: ${error instanceof Error ? error.message : String(error)}`,
        status: 'failed',
        executionTime: 0,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * タイムアウト用のPromiseを作成
   */
  private createTimeoutPromise(timeout: number): Promise<SubagentResult> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Task execution timed out after ${timeout}ms`));
      }, timeout);
    });
  }

  /**
   * 結果を集約する
   */
  private aggregateResults(
    results: SubagentResult[], 
    strategy: 'first' | 'best' | 'all' | 'consensus'
  ): SubagentResult[] {
    switch (strategy) {
      case 'first':
        return results.filter(r => r.status === 'success').slice(0, 1);
      case 'best':
        return results.filter(r => r.status === 'success')
          .sort((a, b) => (b.executionTime || 0) - (a.executionTime || 0))
          .slice(0, 1);
      case 'all':
        return results;
      case 'consensus':
        const successfulResults = results.filter(r => r.status === 'success');
        if (successfulResults.length > results.length / 2) {
          return successfulResults;
        }
        return results;
      default:
        return results;
    }
  }

  /**
   * 実行中のタスクを取得
   */
  getRunningTasks(): Map<string, Promise<SubagentResult>> {
    return new Map(this.runningTasks);
  }

  /**
   * 特定のタスクをキャンセル
   */
  async cancelTask(taskId: string): Promise<boolean> {
    const task = this.runningTasks.get(taskId);
    if (!task) return false;

    // タスクのキャンセル処理
    this.runningTasks.delete(taskId);
    return true;
  }

  /**
   * 全実行中タスクをキャンセル
   */
  async cancelAllTasks(): Promise<void> {
    this.runningTasks.clear();
  }
} 