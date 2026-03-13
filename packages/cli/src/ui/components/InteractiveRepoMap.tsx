/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useReducer, useMemo } from 'react';
import { Box, Text } from 'ink';
import type { RepoTreeNode } from '@google/gemini-cli-core';
import { useKeypress, type Key } from '../hooks/useKeypress.js';
import { Command } from '../key/keyMatchers.js';
import { useKeyMatchers } from '../hooks/useKeyMatchers.js';
import { useUIState } from '../contexts/UIStateContext.js';

interface FlatNode {
  node: RepoTreeNode;
  path: string;
  depth: number;
  prefix: string;
  hasChildren: boolean;
}

function getVisibleNodes(
  root: RepoTreeNode,
  expandedPaths: Set<string>,
): FlatNode[] {
  const visible: FlatNode[] = [];

  function traverse(
    node: RepoTreeNode,
    currentPath: string,
    depth: number,
    prefixes: string[],
    isLastSibling: boolean,
  ) {
    const hasChildren = !!node.children && node.children.length > 0;

    let prefix = '';
    if (depth > 0) {
      prefix = prefixes.join('') + (isLastSibling ? '└── ' : '├── ');
    }

    visible.push({
      node,
      path: currentPath,
      depth,
      prefix,
      hasChildren,
    });

    if (hasChildren && expandedPaths.has(currentPath)) {
      const nextPrefixes = [...prefixes];
      if (depth > 0) {
        nextPrefixes.push(isLastSibling ? '    ' : '│   ');
      }
      node.children!.forEach((child, index) => {
        const isLast = index === node.children!.length - 1;
        const childPath = `${currentPath}/${child.name}`;
        traverse(child, childPath, depth + 1, nextPrefixes, isLast);
      });
    }
  }

  traverse(root, root.name, 0, [], true);
  return visible;
}

interface RepoMapState {
  expandedPaths: Set<string>;
  activeIndex: number;
}

type RepoMapAction =
  | { type: 'NAVIGATE_UP' }
  | { type: 'NAVIGATE_DOWN'; maxIndex: number }
  | { type: 'TOGGLE_EXPAND'; path: string; hasChildren: boolean }
  | { type: 'EXPAND'; path: string; hasChildren: boolean }
  | { type: 'COLLAPSE'; path: string; hasChildren: boolean }
  | { type: 'SET_INDEX'; index: number };

function repoMapReducer(state: RepoMapState, action: RepoMapAction): RepoMapState {
  switch (action.type) {
    case 'NAVIGATE_UP':
      return { ...state, activeIndex: Math.max(0, state.activeIndex - 1) };
    case 'NAVIGATE_DOWN':
      return { ...state, activeIndex: Math.min(action.maxIndex, state.activeIndex + 1) };
    case 'TOGGLE_EXPAND': {
      if (!action.hasChildren) return state;
      const next = new Set(state.expandedPaths);
      if (next.has(action.path)) {
        next.delete(action.path);
      } else {
        next.add(action.path);
      }
      return { ...state, expandedPaths: next };
    }
    case 'EXPAND': {
      if (!action.hasChildren || state.expandedPaths.has(action.path)) return state;
      const next = new Set(state.expandedPaths);
      next.add(action.path);
      return { ...state, expandedPaths: next };
    }
    case 'COLLAPSE': {
      if (!action.hasChildren || !state.expandedPaths.has(action.path)) return state;
      const next = new Set(state.expandedPaths);
      next.delete(action.path);
      return { ...state, expandedPaths: next };
    }
    case 'SET_INDEX':
      return { ...state, activeIndex: action.index };
    default:
      return state;
  }
}

export interface InteractiveRepoMapProps {
  tree: RepoTreeNode;
  onClose: () => void;
}

export const InteractiveRepoMap = ({
  tree,
  onClose,
}: InteractiveRepoMapProps) => {
  const keyMatchers = useKeyMatchers();
  const { terminalHeight, staticExtraHeight } = useUIState();

  const [state, dispatch] = useReducer(repoMapReducer, {
    expandedPaths: new Set([tree.name]),
    activeIndex: 0,
  });

  const visibleNodes = useMemo(
    () => getVisibleNodes(tree, state.expandedPaths),
    [tree, state.expandedPaths],
  );

  useKeypress(
    (key: Key) => {
      if (keyMatchers[Command.DIALOG_NAVIGATION_UP](key)) {
        dispatch({ type: 'NAVIGATE_UP' });
        return true;
      }
      if (keyMatchers[Command.DIALOG_NAVIGATION_DOWN](key)) {
        dispatch({ type: 'NAVIGATE_DOWN', maxIndex: visibleNodes.length - 1 });
        return true;
      }
      if (key.name === 'left') {
        const activeNode = visibleNodes[state.activeIndex];
        if (
          activeNode?.hasChildren &&
          state.expandedPaths.has(activeNode.path)
        ) {
          dispatch({
            type: 'COLLAPSE',
            path: activeNode.path,
            hasChildren: true,
          });
        } else if (activeNode && activeNode.depth > 0) {
          const parts = activeNode.path.split('/');
          parts.pop();
          const parentPath = parts.join('/');
          const parentIndex = visibleNodes.findIndex(
            (n) => n.path === parentPath,
          );
          if (parentIndex !== -1) {
            dispatch({ type: 'SET_INDEX', index: parentIndex });
          }
        }
        return true;
      }
      if (key.name === 'right') {
        const activeNode = visibleNodes[state.activeIndex];
        if (
          activeNode?.hasChildren &&
          !state.expandedPaths.has(activeNode.path)
        ) {
          dispatch({
            type: 'EXPAND',
            path: activeNode.path,
            hasChildren: true,
          });
        }
        return true;
      }
      if (keyMatchers[Command.RETURN](key)) {
        const activeNode = visibleNodes[state.activeIndex];
        if (activeNode) {
          dispatch({
            type: 'TOGGLE_EXPAND',
            path: activeNode.path,
            hasChildren: activeNode.hasChildren,
          });
        }
        return true;
      }
      if (keyMatchers[Command.ESCAPE](key) || key.sequence === 'q') {
        onClose();
        return true;
      }
      return false;
    },
    { isActive: true },
  );

  const { activeIndex, expandedPaths } = state;

  // Compute a slice of visible nodes to fit within the terminal height
  // taking into account the space consumed by other CLI UI elements (staticExtraHeight)
  // and the padding/borders of this component itself (we subtract 6 total lines).
  const safeAvailableHeight = terminalHeight - staticExtraHeight;
  const maxVisibleCount = Math.max(5, safeAvailableHeight - 6);
  let startIndex = 0;
  if (activeIndex >= maxVisibleCount) {
    startIndex = activeIndex - maxVisibleCount + 1;
  }
  const renderedNodes = visibleNodes.slice(
    startIndex,
    startIndex + maxVisibleCount,
  );

  return (
    <Box
      flexDirection="column"
      paddingY={1}
      paddingX={2}
      borderStyle="round"
      borderColor="blue"
    >
      <Box marginBottom={1}>
        <Text bold>Interactive Repository Map</Text>
        <Text color="gray">
          {' '}
          (↑/↓ to move, ←/→ to collapse/expand, Enter to toggle, q to close)
        </Text>
      </Box>
      <Box flexDirection="column">
        {renderedNodes.map((item, index) => {
          const actualIndex = startIndex + index;
          const isSelected = actualIndex === activeIndex;
          const isExpanded = expandedPaths.has(item.path);
          const icon = item.hasChildren ? (isExpanded ? '▾ ' : '▸ ') : '  ';

          return (
            <Box key={item.path}>
              <Text color={isSelected ? 'green' : 'gray'}>
                {isSelected ? '> ' : '  '}
              </Text>
              <Text color="gray">{item.prefix}</Text>
              <Text
                color={
                  isSelected
                    ? 'green'
                    : item.node.isDirectory
                      ? 'blue'
                      : undefined
                }
                bold={item.node.isDirectory}
              >
                {icon}
                {item.node.name}
                {item.node.isDirectory ? '/' : ''}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
};
