/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useEffect } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import type { 
  LearningRoadmap, 
  LearningNode, 
  NodeStatus,
  RoadmapDisplayConfig 
} from '../../types/roadmap.js';
import { GraphLayoutEngine } from '../../utils/graphLayout.js';

interface RoadmapDisplayProps {
  /** 表示するロードマップ */
  roadmap: LearningRoadmap;
  /** 表示設定 */
  config?: Partial<RoadmapDisplayConfig>;
  /** ノード選択時のコールバック */
  onNodeSelect?: (nodeId: string) => void;
  /** 閉じるコールバック */
  onClose?: () => void;
}

/**
 * ロードマップをグラフ形式で表示するコンポーネント
 */
export const RoadmapDisplay: React.FC<RoadmapDisplayProps> = ({
  roadmap,
  config,
  onNodeSelect,
  onClose,
}) => {
  const { exit } = useApp();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(
    config?.selectedNodeId || null
  );
  const [showHelp, setShowHelp] = useState(false);

  // グラフレイアウトを計算
  const { positions, bounds, nodeGrid } = useMemo(() => {
    const layoutEngine = new GraphLayoutEngine(roadmap.nodes, roadmap.edges);
    const calculatedPositions = layoutEngine.calculateLayout();
    const calculatedBounds = layoutEngine.getBounds(calculatedPositions);
    
    // グリッドベースの表示用にポジションを調整
    const grid = createNodeGrid(roadmap.nodes, calculatedPositions, calculatedBounds);
    
    return {
      positions: calculatedPositions,
      bounds: calculatedBounds,
      nodeGrid: grid,
    };
  }, [roadmap]);

  // キーボード入力の処理
  useInput((input, key) => {
    if (input === 'q' || key.escape) {
      onClose?.();
      return;
    }

    if (input === 'h') {
      setShowHelp(!showHelp);
      return;
    }

    if (key.return && selectedNodeId) {
      onNodeSelect?.(selectedNodeId);
      return;
    }

    // 矢印キーでノード選択を移動
    if (key.upArrow || key.downArrow || key.leftArrow || key.rightArrow) {
      navigateNodes(key);
    }
  });

  // ノード間のナビゲーション
  const navigateNodes = (key: any) => {
    if (!selectedNodeId) {
      // 最初のノードを選択
      const firstNode = Array.from(roadmap.nodes.keys())[0];
      setSelectedNodeId(firstNode);
      return;
    }

    const currentPos = positions.get(selectedNodeId);
    if (!currentPos) return;

    let nextNodeId: string | null = null;
    let minDistance = Infinity;

    // 方向に基づいて最も近いノードを探す
    roadmap.nodes.forEach((node, nodeId) => {
      if (nodeId === selectedNodeId) return;
      
      const pos = positions.get(nodeId);
      if (!pos) return;

      const dx = pos.x - currentPos.x;
      const dy = pos.y - currentPos.y;

      let isCandidate = false;
      if (key.upArrow && dy < 0) isCandidate = true;
      if (key.downArrow && dy > 0) isCandidate = true;
      if (key.leftArrow && dx < 0) isCandidate = true;
      if (key.rightArrow && dx > 0) isCandidate = true;

      if (isCandidate) {
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < minDistance) {
          minDistance = distance;
          nextNodeId = nodeId;
        }
      }
    });

    if (nextNodeId) {
      setSelectedNodeId(nextNodeId);
    }
  };

  // 最初の利用可能なノードを選択
  useEffect(() => {
    if (!selectedNodeId) {
      const availableNode = Array.from(roadmap.nodes.entries()).find(
        ([_, node]) => node.status === 'available' || node.status === 'in-progress'
      );
      if (availableNode) {
        setSelectedNodeId(availableNode[0]);
      }
    }
  }, [roadmap, selectedNodeId]);

  if (showHelp) {
    return <HelpScreen onClose={() => setShowHelp(false)} />;
  }

  return (
    <Box flexDirection="column" width="100%">
      {/* ヘッダー */}
      <Box marginBottom={1}>
        <Text bold color="cyan">
          📚 {roadmap.subject} - 学習ロードマップ
        </Text>
      </Box>

      {/* グラフ表示エリア */}
      <Box 
        flexDirection="column" 
        borderStyle="round" 
        borderColor="gray"
        paddingX={2}
        paddingY={1}
      >
        {nodeGrid.map((row, rowIndex) => (
          <Box key={rowIndex} flexDirection="row">
            {row.map((cell, colIndex) => (
              <Box key={`${rowIndex}-${colIndex}`} width={18} height={5}>
                {cell.type === 'node' && cell.nodeId && (
                  <NodeBox
                    node={roadmap.nodes.get(cell.nodeId)!}
                    isSelected={selectedNodeId === cell.nodeId}
                    roadmap={roadmap}
                  />
                )}
                {cell.type === 'edge' && (
                  <EdgeRenderer 
                    direction={cell.direction as 'horizontal' | 'vertical' | 'corner' | 'junction'}
                    edgeType={cell.edgeType as 'prerequisite' | 'recommended' | 'optional'}
                  />
                )}
                {cell.type === 'empty' && <Box />}
              </Box>
            ))}
          </Box>
        ))}
      </Box>

      {/* フッター情報 */}
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text dimColor>
            進捗: {roadmap.metadata.completedNodes}/{roadmap.metadata.totalNodes} ノード完了
          </Text>
          <Text dimColor> | </Text>
          <Text dimColor>
            推定残り時間: {roadmap.metadata.totalEstimatedTime}
          </Text>
        </Box>
        
        <Box marginTop={1}>
          <Text dimColor>
            操作: ↑↓←→ 移動 | Enter 詳細 | h ヘルプ | q 終了
          </Text>
        </Box>
      </Box>

      {/* 選択中のノードの詳細 */}
      {selectedNodeId && (
        <NodeDetail 
          node={roadmap.nodes.get(selectedNodeId)!}
          roadmap={roadmap}
        />
      )}
    </Box>
  );
};

/**
 * ノードボックスの表示
 */
const NodeBox: React.FC<{
  node: LearningNode;
  isSelected: boolean;
  roadmap: LearningRoadmap;
}> = ({ node, isSelected, roadmap }) => {
  const statusColors: Record<NodeStatus, string> = {
    'locked': 'gray',
    'available': 'yellow',
    'in-progress': 'cyan',
    'completed': 'green',
  };

  const statusIcons: Record<NodeStatus, string> = {
    'locked': '🔒',
    'available': '📖',
    'in-progress': '⏳',
    'completed': '✅',
  };

  const borderStyle = isSelected ? 'double' : 'single';
  const borderColor = isSelected ? 'cyan' : statusColors[node.status];

  return (
    <Box
      borderStyle={borderStyle}
      borderColor={borderColor}
      paddingX={1}
      flexDirection="column"
      width={16}
      height={3}
    >
      <Box>
        <Text>{statusIcons[node.status]} </Text>
        <Text color={statusColors[node.status]} wrap="truncate">
          {node.title}
        </Text>
      </Box>
      <Text dimColor wrap="truncate">
        {node.estimatedTime}
      </Text>
    </Box>
  );
};

/**
 * エッジの描画
 */
const EdgeRenderer: React.FC<{
  direction?: 'horizontal' | 'vertical' | 'corner' | 'junction';
  edgeType?: 'prerequisite' | 'recommended' | 'optional';
}> = ({ direction = 'horizontal', edgeType = 'prerequisite' }) => {
  const edgeChars = {
    horizontal: '─',
    vertical: '│',
    corner: '└',
    junction: '┼',
  };

  const edgeStyles = {
    prerequisite: { color: 'white', dimColor: false },
    recommended: { color: 'yellow', dimColor: true },
    optional: { color: 'gray', dimColor: true },
  };

  const char = edgeChars[direction];
  const style = edgeStyles[edgeType];

  return (
    <Box justifyContent="center" alignItems="center" width={18} height={5}>
      <Text color={style.color} dimColor={style.dimColor}>
        {char.repeat(direction === 'horizontal' ? 10 : 1)}
      </Text>
    </Box>
  );
};

/**
 * ノードの詳細表示
 */
const NodeDetail: React.FC<{
  node: LearningNode;
  roadmap: LearningRoadmap;
}> = ({ node, roadmap }) => {
  return (
    <Box
      marginTop={1}
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      paddingY={1}
      flexDirection="column"
    >
      <Text bold color="cyan">{node.title}</Text>
      <Text>{node.description}</Text>
      
      {node.prerequisites.length > 0 && (
        <Box marginTop={1}>
          <Text dimColor>前提条件: </Text>
          {node.prerequisites.map(prereqId => {
            const prereqNode = roadmap.nodes.get(prereqId);
            return prereqNode ? (
              <Text key={prereqId} color="yellow">
                {prereqNode.title}{' '}
              </Text>
            ) : null;
          })}
        </Box>
      )}

      {node.concepts && node.concepts.length > 0 && (
        <Box marginTop={1}>
          <Text dimColor>学習内容: </Text>
          <Text>{node.concepts.join(', ')}</Text>
        </Box>
      )}
    </Box>
  );
};

/**
 * ヘルプ画面
 */
const HelpScreen: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  useInput((input) => {
    if (input === 'h' || input === 'q') {
      onClose();
    }
  });

  return (
    <Box 
      flexDirection="column" 
      borderStyle="round" 
      borderColor="cyan"
      paddingX={2}
      paddingY={1}
    >
      <Text bold color="cyan">🎯 ロードマップの操作方法</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>↑↓←→  : ノード間を移動</Text>
        <Text>Enter  : 選択中のノードの詳細を表示</Text>
        <Text>h      : このヘルプを表示/非表示</Text>
        <Text>q      : ロードマップを閉じる</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold color="yellow">ノードの状態:</Text>
        <Text>🔒 灰色  : ロック中（前提条件未達成）</Text>
        <Text>📖 黄色  : 学習可能</Text>
        <Text>⏳ 水色  : 学習中</Text>
        <Text>✅ 緑色  : 完了</Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>任意のキーを押してヘルプを閉じる</Text>
      </Box>
    </Box>
  );
};

/**
 * グリッドベースの表示用にノードを配置
 */
function createNodeGrid(
  nodes: Map<string, LearningNode>,
  positions: Map<string, any>,
  bounds: any
): Array<Array<{ type: 'node' | 'edge' | 'empty'; nodeId?: string; direction?: string; edgeType?: string }>> {
  // 簡易実装：実際のグラフ描画は複雑なため、基本的な配置のみ
  const grid: any[][] = [];
  const maxDepth = Math.max(...Array.from(nodes.values()).map(n => n.depth));
  
  for (let depth = 0; depth <= maxDepth; depth++) {
    const row: any[] = [];
    const nodesAtDepth = Array.from(nodes.entries())
      .filter(([_, node]) => node.depth === depth)
      .map(([id, _]) => id);
    
    nodesAtDepth.forEach((nodeId, index) => {
      if (index > 0) {
        row.push({ type: 'empty' });
      }
      row.push({ type: 'node', nodeId });
    });
    
    grid.push(row);
    
    // エッジ行を追加（最後の行以外）
    if (depth < maxDepth) {
      const edgeRow = row.map(() => ({ type: 'edge', direction: 'vertical' }));
      grid.push(edgeRow);
    }
  }
  
  return grid;
}