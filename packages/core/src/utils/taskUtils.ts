/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * タスクIDを生成する
 */
export function generateTaskId(): string {
  return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * タスクの優先度を数値に変換する
 */
export function getPriorityValue(priority: 'low' | 'medium' | 'high' | 'urgent'): number {
  switch (priority) {
    case 'low': return 1;
    case 'medium': return 2;
    case 'high': return 3;
    case 'urgent': return 4;
    default: return 2;
  }
}

/**
 * タスクの実行時間をフォーマットする
 */
export function formatExecutionTime(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

/**
 * タスクの状態を判定する
 */
export function isTaskCompleted(status: string): boolean {
  return ['success', 'failed', 'partial'].includes(status);
}

/**
 * タスクの成功状態を判定する
 */
export function isTaskSuccessful(status: string): boolean {
  return status === 'success';
} 