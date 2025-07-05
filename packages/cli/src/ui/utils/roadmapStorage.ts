/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import type { LearningRoadmap } from '../types/roadmap.js';

/**
 * ロードマップの保存と読み込みを管理するユーティリティ
 * 暫定版：ローカルファイルシステムに保存
 */
export class RoadmapStorageService {
  private readonly storageDir: string;

  constructor(customStorageDir?: string) {
    // デフォルトは ~/.sensei-ai/roadmaps
    this.storageDir = customStorageDir || path.join(os.homedir(), '.sensei-ai', 'roadmaps');
  }

  /**
   * ストレージディレクトリを初期化
   */
  private async ensureStorageDir(): Promise<void> {
    try {
      await fs.mkdir(this.storageDir, { recursive: true });
    } catch (error) {
      throw new Error(`Failed to create storage directory: ${error}`);
    }
  }

  /**
   * ロードマップを保存
   */
  async saveRoadmap(roadmap: LearningRoadmap): Promise<string> {
    await this.ensureStorageDir();

    // ファイル名は日時とサブジェクトから生成
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeSubject = roadmap.subject.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    const filename = `roadmap_${safeSubject}_${timestamp}.json`;
    const filepath = path.join(this.storageDir, filename);

    try {
      // Map型をオブジェクトに変換してから保存
      const serializable = {
        ...roadmap,
        nodes: Array.from(roadmap.nodes.entries()).map(([nodeId, node]) => ({
          ...node,
          id: nodeId,
        })),
      };

      await fs.writeFile(
        filepath,
        JSON.stringify(serializable, null, 2),
        'utf8'
      );

      return filepath;
    } catch (error) {
      throw new Error(`Failed to save roadmap: ${error}`);
    }
  }

  /**
   * ロードマップを読み込み
   */
  async loadRoadmap(filepath: string): Promise<LearningRoadmap> {
    try {
      const content = await fs.readFile(filepath, 'utf8');
      const data = JSON.parse(content);

      // nodesをMapに変換
      const nodes = new Map(
        data.nodes.map((node: any) => [node.id, node])
      );

      return {
        ...data,
        nodes,
        createdAt: new Date(data.createdAt),
        updatedAt: data.updatedAt ? new Date(data.updatedAt) : undefined,
      };
    } catch (error) {
      throw new Error(`Failed to load roadmap: ${error}`);
    }
  }

  /**
   * 保存されているすべてのロードマップをリスト
   */
  async listRoadmaps(): Promise<RoadmapSummary[]> {
    await this.ensureStorageDir();

    try {
      const files = await fs.readdir(this.storageDir);
      const roadmapFiles = files.filter(file => file.endsWith('.json'));

      const summaries: RoadmapSummary[] = [];

      for (const file of roadmapFiles) {
        const filepath = path.join(this.storageDir, file);
        try {
          const content = await fs.readFile(filepath, 'utf8');
          const data = JSON.parse(content);
          
          summaries.push({
            id: data.id,
            subject: data.subject,
            goal: data.goal,
            createdAt: new Date(data.createdAt),
            filepath,
            metadata: {
              totalNodes: data.metadata.totalNodes,
              completedNodes: data.metadata.completedNodes,
              userLevel: data.metadata.userLevel,
              totalEstimatedTime: data.metadata.totalEstimatedTime,
            },
          });
        } catch (error) {
          // 個別ファイルの読み込みエラーは無視
          console.error(`Failed to read roadmap file ${file}:`, error);
        }
      }

      // 作成日時の新しい順にソート
      return summaries.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      throw new Error(`Failed to list roadmaps: ${error}`);
    }
  }

  /**
   * ロードマップを削除
   */
  async deleteRoadmap(filepath: string): Promise<void> {
    try {
      await fs.unlink(filepath);
    } catch (error) {
      throw new Error(`Failed to delete roadmap: ${error}`);
    }
  }

  /**
   * ロードマップの進捗を更新
   */
  async updateRoadmapProgress(
    filepath: string, 
    nodeId: string, 
    status: 'in-progress' | 'completed',
    progress?: number
  ): Promise<void> {
    try {
      const roadmap = await this.loadRoadmap(filepath);
      const node = roadmap.nodes.get(nodeId);
      
      if (!node) {
        throw new Error(`Node ${nodeId} not found in roadmap`);
      }

      // ノードの状態を更新
      node.status = status;
      if (progress !== undefined) {
        node.progress = progress;
      }

      // 完了ノード数を更新
      if (status === 'completed') {
        roadmap.metadata.completedNodes = Array.from(roadmap.nodes.values())
          .filter(n => n.status === 'completed').length;
      }

      // 更新日時を設定
      roadmap.updatedAt = new Date();

      // 保存
      await this.saveRoadmap(roadmap);
    } catch (error) {
      throw new Error(`Failed to update roadmap progress: ${error}`);
    }
  }
}

/**
 * ロードマップのサマリー情報
 */
export interface RoadmapSummary {
  id: string;
  subject: string;
  goal: string;
  createdAt: Date;
  filepath: string;
  metadata: {
    totalNodes: number;
    completedNodes: number;
    userLevel: 'beginner' | 'intermediate' | 'advanced';
    totalEstimatedTime: string;
  };
}

// デフォルトのインスタンスをエクスポート
export const roadmapStorage = new RoadmapStorageService();