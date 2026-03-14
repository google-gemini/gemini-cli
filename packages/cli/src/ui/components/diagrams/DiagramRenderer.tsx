/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import type { DiagramData } from '@google/gemini-cli-core';
import { FlowchartRenderer } from './FlowchartRenderer.js';

interface DiagramRendererProps {
  diagram: DiagramData;
  terminalWidth: number;
}

export const DiagramRenderer: React.FC<DiagramRendererProps> = ({
  diagram,
  terminalWidth,
}) => <FlowchartRenderer diagram={diagram} terminalWidth={terminalWidth} />;
