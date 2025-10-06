/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Hammer, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/utils/cn';
import { CodeHighlight } from '@/components/ui/CodeHighlight';
import { MarkdownRenderer } from './MarkdownRenderer';
import { SmartVisualization } from '@/components/charts/SmartVisualization';
import type { ToolCall, ToolResponseData } from '@/types';

interface ToolExecutionPair {
  toolCall: ToolCall;
  toolResponse?: {
    content: string;
    success?: boolean;
    toolResponseData?: ToolResponseData;
    timestamp?: Date;
  };
}

interface ToolExecutionGroupProps {
  executions: ToolExecutionPair[];
  timestamp?: Date;
}

/**
 * Displays a group of tool executions (call + response pairs) in a compact, collapsible format.
 * Optimized to reduce vertical space while maintaining readability.
 */
export const ToolExecutionGroup: React.FC<ToolExecutionGroupProps> = ({ executions, timestamp }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set([0])); // First item expanded by default

  if (executions.length === 0) return null;

  const toggleItemExpanded = (index: number) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const allCompleted = executions.every(exec => exec.toolResponse !== undefined);
  const hasFailures = executions.some(exec => exec.toolResponse?.success === false);

  // Single execution - show in expanded format by default
  if (executions.length === 1) {
    const execution = executions[0];
    return (
      <ToolExecutionCard
        execution={execution}
        isExpanded={expandedItems.has(0)}
        onToggle={() => toggleItemExpanded(0)}
        timestamp={timestamp || execution.toolResponse?.timestamp}
      />
    );
  }

  // Multiple executions - show grouped with summary
  return (
    <div className="space-y-2">
      {/* Group header with summary */}
      <div className="bg-muted/30 rounded-lg border border-border/50 overflow-hidden">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <Hammer size={16} className="text-primary" />
            </div>
            <span className="text-sm font-medium">
              {executions.length} Tool Execution{executions.length > 1 ? 's' : ''}
            </span>
            {allCompleted && (
              <span className={cn(
                "text-xs font-medium flex items-center gap-1",
                hasFailures ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"
              )}>
                {hasFailures ? (
                  <>
                    <XCircle size={12} />
                    Some failed
                  </>
                ) : (
                  <>
                    <CheckCircle2 size={12} />
                    All completed
                  </>
                )}
              </span>
            )}
            {!allCompleted && (
              <span className="text-xs font-medium flex items-center gap-1 text-blue-600 dark:text-blue-400">
                <Clock size={12} />
                In progress
              </span>
            )}
          </div>
          {timestamp && (
            <time
              dateTime={timestamp.toISOString()}
              className="text-xs text-muted-foreground"
              title={format(timestamp, 'yyyy-MM-dd HH:mm:ss')}
            >
              {format(timestamp, 'HH:mm')}
            </time>
          )}
        </button>

        {/* Expanded group content */}
        {isExpanded && (
          <div className="border-t border-border/30 bg-background/50 p-3 space-y-2">
            {executions.map((execution, index) => (
              <ToolExecutionCard
                key={index}
                execution={execution}
                isExpanded={expandedItems.has(index)}
                onToggle={() => toggleItemExpanded(index)}
                isNested
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

interface ToolExecutionCardProps {
  execution: ToolExecutionPair;
  isExpanded: boolean;
  onToggle: () => void;
  timestamp?: Date;
  isNested?: boolean;
}

const ToolExecutionCard: React.FC<ToolExecutionCardProps> = ({
  execution,
  isExpanded,
  onToggle,
  timestamp,
  isNested = false
}) => {
  const { toolCall, toolResponse } = execution;

  const getStatusIcon = () => {
    if (!toolResponse) {
      return <Clock size={14} className="text-blue-600 dark:text-blue-400" />;
    }
    if (toolResponse.success === false) {
      return <XCircle size={14} className="text-red-600 dark:text-red-400" />;
    }
    return <CheckCircle2 size={14} className="text-green-600 dark:text-green-400" />;
  };

  const getStatusText = () => {
    if (!toolResponse) return "Executing...";
    if (toolResponse.success === false) return "Failed";
    return "Success";
  };

  const operation = (toolCall.arguments as Record<string, unknown>)?.op ||
                    (toolCall.arguments as Record<string, unknown>)?.operation;

  const formatValueForDisplay = (value: unknown): string => {
    if (typeof value === 'string') {
      return value.length > 40 ? `"${value.slice(0, 37)}..."` : `"${value}"`;
    }
    if (Array.isArray(value)) {
      if (value.length > 3) {
        return `[${value.slice(0, 3).map(v => typeof v === 'string' ? `"${v}"` : String(v)).join(', ')}, ...] (${value.length} items)`;
      }
      return JSON.stringify(value);
    }
    if (typeof value === 'object' && value !== null) {
      const keys = Object.keys(value);
      if (keys.length > 2) {
        return `{${keys.slice(0, 2).join(', ')}, ...} (${keys.length} props)`;
      }
      return JSON.stringify(value);
    }
    return String(value);
  };

  const getKeyParameters = () => {
    const args = toolCall.arguments || {};
    const entries = Object.entries(args);
    const priorityKeys = ['op', 'operation', 'range', 'workbook', 'worksheet', 'data'];
    return entries.sort(([a], [b]) => {
      const aIndex = priorityKeys.indexOf(a);
      const bIndex = priorityKeys.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  };

  const keyParams = getKeyParameters();
  const hasParams = keyParams.length > 0;

  return (
    <div className={cn(
      "rounded-lg border overflow-hidden transition-all",
      isNested ? "border-border/30" : "border-border/50",
      toolResponse?.success === false
        ? "border-red-200 dark:border-red-800/50 bg-red-50/30 dark:bg-red-950/10"
        : toolResponse
        ? "border-green-200 dark:border-green-800/50 bg-green-50/30 dark:bg-green-950/10"
        : "border-blue-200 dark:border-blue-800/50 bg-blue-50/30 dark:bg-blue-950/10"
    )}>
      {/* Tool execution header */}
      <button
        onClick={onToggle}
        className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {getStatusIcon()}
          <span className="font-medium text-sm truncate">{toolCall.name}</span>
          {operation != null && (
            <span className="font-mono text-xs text-muted-foreground truncate">
              {typeof operation === 'string' ? operation : JSON.stringify(operation)}
            </span>
          )}

          {/* Compact parameter preview when collapsed */}
          {!isExpanded && hasParams && (
            <div className="flex items-center gap-1 ml-2 flex-1 min-w-0">
              {keyParams
                .filter(([key]) => key !== 'op' && key !== 'operation')
                .slice(0, 2)
                .map(([key, value]) => (
                  <span key={key} className="text-xs text-muted-foreground truncate">
                    {key}: {formatValueForDisplay(value)}
                  </span>
                ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs font-medium">{getStatusText()}</span>
          {timestamp && !isNested && (
            <time
              dateTime={timestamp.toISOString()}
              className="text-xs text-muted-foreground"
              title={format(timestamp, 'yyyy-MM-dd HH:mm:ss')}
            >
              {format(timestamp, 'HH:mm')}
            </time>
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="border-t border-border/30 bg-background/30">
          {/* Tool call parameters */}
          {hasParams && (
            <div className="px-3 py-2 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Parameters:</div>
              <div className="space-y-1.5">
                {keyParams.map(([key, value]) => (
                  <div key={key} className="flex items-start gap-2">
                    <div className="text-xs font-medium text-blue-600 dark:text-blue-400 w-24 flex-shrink-0 pt-1">
                      {key}:
                    </div>
                    <div className="flex-1 min-w-0">
                      {typeof value === 'object' && value !== null ? (
                        <pre className="text-xs bg-muted/50 rounded px-2 py-1.5 whitespace-pre-wrap font-mono overflow-x-auto">
                          {JSON.stringify(value, null, 2)}
                        </pre>
                      ) : key === 'code' || key === 'script' || key === 'query' ? (
                        <CodeHighlight code={String(value)} language="python" />
                      ) : (
                        <pre className="text-xs text-foreground/90 font-mono bg-muted/30 rounded px-2 py-1 whitespace-pre-wrap overflow-x-auto">
                          {String(value)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tool response */}
          {toolResponse && (
            <div className="border-t border-border/30 px-3 py-2 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Result:</div>

              {/* Structured response data */}
              {toolResponse.toolResponseData ? (
                <div className="space-y-2">
                  {/* Summary */}
                  {toolResponse.toolResponseData.summary && (
                    <div className="text-sm font-medium text-foreground">
                      {toolResponse.toolResponseData.summary}
                    </div>
                  )}

                  {/* Metrics */}
                  {toolResponse.toolResponseData.metrics && Object.keys(toolResponse.toolResponseData.metrics).length > 0 && (
                    <div className="flex flex-wrap gap-2 text-xs">
                      {toolResponse.toolResponseData.metrics.rowsAffected && (
                        <span className="px-2 py-1 bg-muted/50 rounded">
                          Rows: {toolResponse.toolResponseData.metrics.rowsAffected}
                        </span>
                      )}
                      {toolResponse.toolResponseData.metrics.columnsAffected && (
                        <span className="px-2 py-1 bg-muted/50 rounded">
                          Columns: {toolResponse.toolResponseData.metrics.columnsAffected}
                        </span>
                      )}
                      {toolResponse.toolResponseData.metrics.cellsAffected && (
                        <span className="px-2 py-1 bg-muted/50 rounded">
                          Cells: {toolResponse.toolResponseData.metrics.cellsAffected}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Files */}
                  {toolResponse.toolResponseData.files && (
                    <div className="space-y-1 text-xs">
                      {toolResponse.toolResponseData.files.workbook && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-muted-foreground">File:</span>
                          <span className="font-mono truncate">{toolResponse.toolResponseData.files.workbook}</span>
                        </div>
                      )}
                      {toolResponse.toolResponseData.files.worksheet && (
                        <div className="flex items-center gap-1">
                          <span className="font-medium text-muted-foreground">Sheet:</span>
                          <span className="font-mono">{toolResponse.toolResponseData.files.worksheet}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Next actions */}
                  {toolResponse.toolResponseData.nextActions && toolResponse.toolResponseData.nextActions.length > 0 && (
                    <div className="pt-2 border-t border-border/20">
                      <div className="text-xs font-medium text-muted-foreground mb-1">Suggested next actions:</div>
                      <div className="space-y-1">
                        {toolResponse.toolResponseData.nextActions.map((action: string, index: number) => (
                          <div key={index} className="text-xs bg-muted/30 rounded px-2 py-1 font-mono">
                            {action}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Visualizations */}
                  {toolResponse.toolResponseData.visualizations && toolResponse.toolResponseData.visualizations.length > 0 && (
                    <div className="pt-2 border-t border-border/20">
                      <SmartVisualization visualizations={toolResponse.toolResponseData.visualizations} />
                    </div>
                  )}
                </div>
              ) : (
                /* Unstructured response */
                <div className="text-sm">
                  <MarkdownRenderer content={toolResponse.content} className="" />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
