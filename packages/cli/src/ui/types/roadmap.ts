/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Learning roadmap types for Sensei-AI
 * グラフ構造の学習ロードマップを表現するための型定義
 */

/**
 * ノードのタイプ
 */
export type NodeType = 
  | 'topic'        // 学習トピック
  | 'milestone'    // マイルストーン（大きな節目）
  | 'checkpoint';  // チェックポイント（理解度確認）

/**
 * ノードの状態
 */
export type NodeStatus = 
  | 'locked'       // ロック中（前提条件未達成）
  | 'available'    // 利用可能
  | 'in-progress'  // 学習中
  | 'completed';   // 完了

/**
 * エッジのタイプ（関係性）
 */
export type EdgeType = 
  | 'prerequisite' // 前提条件（必須）
  | 'recommended'  // 推奨
  | 'optional';    // オプション

/**
 * 学習ロードマップ全体
 */
export interface LearningRoadmap {
  /** ロードマップID */
  id: string;
  /** 学習分野 */
  subject: string;
  /** 学習目標 */
  goal: string;
  /** ノードのマップ（IDをキーとする） */
  nodes: Map<string, LearningNode>;
  /** エッジのリスト */
  edges: LearningEdge[];
  /** メタデータ */
  metadata: RoadmapMetadata;
  /** 作成日時 */
  createdAt: Date;
  /** 更新日時 */
  updatedAt?: Date;
}

/**
 * 学習ノード（グラフの頂点）
 */
export interface LearningNode {
  /** ノードID */
  id: string;
  /** タイトル */
  title: string;
  /** 説明 */
  description: string;
  /** ノードタイプ */
  type: NodeType;
  /** 現在の状態 */
  status: NodeStatus;
  /** グラフ上の位置 */
  position: NodePosition;
  /** 推定学習時間 */
  estimatedTime: string;
  /** 前提条件となるノードIDのリスト */
  prerequisites: string[];
  /** 関連リソース */
  resources: LearningResource[];
  /** グラフの深さ（ルートからの距離） */
  depth: number;
  /** 習得すべき概念 */
  concepts?: string[];
  /** 実践課題 */
  practiceExercises?: string[];
  /** 完了条件 */
  completionCriteria?: string[];
  /** 進捗率（0-100） */
  progress?: number;
}

/**
 * ノードの位置情報
 */
export interface NodePosition {
  /** X座標（列） */
  x: number;
  /** Y座標（行） */
  y: number;
  /** レイアウトのヒント */
  layoutHint?: 'center' | 'left' | 'right';
}

/**
 * 学習エッジ（グラフの辺）
 */
export interface LearningEdge {
  /** エッジID */
  id: string;
  /** 開始ノードID */
  from: string;
  /** 終了ノードID */
  to: string;
  /** エッジタイプ */
  type: EdgeType;
  /** 重要度（0-1） */
  weight: number;
  /** エッジのラベル（オプション） */
  label?: string;
  /** 条件（このエッジを通るための条件） */
  condition?: string;
}

/**
 * 学習リソース
 */
export interface LearningResource {
  /** リソースID */
  id: string;
  /** タイトル */
  title: string;
  /** タイプ */
  type: 'article' | 'video' | 'exercise' | 'documentation' | 'book' | 'course';
  /** URL（オプション） */
  url?: string;
  /** 説明 */
  description?: string;
  /** 推定所要時間 */
  estimatedTime?: string;
  /** 難易度 */
  difficulty?: 'beginner' | 'intermediate' | 'advanced';
}

/**
 * ロードマップのメタデータ
 */
export interface RoadmapMetadata {
  /** ユーザーの現在のレベル */
  userLevel: 'beginner' | 'intermediate' | 'advanced';
  /** 推奨学習ペース */
  recommendedPace: 'slow' | 'normal' | 'fast';
  /** 総推定学習時間 */
  totalEstimatedTime: string;
  /** 総ノード数 */
  totalNodes: number;
  /** 完了ノード数 */
  completedNodes: number;
  /** 前提知識 */
  prerequisites: string[];
  /** 学習スタイル */
  learningStyle?: 'visual' | 'practical' | 'theoretical' | 'mixed';
  /** 最終アクセス日時 */
  lastAccessedAt?: Date;
  /** セッションID（元の学習発見セッションとの関連） */
  discoverySessionId?: string;
}

/**
 * グラフレイアウトの設定
 */
export interface GraphLayoutConfig {
  /** ノード間の水平間隔 */
  horizontalSpacing: number;
  /** ノード間の垂直間隔 */
  verticalSpacing: number;
  /** 最大幅（文字数） */
  maxWidth: number;
  /** 最大高さ（行数） */
  maxHeight: number;
  /** レイアウトアルゴリズム */
  algorithm: 'hierarchical' | 'force-directed' | 'circular';
}

/**
 * ロードマップ生成パラメータ
 */
export interface RoadmapGenerationParams {
  /** 学習分野 */
  subject: string;
  /** 学習目標 */
  goal: string;
  /** 発見フェーズの回答 */
  discoveryResponses: Array<{
    question: string;
    answer: string;
  }>;
  /** 評価フェーズの結果 */
  assessmentResults: Array<{
    question: string;
    answer: string;
    isCorrect: boolean;
  }>;
  /** ユーザーレベル */
  userLevel: 'beginner' | 'intermediate' | 'advanced';
  /** 希望する学習期間 */
  desiredDuration?: string;
  /** 学習スタイル */
  learningStyle?: string;
}

/**
 * ロードマップの表示設定
 */
export interface RoadmapDisplayConfig {
  /** 現在選択中のノードID */
  selectedNodeId?: string;
  /** 表示モード */
  displayMode: 'full' | 'compact' | 'progress';
  /** アニメーションを有効にするか */
  enableAnimation: boolean;
  /** 色のテーマ */
  colorTheme: 'default' | 'high-contrast' | 'minimal';
  /** インタラクティブモード */
  interactive: boolean;
}

/**
 * ノードの選択イベント
 */
export interface NodeSelectionEvent {
  /** 選択されたノードID */
  nodeId: string;
  /** イベントタイプ */
  type: 'select' | 'hover' | 'activate';
  /** タイムスタンプ */
  timestamp: Date;
}