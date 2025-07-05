/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type { LearningNode, LearningEdge, NodePosition } from '../types/roadmap.js';

/**
 * グラフレイアウトアルゴリズム
 * DAG（有向非巡回グラフ）を階層的にレイアウトする
 */
export class GraphLayoutEngine {
  private nodes: Map<string, LearningNode>;
  private edges: LearningEdge[];
  private config: {
    horizontalSpacing: number;
    verticalSpacing: number;
    nodeWidth: number;
    nodeHeight: number;
  };

  constructor(
    nodes: Map<string, LearningNode>,
    edges: LearningEdge[],
    config?: {
      horizontalSpacing?: number;
      verticalSpacing?: number;
      nodeWidth?: number;
      nodeHeight?: number;
    }
  ) {
    this.nodes = nodes;
    this.edges = edges;
    this.config = {
      horizontalSpacing: config?.horizontalSpacing ?? 4,
      verticalSpacing: config?.verticalSpacing ?? 3,
      nodeWidth: config?.nodeWidth ?? 15,
      nodeHeight: config?.nodeHeight ?? 4,
    };
  }

  /**
   * グラフのレイアウトを計算
   */
  calculateLayout(): Map<string, NodePosition> {
    const positions = new Map<string, NodePosition>();
    
    // 1. トポロジカルソートでノードの順序を決定
    const sortedNodes = this.topologicalSort();
    
    // 2. 各ノードの深さ（レベル）を計算
    const depths = this.calculateDepths(sortedNodes);
    
    // 3. 同じ深さのノードをグループ化
    const levelGroups = this.groupByDepth(depths);
    
    // 4. 各レベルでノードを配置
    this.assignPositions(levelGroups, positions);
    
    // 5. エッジの交差を最小化するための微調整
    this.minimizeCrossings(positions, levelGroups);
    
    return positions;
  }

  /**
   * トポロジカルソート
   */
  private topologicalSort(): string[] {
    const visited = new Set<string>();
    const result: string[] = [];
    const inDegree = new Map<string, number>();
    
    // 入次数を計算
    this.nodes.forEach((_, nodeId) => {
      inDegree.set(nodeId, 0);
    });
    
    this.edges.forEach(edge => {
      if (edge.type === 'prerequisite') {
        inDegree.set(edge.to, (inDegree.get(edge.to) || 0) + 1);
      }
    });
    
    // 入次数0のノードから開始
    const queue: string[] = [];
    inDegree.forEach((degree, nodeId) => {
      if (degree === 0) {
        queue.push(nodeId);
      }
    });
    
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      result.push(nodeId);
      visited.add(nodeId);
      
      // 隣接ノードの入次数を減らす
      this.edges.forEach(edge => {
        if (edge.from === nodeId && edge.type === 'prerequisite') {
          const newDegree = (inDegree.get(edge.to) || 0) - 1;
          inDegree.set(edge.to, newDegree);
          
          if (newDegree === 0 && !visited.has(edge.to)) {
            queue.push(edge.to);
          }
        }
      });
    }
    
    return result;
  }

  /**
   * 各ノードの深さを計算
   */
  private calculateDepths(sortedNodes: string[]): Map<string, number> {
    const depths = new Map<string, number>();
    
    // 初期化
    sortedNodes.forEach(nodeId => {
      depths.set(nodeId, 0);
    });
    
    // 各ノードの深さを計算
    sortedNodes.forEach(nodeId => {
      const currentDepth = depths.get(nodeId) || 0;
      
      // 後続ノードの深さを更新
      this.edges.forEach(edge => {
        if (edge.from === nodeId && edge.type === 'prerequisite') {
          const successorDepth = depths.get(edge.to) || 0;
          depths.set(edge.to, Math.max(successorDepth, currentDepth + 1));
        }
      });
    });
    
    return depths;
  }

  /**
   * 深さごとにノードをグループ化
   */
  private groupByDepth(depths: Map<string, number>): Map<number, string[]> {
    const groups = new Map<number, string[]>();
    
    depths.forEach((depth, nodeId) => {
      if (!groups.has(depth)) {
        groups.set(depth, []);
      }
      groups.get(depth)!.push(nodeId);
    });
    
    return groups;
  }

  /**
   * ノードに位置を割り当て
   */
  private assignPositions(
    levelGroups: Map<number, string[]>,
    positions: Map<string, NodePosition>
  ): void {
    let currentY = 0;
    
    // 各レベルのノードを配置
    const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);
    
    sortedLevels.forEach(level => {
      const nodesAtLevel = levelGroups.get(level) || [];
      const totalWidth = nodesAtLevel.length * (this.config.nodeWidth + this.config.horizontalSpacing);
      let currentX = -Math.floor(totalWidth / 2);
      
      nodesAtLevel.forEach(nodeId => {
        positions.set(nodeId, {
          x: currentX,
          y: currentY,
          layoutHint: this.determineLayoutHint(nodeId, nodesAtLevel),
        });
        
        currentX += this.config.nodeWidth + this.config.horizontalSpacing;
      });
      
      currentY += this.config.nodeHeight + this.config.verticalSpacing;
    });
  }

  /**
   * レイアウトヒントを決定
   */
  private determineLayoutHint(nodeId: string, nodesAtLevel: string[]): 'center' | 'left' | 'right' {
    const index = nodesAtLevel.indexOf(nodeId);
    const total = nodesAtLevel.length;
    
    if (total === 1) return 'center';
    if (index === 0) return 'left';
    if (index === total - 1) return 'right';
    return 'center';
  }

  /**
   * エッジの交差を最小化
   */
  private minimizeCrossings(
    positions: Map<string, NodePosition>,
    levelGroups: Map<number, string[]>
  ): void {
    const sortedLevels = Array.from(levelGroups.keys()).sort((a, b) => a - b);
    
    // 各レベルペアで交差を最小化
    for (let i = 0; i < sortedLevels.length - 1; i++) {
      const currentLevel = sortedLevels[i];
      const nextLevel = sortedLevels[i + 1];
      
      const currentNodes = levelGroups.get(currentLevel) || [];
      const nextNodes = levelGroups.get(nextLevel) || [];
      
      // バリセンターヒューリスティックを使用
      this.applyBarycenterHeuristic(currentNodes, nextNodes, positions);
    }
  }

  /**
   * バリセンターヒューリスティック
   * 親ノードの重心に基づいて子ノードを並べ替える
   */
  private applyBarycenterHeuristic(
    parentNodes: string[],
    childNodes: string[],
    positions: Map<string, NodePosition>
  ): void {
    // 各子ノードのバリセンター（重心）を計算
    const barycenters = new Map<string, number>();
    
    childNodes.forEach(childId => {
      const parents = this.getParents(childId);
      if (parents.length > 0) {
        const sumX = parents.reduce((sum, parentId) => {
          const pos = positions.get(parentId);
          return sum + (pos?.x || 0);
        }, 0);
        barycenters.set(childId, sumX / parents.length);
      } else {
        barycenters.set(childId, 0);
      }
    });
    
    // バリセンターに基づいて子ノードをソート
    childNodes.sort((a, b) => {
      const barycenterA = barycenters.get(a) || 0;
      const barycenterB = barycenters.get(b) || 0;
      return barycenterA - barycenterB;
    });
    
    // 新しい順序で位置を再割り当て
    const baseY = positions.get(childNodes[0])?.y || 0;
    const totalWidth = childNodes.length * (this.config.nodeWidth + this.config.horizontalSpacing);
    let currentX = -Math.floor(totalWidth / 2);
    
    childNodes.forEach(nodeId => {
      const pos = positions.get(nodeId);
      if (pos) {
        pos.x = currentX;
        positions.set(nodeId, pos);
      }
      currentX += this.config.nodeWidth + this.config.horizontalSpacing;
    });
  }

  /**
   * ノードの親を取得
   */
  private getParents(nodeId: string): string[] {
    const parents: string[] = [];
    
    this.edges.forEach(edge => {
      if (edge.to === nodeId && edge.type === 'prerequisite') {
        parents.push(edge.from);
      }
    });
    
    return parents;
  }

  /**
   * グラフの境界を計算
   */
  getBounds(positions: Map<string, NodePosition>): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    width: number;
    height: number;
  } {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    
    positions.forEach(pos => {
      minX = Math.min(minX, pos.x);
      maxX = Math.max(maxX, pos.x + this.config.nodeWidth);
      minY = Math.min(minY, pos.y);
      maxY = Math.max(maxY, pos.y + this.config.nodeHeight);
    });
    
    return {
      minX,
      maxX,
      minY,
      maxY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }
}