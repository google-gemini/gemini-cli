/**
 * FileTree — Collapsible local directory tree using the fs:list-directory IPC channel.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Folder, FolderOpen, FileText } from 'lucide-react';
import type { DirEntry } from '../types.js';

interface TreeNode extends DirEntry {
  children?: TreeNode[];
  loading?: boolean;
  expanded?: boolean;
}

interface Props {
  root: string;
}

export function FileTree({ root }: Props) {
  const [nodes, setNodes] = useState<TreeNode[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadDir = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    const result = await window.cowork.listDirectory(dirPath);
    if (result.error) throw new Error(result.error);
    return (result.entries ?? []).map((e) => ({
      ...e,
      children: e.isDirectory ? undefined : [],
      expanded: false,
      loading: false,
    }));
  }, []);

  useEffect(() => {
    loadDir(root)
      .then(setNodes)
      .catch((e) => setError(e.message));
  }, [root, loadDir]);

  const toggle = useCallback(
    async (node: TreeNode, path: (number | string)[]) => {
      if (!node.isDirectory) return;

      setNodes((prev) => updateNode(prev, path, (n) => ({ ...n, loading: true })));

      try {
        const children = await loadDir(node.path);
        setNodes((prev) =>
          updateNode(prev, path, (n) => ({
            ...n,
            children,
            expanded: !n.expanded,
            loading: false,
          })),
        );
      } catch {
        setNodes((prev) => updateNode(prev, path, (n) => ({ ...n, loading: false })));
      }
    },
    [loadDir],
  );

  if (error) {
    return <p className="text-xs text-danger px-3 py-2">{error}</p>;
  }

  return (
    <div className="flex-1 overflow-y-auto py-1 text-xs">
      {nodes.map((node, i) => (
        <TreeNodeRow
          key={node.path}
          node={node}
          depth={0}
          path={[i]}
          onToggle={toggle}
        />
      ))}
    </div>
  );
}

function TreeNodeRow({
  node,
  depth,
  path,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  path: (number | string)[];
  onToggle: (node: TreeNode, path: (number | string)[]) => void;
}) {
  const indent = depth * 12 + 8;

  return (
    <>
      <button
        className="w-full flex items-center gap-1.5 px-2 py-0.5 rounded
                   hover:bg-surface-700 transition-colors text-left text-surface-300
                   hover:text-surface-100"
        style={{ paddingLeft: `${indent}px` }}
        onClick={() => onToggle(node, path)}
      >
        {/* Expand/collapse icon */}
        {node.isDirectory ? (
          node.loading ? (
            <span className="w-3 h-3 animate-spin text-surface-500">⟳</span>
          ) : node.expanded ? (
            <ChevronDown size={12} className="text-surface-500 flex-shrink-0" />
          ) : (
            <ChevronRight size={12} className="text-surface-500 flex-shrink-0" />
          )
        ) : (
          <span className="w-3" />
        )}

        {/* File/folder icon */}
        {node.isDirectory ? (
          node.expanded ? (
            <FolderOpen size={13} className="text-aistudio-400 flex-shrink-0" />
          ) : (
            <Folder size={13} className="text-aistudio-500 flex-shrink-0" />
          )
        ) : (
          <FileText size={12} className="text-surface-500 flex-shrink-0" />
        )}

        <span className="truncate">{node.name}</span>
      </button>

      {/* Children */}
      {node.isDirectory && node.expanded && node.children && (
        <div>
          {node.children.map((child, i) => (
            <TreeNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              path={[...path, i]}
              onToggle={onToggle}
            />
          ))}
          {node.children.length === 0 && (
            <p
              className="text-surface-500 text-[10px] italic"
              style={{ paddingLeft: `${indent + 24}px` }}
            >
              empty
            </p>
          )}
        </div>
      )}
    </>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function updateNode(
  nodes: TreeNode[],
  path: (number | string)[],
  updater: (n: TreeNode) => TreeNode,
): TreeNode[] {
  if (path.length === 0) return nodes;
  const [head, ...tail] = path;
  return nodes.map((n, i) => {
    if (i !== head) return n;
    if (tail.length === 0) return updater(n);
    return { ...n, children: updateNode(n.children ?? [], tail, updater) };
  });
}
