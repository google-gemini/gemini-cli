/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { Bot, Loader2, Wrench, Package, Brain } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Card, CardContent } from '@/components/ui/Card';
import type { OperationStatus } from '@/stores/chatStore';

interface StatusIndicatorProps {
  className?: string;
  operation: OperationStatus | null;
  isThinking?: boolean;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({ className, operation, isThinking }) => {
  // If no operation and not thinking, don't show anything
  if (!operation && !isThinking) return null;

  // Fallback to thinking status if no operation is set but isThinking is true
  const currentOperation: OperationStatus = operation || {
    type: 'thinking',
    message: 'AI is thinking',
  };

  // Select icon based on operation type
  const getIcon = () => {
    switch (currentOperation.type) {
      case 'tool_executing':
        return <Wrench size={16} className="animate-pulse" />;
      case 'compressing':
        return <Package size={16} className="animate-pulse" />;
      case 'streaming':
        return <Loader2 size={16} className="animate-spin" />;
      case 'thinking':
      default:
        return <Brain size={16} className="animate-pulse" />;
    }
  };

  // Get status color based on type
  const getStatusColor = () => {
    switch (currentOperation.type) {
      case 'tool_executing':
        return 'text-blue-500';
      case 'compressing':
        return 'text-amber-500';
      case 'streaming':
        return 'text-green-500';
      case 'thinking':
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <div className={cn("flex gap-3 max-w-4xl", className)}>
      {/* Avatar */}
      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-secondary">
        <Bot size={16} />
      </div>

      {/* Status card */}
      <div className="flex-1 min-w-0">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2">
              <div className={cn("flex-shrink-0", getStatusColor())}>
                {getIcon()}
              </div>
              <div className="flex-1 min-w-0">
                <div className={cn("text-sm font-medium", getStatusColor())}>
                  {currentOperation.message}
                </div>
                {currentOperation.details && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {currentOperation.details}
                  </div>
                )}
                {currentOperation.toolName && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Tool: {currentOperation.toolName}
                  </div>
                )}
              </div>

              {/* Traditional typing dots for thinking state */}
              {currentOperation.type === 'thinking' && (
                <div className="flex gap-1 flex-shrink-0">
                  <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" />
                </div>
              )}

              {/* Progress bar for operations with progress */}
              {currentOperation.progress !== undefined && (
                <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden flex-shrink-0">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${currentOperation.progress}%` }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};