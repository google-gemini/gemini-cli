/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DiagramNode {
  id: string;
  label: string;
  shape: 'rect' | 'diamond' | 'rounded' | 'circle' | 'stadium';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DiagramEdge {
  source: string;
  target: string;
  label?: string;
  style: 'solid' | 'dotted' | 'thick';
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  points?: Array<{ x: number; y: number }>;
}

export type StructureType =
  | 'linked-list'
  | 'doubly-linked-list'
  | 'binary-tree'
  | 'stack'
  | 'queue'
  | 'graph'
  | 'flowchart';

export interface DiagramData {
  isDiagram: true;
  diagramType: 'flowchart' | 'sequence' | 'class' | 'er' | 'gantt' | 'git';
  direction?: 'TD' | 'LR' | 'RL' | 'BT';
  structure?: StructureType;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  title?: string;
  raw?: string;
}

export interface BrowserPreview {
  isBrowserPreview: true;
  imagePath: string;
  title?: string;
}

export function isDiagramData(obj: unknown): obj is DiagramData {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  return 'isDiagram' in obj && obj.isDiagram === true;
}

export function isBrowserPreview(obj: unknown): obj is BrowserPreview {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }
  return 'isBrowserPreview' in obj && obj.isBrowserPreview === true;
}

export interface VisualizeToolParams {
  type: 'mermaid' | 'html_preview';
  content?: string;
  html?: string;
  title?: string;
  structure?: StructureType;
}
