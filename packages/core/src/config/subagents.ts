/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { z } from 'zod';
import { readConfigFile, writeConfigFile } from './utils.js';

export const SUBAGENTS_CONFIG_PATH = 'subagents.json';

/**
 * サブエージェントの専門分野
 */
export const SubagentSpecialtySchema = z.enum([
  'code_review',
  'debugging',
  'data_analysis',
  'security_audit',
  'performance_optimization',
  'documentation',
  'testing',
  'architecture_design',
  'api_design',
  'database_optimization',
  'frontend_development',
  'backend_development',
  'devops',
  'machine_learning',
  'custom'
]);

/**
 * サブエージェントの状態
 */
export const SubagentStatusSchema = z.enum([
  'idle',
  'running',
  'completed',
  'failed',
  'terminated'
]);

/**
 * サブエージェントの設定スキーマ
 */
export const SubagentSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  specialty: SubagentSpecialtySchema,
  prompt: z.string(),
  systemPrompt: z.string().optional(),
  maxTokens: z.number().default(4000),
  temperature: z.number().min(0).max(2).default(0.7),
  status: SubagentStatusSchema.default('idle'),
  createdAt: z.string(),
  lastUsed: z.string().optional(),
  taskHistory: z.array(z.object({
    taskId: z.string(),
    task: z.string(),
    result: z.string(),
    timestamp: z.string(),
    status: z.enum(['success', 'failed', 'partial'])
  })).default([]),
  customTools: z.array(z.string()).default([]),
  parentAgentId: z.string().optional(),
  isActive: z.boolean().default(true)
});

/**
 * サブエージェント設定ファイルのスキーマ
 */
export const SubagentsConfigSchema = z.object({
  version: z.literal('1'),
  subagents: z.array(SubagentSchema),
  settings: z.object({
    maxConcurrentSubagents: z.number().default(5),
    defaultTimeout: z.number().default(300000), // 5分
    enableParallelExecution: z.boolean().default(true),
    autoCleanupCompleted: z.boolean().default(true)
  }).default({})
});

export type SubagentSpecialty = z.infer<typeof SubagentSpecialtySchema>;
export type SubagentStatus = z.infer<typeof SubagentStatusSchema>;
export type Subagent = z.infer<typeof SubagentSchema>;
export type SubagentsConfig = z.infer<typeof SubagentsConfigSchema>;

const DEFAULT_SUBAGENTS_CONFIG: SubagentsConfig = {
  version: '1',
  subagents: [],
  settings: {
    maxConcurrentSubagents: 5,
    defaultTimeout: 300000,
    enableParallelExecution: true,
    autoCleanupCompleted: true
  }
};

/**
 * サブエージェント設定ファイルを読み込む
 */
export async function readSubagentsConfig(): Promise<SubagentsConfig> {
  return readConfigFile(
    SUBAGENTS_CONFIG_PATH,
    SubagentsConfigSchema,
    DEFAULT_SUBAGENTS_CONFIG,
  );
}

/**
 * サブエージェント設定ファイルを書き込む
 */
export async function writeSubagentsConfig(config: SubagentsConfig): Promise<void> {
  await writeConfigFile(SUBAGENTS_CONFIG_PATH, config);
}

/**
 * 新しいサブエージェントを作成する
 */
export async function createSubagent(subagent: Omit<Subagent, 'id' | 'createdAt' | 'status' | 'taskHistory'>): Promise<Subagent> {
  const config = await readSubagentsConfig();
  const newSubagent: Subagent = {
    ...subagent,
    id: generateSubagentId(),
    createdAt: new Date().toISOString(),
    status: 'idle',
    taskHistory: []
  };
  
  config.subagents.push(newSubagent);
  await writeSubagentsConfig(config);
  return newSubagent;
}

/**
 * サブエージェントIDを生成する
 */
function generateSubagentId(): string {
  return `sub_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * サブエージェントを取得する
 */
export async function getSubagent(id: string): Promise<Subagent | null> {
  const config = await readSubagentsConfig();
  return config.subagents.find(sub => sub.id === id) || null;
}

/**
 * サブエージェントを更新する
 */
export async function updateSubagent(id: string, updates: Partial<Subagent>): Promise<Subagent | null> {
  const config = await readSubagentsConfig();
  const index = config.subagents.findIndex(sub => sub.id === id);
  
  if (index === -1) return null;
  
  config.subagents[index] = { ...config.subagents[index], ...updates };
  await writeSubagentsConfig(config);
  return config.subagents[index];
}

/**
 * サブエージェントを削除する
 */
export async function deleteSubagent(id: string): Promise<boolean> {
  const config = await readSubagentsConfig();
  const initialLength = config.subagents.length;
  config.subagents = config.subagents.filter(sub => sub.id !== id);
  
  if (config.subagents.length === initialLength) return false;
  
  await writeSubagentsConfig(config);
  return true;
}

/**
 * 専門分野別のサブエージェントを取得する
 */
export async function getSubagentsBySpecialty(specialty: SubagentSpecialty): Promise<Subagent[]> {
  const config = await readSubagentsConfig();
  return config.subagents.filter(sub => sub.specialty === specialty && sub.isActive);
}

/**
 * アクティブなサブエージェントを取得する
 */
export async function getActiveSubagents(): Promise<Subagent[]> {
  const config = await readSubagentsConfig();
  return config.subagents.filter(sub => sub.isActive);
}

/**
 * 実行中のサブエージェントを取得する
 */
export async function getRunningSubagents(): Promise<Subagent[]> {
  const config = await readSubagentsConfig();
  return config.subagents.filter(sub => sub.status === 'running');
}

/**
 * サブエージェントのタスク履歴を追加する
 */
export async function addTaskHistory(id: string, taskHistory: Subagent['taskHistory'][0]): Promise<void> {
  const subagent = await getSubagent(id);
  if (!subagent) return;
  
  const updatedHistory = [...subagent.taskHistory, taskHistory];
  await updateSubagent(id, { taskHistory: updatedHistory });
} 