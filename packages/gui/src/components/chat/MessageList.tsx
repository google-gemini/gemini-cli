/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, useState, forwardRef, useImperativeHandle, useCallback, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import type React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { format } from 'date-fns';
import { Bot, User, AlertCircle, ChevronDown, ChevronRight, BookTemplate, Play, CheckSquare, Target, Brain, FileText, Activity, ListTodo } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { TypingIndicator } from './TypingIndicator';
import { MarkdownRenderer } from './MarkdownRenderer';
import ToolConfirmationMessage from './ToolConfirmationMessage';
import { multiModelService } from '@/services/multiModelService';
import type { ChatMessage, ToolCallConfirmationDetails, ToolConfirmationOutcome, ToolCall } from '@/types';
import 'katex/dist/katex.min.css';



// React Markdown component props interface
// Note: Using any here due to react-markdown's complex internal types
// The actual props we use are type-safe within the function

// Tool response format detection and parsing
interface ParsedToolResponse {
  toolName: string;
  content: string;
  format: 'harmony' | 'openai' | 'gemini' | 'qwen' | 'unknown';
  toolCallId?: string;
  success?: boolean;
  structuredData?: import('@/types').ToolResponseData;
}

// Think tag parsing for reasoning models
interface ParsedThinkingContent {
  thinkingSections: string[];
  mainContent: string;
}

// State snapshot parsing for agent state tracking
interface ParsedStateSnapshot {
  overallGoal: string;
  keyKnowledge: string[];
  fileSystemState: string[];
  recentActions: string[];
  currentPlan: string[];
}

function parseThinkingContent(content: string): ParsedThinkingContent {
  const thinkingSections: string[] = [];
  const remainingContent = content;

  // Extract all <think>...</think> sections
  const thinkRegex = /<think>([\s\S]*?)<\/think>/g;
  let match;
  
  while ((match = thinkRegex.exec(content)) !== null) {
    thinkingSections.push(match[1].trim());
  }
  
  // Remove all thinking sections from main content
  const mainContent = remainingContent.replace(thinkRegex, '').trim();
  
  return {
    thinkingSections,
    mainContent
  };
}

function parseStateSnapshot(content: string): ParsedStateSnapshot | null {
  const stateSnapshotRegex = /<state_snapshot>([\s\S]*?)<\/state_snapshot>/;
  const match = stateSnapshotRegex.exec(content);

  if (!match) return null;

  const xmlContent = match[1];

  // Debug logging (can be removed in production)
  // if (typeof console !== 'undefined') {
  //   console.log('State snapshot XML content:', xmlContent);
  // }

  // Helper function to extract and clean list items
  const extractListItems = (text: string): string[] => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const items: string[] = [];

    for (const line of lines) {
      // Skip obvious comment lines
      if (line.startsWith('<!--') || line.endsWith('-->')) continue;

      if (line.startsWith('-') || line.startsWith('*')) {
        // Explicit list items
        items.push(line.replace(/^[-*]\s*/, '').trim());
      } else if (!line.match(/^<\w+>/) && !line.match(/^<\/\w+>/)) {
        // Non-XML content that looks like a list item
        items.push(line);
      }
    }

    return items;
  };

  // Helper function to extract and clean plan items (numbered, bulleted, or indented)
  const extractPlanItems = (text: string): string[] => {
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    const items: string[] = [];

    for (const line of lines) {
      // Skip comment lines
      if (line.startsWith('<!--') || line.endsWith('-->')) continue;

      if (line.match(/^(\d+\.|[-*])\s/) || line.match(/^\s*\[/) || line.startsWith('*')) {
        // Numbered list, bulleted list, or status items
        items.push(line);
      } else if (!line.match(/^<\w+>/) && !line.match(/^<\/\w+>/) && line.length > 0) {
        // Other non-XML content
        items.push(line);
      }
    }

    return items;
  };

  // Extract overall_goal
  const goalMatch = /<overall_goal>([\s\S]*?)<\/overall_goal>/.exec(xmlContent);
  const overallGoal = goalMatch ? goalMatch[1].replace(/<!--[\s\S]*?-->/g, '').trim() : '';

  // Extract key_knowledge items
  const knowledgeMatch = /<key_knowledge>([\s\S]*?)<\/key_knowledge>/.exec(xmlContent);
  const keyKnowledgeText = knowledgeMatch ? knowledgeMatch[1].replace(/<!--[\s\S]*?-->/g, '').trim() : '';
  const keyKnowledge = extractListItems(keyKnowledgeText);

  // Extract file_system_state items
  const fileSystemMatch = /<file_system_state>([\s\S]*?)<\/file_system_state>/.exec(xmlContent);
  const fileSystemText = fileSystemMatch ? fileSystemMatch[1].replace(/<!--[\s\S]*?-->/g, '').trim() : '';
  const fileSystemState = extractListItems(fileSystemText);

  // Extract recent_actions items
  const actionsMatch = /<recent_actions>([\s\S]*?)<\/recent_actions>/.exec(xmlContent);
  const actionsText = actionsMatch ? actionsMatch[1].replace(/<!--[\s\S]*?-->/g, '').trim() : '';
  const recentActions = extractListItems(actionsText);

  // Extract current_plan items (can be numbered or bulleted)
  const planMatch = /<current_plan>([\s\S]*?)<\/current_plan>/.exec(xmlContent);
  const planText = planMatch ? planMatch[1].replace(/<!--[\s\S]*?-->/g, '').trim() : '';
  const currentPlan = extractPlanItems(planText);

  return {
    overallGoal,
    keyKnowledge,
    fileSystemState,
    recentActions,
    currentPlan
  };
}

function parseToolResponse(message: ChatMessage): ParsedToolResponse | null {
  const content = message.content;
  
  // Check for Harmony format: <|start|>toolname to=assistant...
  const harmonyMatch = content.match(/<\|start\|>(\w+)\s+to=assistant[\s\S]*?<\|message\|>([\s\S]*?)<\|end\|>/);
  if (harmonyMatch) {
    try {
      const [, toolName, messageContent] = harmonyMatch;
      const parsedMessage = JSON.parse(messageContent.trim());
      return {
        toolName,
        content: parsedMessage.result || messageContent.trim(),
        format: 'harmony',
        toolCallId: parsedMessage.tool_call_id,
        success: message.toolSuccess,
        structuredData: message.toolResponseData
      };
    } catch {
      return {
        toolName: harmonyMatch[1],
        content: harmonyMatch[2].trim(),
        format: 'harmony',
        success: message.toolSuccess,
        structuredData: message.toolResponseData
      };
    }
  }
  
  // Check for Gemini format first: __gemini_function_response structure
  if (content.includes('__gemini_function_response')) {
    try {
      const jsonContent = JSON.parse(content);
      if (jsonContent.__gemini_function_response) {
        return {
          toolName: jsonContent.__gemini_function_response.name || 'Function',
          content: jsonContent.__gemini_function_response.response?.output || JSON.stringify(jsonContent.__gemini_function_response.response, null, 2),
          format: 'gemini',
          success: message.toolSuccess
        };
      }
    } catch {
      // Fallback for non-JSON Gemini format
      return {
        toolName: 'Function',
        content,
        format: 'gemini',
        success: message.toolSuccess,
        structuredData: message.toolResponseData
      };
    }
  }
  
  // Check for standard Gemini format: functionResponse structure
  if (content.includes('functionResponse') || content.includes('functionCall')) {
    try {
      const jsonContent = JSON.parse(content);
      if (jsonContent.functionResponse) {
        return {
          toolName: jsonContent.functionResponse.name || 'Function',
          content: JSON.stringify(jsonContent.functionResponse.response, null, 2),
          format: 'gemini',
          success: message.toolSuccess
        };
      }
    } catch {
      // Fallback for non-JSON Gemini format
      return {
        toolName: 'Function',
        content,
        format: 'gemini',
        success: message.toolSuccess,
        structuredData: message.toolResponseData
      };
    }
  }
  
  // Check for Qwen format: <tool_response>...</tool_response>
  const qwenMatch = content.match(/<tool_response>\s*([\s\S]*?)\s*<\/tool_response>/);
  if (qwenMatch) {
    const [, toolContent] = qwenMatch;
    return {
      toolName: 'Qwen Tool', // Qwen format doesn't include tool name in response
      content: toolContent.trim(),
      format: 'qwen',
      success: message.toolSuccess
    };
  }

  // Check for OpenAI format: role='tool' with tool_call_id and name
  if (message.role === 'tool') {
    // For OpenAI format, we should have the tool name from message properties
    // Since we don't have direct access to tool_call_id and name in ChatMessage,
    // we'll extract from content if it's JSON, otherwise use content directly
    try {
      const jsonContent = JSON.parse(content);
      return {
        toolName: jsonContent.name || 'Tool',
        content: jsonContent.result || jsonContent.output || content,
        format: 'openai',
        toolCallId: jsonContent.tool_call_id,
        success: message.toolSuccess,  // Get success status from message
        structuredData: message.toolResponseData  // Get structured data from message
      };
    } catch {
      return {
        toolName: 'Tool',
        content,
        format: 'openai',
        success: message.toolSuccess,
        structuredData: message.toolResponseData
      };
    }
  }
  
  // Not a tool response
  return null;
}

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming?: boolean;
  isThinking?: boolean;
  streamingContent?: string;
  toolConfirmation?: ToolCallConfirmationDetails | null;
  onToolConfirm?: (outcome: ToolConfirmationOutcome) => void;
  onTemplateSaved?: () => void;
}

interface MessageListHandle {
  scrollToBottom: () => void;
}

export const MessageList = forwardRef<MessageListHandle, MessageListProps>(({
  messages,
  isStreaming,
  isThinking,
  streamingContent,
  toolConfirmation,
  onToolConfirm,
  onTemplateSaved,
}, ref) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    scrollToBottom: () => {
      scrollToBottom();
    }
  }), []);

  // Configure virtualizer with dynamic height measurement
  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => 150, // Simplified initial height estimate
    // Provide unique key for each message to prevent cross-session state confusion
    getItemKey: (index) => messages[index]?.id || `fallback-${index}`,
    // Key: Enable dynamic height measurement
    measureElement: (element) => {
      // Measure actual element height including margins
      const rect = element.getBoundingClientRect();
      const computedStyle = window.getComputedStyle(element);
      const marginTop = parseFloat(computedStyle.marginTop);
      const marginBottom = parseFloat(computedStyle.marginBottom);
      return rect.height + marginTop + marginBottom;
    },
    overscan: 5, // Pre-render 5 messages before/after viewport for smooth scrolling
  });

  // Save message as template function
  const saveAsTemplate = async (message: ChatMessage) => {
    try {
      const template = {
        id: `template-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: `Template ${new Date().toLocaleString()}`,
        description: 'User message saved as template',
        category: 'user_generated',
        icon: '💬',
        template: message.content,
        variables: [],
        tags: ['user', 'saved'],
        version: '1.0.0',
        lastModified: new Date(),
        content: message.content
      };
      
      await multiModelService.addCustomTemplate(template);
      
      // Refresh the template list in the sidebar
      if (onTemplateSaved) {
        onTemplateSaved();
      }
    } catch (error) {
      console.error('Failed to save template:', error);
    }
  };

  const scrollToBottom = useCallback((smooth = true) => {
    if (containerRef.current) {
      const behavior = smooth ? 'smooth' : 'instant';
      // Scroll to the very bottom
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior
      });
    }
  }, []);

  // Auto-scroll when messages change (new user message, new assistant response)
  useEffect(() => {
    // Small delay to ensure DOM has updated with new content
    const timeoutId = setTimeout(() => {
      scrollToBottom(true);
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [messages.length, scrollToBottom]);

  // Auto-scroll when streaming content updates
  useEffect(() => {
    if (isStreaming && streamingContent) {
      // More frequent updates during streaming for smoother experience
      const timeoutId = setTimeout(() => {
        scrollToBottom(true);
      }, 50);

      return () => clearTimeout(timeoutId);
    }
  }, [isStreaming, streamingContent, scrollToBottom]);

  // Auto-scroll when tool confirmation appears
  useEffect(() => {
    if (toolConfirmation) {
      const timeoutId = setTimeout(() => {
        scrollToBottom(true);
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [toolConfirmation, scrollToBottom]);

  // Auto-scroll when thinking indicator appears
  useEffect(() => {
    if (isThinking) {
      const timeoutId = setTimeout(() => {
        scrollToBottom(true);
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [isThinking, scrollToBottom]);

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto p-4 min-h-0"
      data-message-container
    >
      {/* Virtualization container */}
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const message = messages[virtualItem.index];

          return (
            <div
              key={virtualItem.key}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
              className="mb-4"
            >
              <MessageBubble
                message={message}
                onSaveAsTemplate={saveAsTemplate}
              />
            </div>
          );
        })}
      </div>

      {/* Non-virtualized fixed content - tool confirmations and streaming messages */}
      {toolConfirmation && onToolConfirm && (
        <div className="flex justify-center mt-4">
          <div className="w-full">
            <ToolConfirmationMessage
              confirmationDetails={toolConfirmation}
              onConfirm={onToolConfirm}
            />
          </div>
        </div>
      )}

      {/* Show thinking indicator when AI is processing */}
      {isThinking && (
        <div className="mt-4">
          <TypingIndicator />
        </div>
      )}

      {/* Show streaming content when AI is responding - only if content is unique */}
      {isStreaming && streamingContent && !messages.some(msg =>
        msg.role === 'assistant' && msg.content === streamingContent
      ) && (
        <div className="mt-4">
          <MessageBubble
            message={{
              id: 'streaming',
              role: 'assistant',
              content: streamingContent,
              timestamp: new Date(),
            }}
            isStreaming
            onSaveAsTemplate={saveAsTemplate}
          />
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
});

MessageList.displayName = 'MessageList';

// Component to display thinking sections in a collapsible format
const ThinkingSection: React.FC<{ thinkingSections: string[] }> = ({ thinkingSections }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (thinkingSections.length === 0) return null;

  return (
    <div className="mb-3">
      <div className="bg-muted/50 border border-border rounded-lg overflow-hidden">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full px-3 py-2 text-left flex items-center gap-2 text-muted-foreground hover:bg-muted/70 transition-colors text-xs"
        >
          {isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <span className="font-medium">
            Thinking process ({thinkingSections.length} step{thinkingSections.length > 1 ? 's' : ''})
          </span>
        </button>
        {isExpanded && (
          <div className="border-t border-border/50 bg-background/50">
            {thinkingSections.map((thinking, index) => (
              <div key={index} className="px-3 py-2 border-b border-border/30 last:border-b-0">
                <div className="text-xs text-muted-foreground mb-1 font-medium">Step {index + 1}:</div>
                <div className="text-sm text-foreground/80 whitespace-pre-wrap leading-relaxed">{thinking}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// Component to display tool calls with expandable parameters
const ToolCallDisplay: React.FC<{ toolCall: ToolCall }> = ({ toolCall }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Get key parameters for compact display
  const getKeyParameters = (args: Record<string, unknown>) => {
    if (!args || typeof args !== 'object') return [];

    const entries = Object.entries(args);
    // Prioritize important parameters
    const priorityKeys = ['op', 'operation', 'range', 'workbook', 'worksheet', 'data'];
    const sortedEntries = entries.sort(([a], [b]) => {
      const aIndex = priorityKeys.indexOf(a);
      const bIndex = priorityKeys.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return 0;
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });

    return sortedEntries;
  };

  const formatValueForDisplay = (value: unknown): string => {
    if (typeof value === 'string') {
      if (value.length > 40) {
        return `"${value.slice(0, 37)}..."`;
      }
      return `"${value}"`;
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

  const keyParams = getKeyParameters(toolCall.arguments || {});
  const hasParams = keyParams.length > 0;

  // Filter out op/operation for determining expand condition since they're shown in header
  const nonOpParams = keyParams.filter(([key]) => key !== 'op' && key !== 'operation');
  const shouldShowExpand = nonOpParams.length > 1 || keyParams.some(([, value]) =>
    typeof value === 'string' && value.length > 40 ||
    Array.isArray(value) && value.length > 3 ||
    typeof value === 'object' && value !== null && Object.keys(value).length > 2
  );

  return (
    <div className="mb-3 last:mb-0">
      <div className="bg-muted/20 rounded-lg border border-blue-200/50 dark:border-blue-700/30 overflow-hidden">
        {/* Tool call header with tool name and operation */}
        <div className="flex items-center justify-between p-3 bg-muted/30 border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-xs font-bold text-foreground/80 border border-border/50 rounded px-2 py-1">
              <Play size={10} />
              <span>Call</span>
            </div>
            <span className="font-bold text-base text-foreground">{toolCall.name}</span>
            {(Boolean((toolCall.arguments as Record<string, unknown>)?.op || (toolCall.arguments as Record<string, unknown>)?.operation)) && (
              <span className="font-mono text-base font-bold text-foreground/70">
                {String((toolCall.arguments as Record<string, unknown>).op || (toolCall.arguments as Record<string, unknown>).operation)}
              </span>
            )}
          </div>
          {shouldShowExpand && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="px-2 py-1 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-background/50"
              title={isExpanded ? "Show less" : "Show all parameters"}
            >
              {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
          )}
        </div>

        {/* Parameters display */}
        {hasParams && (
          <div className="px-3 pb-3 pt-2">
            {isExpanded ? (
              // Expanded view - show all parameters with horizontal alignment
              <div className="space-y-3">
                <div className="text-xs font-medium text-muted-foreground">Parameters:</div>
                <div className="space-y-2">
                  {keyParams.map(([key, value]) => (
                    <div key={key} className="flex items-center gap-3">
                      <div className="text-xs font-medium text-blue-600 dark:text-blue-400 w-20 flex-shrink-0">
                        {key}:
                      </div>
                      <div className="flex-1 min-w-0">
                        {typeof value === 'object' && value !== null ? (
                          <pre className="text-xs bg-background/50 rounded px-3 py-2 whitespace-pre-wrap font-mono text-foreground/80 overflow-x-auto border">
                            {JSON.stringify(value, null, 2)}
                          </pre>
                        ) : (
                          <div className="text-xs text-foreground/90 break-words font-mono bg-background/30 rounded px-2 py-1">
                            {String(value)}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              // Compact view - show key parameters inline (excluding op since it's in header)
              <div className="flex flex-wrap gap-2 items-center">
                {keyParams
                  .filter(([key]) => key !== 'op' && key !== 'operation')
                  .slice(0, 2)
                  .map(([key, value]) => (
                    <div key={key} className="flex items-center gap-1 text-xs">
                      <span className="font-medium text-blue-600 dark:text-blue-400">{key}:</span>
                      <span className="text-foreground/80 font-mono">{formatValueForDisplay(value)}</span>
                    </div>
                  ))}
                {keyParams.filter(([key]) => key !== 'op' && key !== 'operation').length > 2 && (
                  <span className="text-xs text-muted-foreground">
                    +{keyParams.filter(([key]) => key !== 'op' && key !== 'operation').length - 2} more
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {toolCall.result && (
        <div className="text-xs mt-2 pl-3 border-l-2 border-border text-muted-foreground">
          <span className="font-medium">Result:</span> {toolCall.result}
        </div>
      )}
    </div>
  );
};

// Component to display tool responses with expandable content
const ToolResponseDisplay: React.FC<{ toolResponse: ParsedToolResponse }> = ({ toolResponse }) => {
  const [isExpanded, setIsExpanded] = useState(false);


  // Check if content is long enough to warrant collapsing
  const isLongContent = toolResponse.content.length > 200;
  const shouldShowExpand = isLongContent;
  
  // Get preview content (first 150 characters)
  const previewContent = isLongContent && !isExpanded 
    ? toolResponse.content.slice(0, 150) + '...'
    : toolResponse.content;

  // Use structured data if available for better display
  if (toolResponse.structuredData) {
    const getResultStatusColor = (success?: boolean) => {
      if (success === true) {
        return "text-emerald-600 dark:text-emerald-400";
      } else if (success === false) {
        return "text-red-600 dark:text-red-400";
      }
      return "text-muted-foreground";
    };

    const getResultStatusText = (success?: boolean) => {
      if (success === true) {
        return "✅ Success";
      } else if (success === false) {
        return "❌ Failed";
      }
      return "✅ Completed";
    };

    return (
      <div className="mb-3 last:mb-0">
        <div className="bg-muted/20 rounded-lg border border-green-200/50 dark:border-green-700/30 overflow-hidden">
          {/* Tool response header - similar to tool call design */}
          <div className="flex items-center justify-between p-3 bg-muted/30 border-b border-border/30">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 text-xs font-bold text-foreground/80 border border-border/50 rounded px-2 py-1">
                <CheckSquare size={10} />
                <span>Result</span>
              </div>
              <span className="font-bold text-base text-foreground">{toolResponse.toolName}</span>
              {toolResponse.structuredData.operation && (
                <span className="font-mono text-base font-bold text-foreground/70">
                  {toolResponse.structuredData.operation}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("text-xs font-medium", getResultStatusColor(toolResponse.success))}>
                {getResultStatusText(toolResponse.success)}
              </span>
              {toolResponse.toolCallId && (
                <span className="font-mono text-xs opacity-50">#{toolResponse.toolCallId.slice(-6)}</span>
              )}
            </div>
          </div>

          {/* Content area */}
          <div className="px-3 pb-3 pt-2 space-y-3">
            {/* Operation summary */}
            <div className="text-sm font-medium text-foreground">
              {toolResponse.structuredData.summary}
            </div>

            {/* Metrics in compact format */}
            {toolResponse.structuredData.metrics && Object.keys(toolResponse.structuredData.metrics).length > 0 && (
              <div className="flex flex-wrap gap-3 text-xs">
                {toolResponse.structuredData.metrics.rowsAffected && (
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-blue-600 dark:text-blue-400">Rows:</span>
                    <span className="text-foreground/80 font-mono">{toolResponse.structuredData.metrics.rowsAffected}</span>
                  </div>
                )}
                {toolResponse.structuredData.metrics.columnsAffected && (
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-blue-600 dark:text-blue-400">Columns:</span>
                    <span className="text-foreground/80 font-mono">{toolResponse.structuredData.metrics.columnsAffected}</span>
                  </div>
                )}
                {toolResponse.structuredData.metrics.cellsAffected && (
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-blue-600 dark:text-blue-400">Cells:</span>
                    <span className="text-foreground/80 font-mono">{toolResponse.structuredData.metrics.cellsAffected}</span>
                  </div>
                )}
              </div>
            )}

            {/* Files in compact format */}
            {toolResponse.structuredData.files && Object.keys(toolResponse.structuredData.files).length > 0 && (
              <div className="space-y-1">
                {toolResponse.structuredData.files.workbook && (
                  <div className="flex items-center gap-1 text-xs">
                    <span className="font-medium text-blue-600 dark:text-blue-400">File:</span>
                    <span className="text-foreground/80 font-mono truncate">{toolResponse.structuredData.files.workbook}</span>
                  </div>
                )}
                {toolResponse.structuredData.files.worksheet && (
                  <div className="flex items-center gap-1 text-xs">
                    <span className="font-medium text-blue-600 dark:text-blue-400">Sheet:</span>
                    <span className="text-foreground/80 font-mono">{toolResponse.structuredData.files.worksheet}</span>
                  </div>
                )}
              </div>
            )}

            {/* Next actions */}
            {toolResponse.structuredData.nextActions && toolResponse.structuredData.nextActions.length > 0 && (
              <div className="pt-2 border-t border-border/30">
                <div className="text-xs font-medium text-muted-foreground mb-2">Suggested next actions:</div>
                <div className="space-y-1">
                  {toolResponse.structuredData.nextActions.map((action: string, index: number) => (
                    <div key={index} className="text-xs text-foreground/70 font-mono bg-background/30 rounded px-2 py-1">
                      {action}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Fallback to enhanced display for unstructured responses
  const extractOperationFromContent = (content: string): string | null => {
    // Try to extract operation from common patterns
    const operationMatch = content.match(/Excel (\w+) operation/i) ||
                          content.match(/(\w+) completed successfully/i) ||
                          content.match(/execution completed/i);
    if (operationMatch) {
      return operationMatch[1] || 'execution';
    }
    return null;
  };

  const operation = extractOperationFromContent(toolResponse.content);

  return (
    <div className="flex justify-center">
      <div className="bg-muted/20 rounded-lg border border-green-200/50 dark:border-green-700/30 overflow-hidden max-w-3xl">
        {/* Enhanced tool response header */}
        <div className="flex items-center justify-between p-3 bg-muted/30 border-b border-border/30">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-xs font-bold text-foreground/80 border border-border/50 rounded px-2 py-1">
              <CheckSquare size={10} />
              <span>Result</span>
            </div>
            <span className="font-bold text-base text-foreground">{toolResponse.toolName}</span>
            {operation && (
              <span className="font-mono text-base font-bold text-foreground/70">
                {operation}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("text-xs font-medium",
              toolResponse.success === true ? "text-emerald-600 dark:text-emerald-400" :
              toolResponse.success === false ? "text-red-600 dark:text-red-400" : "text-muted-foreground")}>
              {toolResponse.success === true ? "✅ Success" :
               toolResponse.success === false ? "❌ Failed" : "✅ Completed"}
            </span>
            {toolResponse.toolCallId && (
              <span className="font-mono text-xs opacity-50">#{toolResponse.toolCallId.slice(-6)}</span>
            )}
            {shouldShowExpand && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="px-2 py-1 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-background/50"
                title={isExpanded ? "Show less" : "Show full response"}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            )}
          </div>
        </div>

        {/* Content area */}
        <div className="px-3 pb-3 pt-2">
          <div className="text-sm">
            <Markdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {previewContent}
            </Markdown>
          </div>
        </div>
      </div>
    </div>
  );
};

// Component to display state snapshot in a structured format
const StateSnapshotDisplay: React.FC<{ stateSnapshot: ParsedStateSnapshot }> = ({ stateSnapshot }) => {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  const toggleSection = (sectionName: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionName)) {
        next.delete(sectionName);
      } else {
        next.add(sectionName);
      }
      return next;
    });
  };

  const isExpanded = (sectionName: string) => expandedSections.has(sectionName);

  const sections = [
    {
      key: 'overall_goal',
      title: 'Overall Goal',
      icon: <Target size={14} />,
      content: stateSnapshot.overallGoal,
      color: 'blue'
    },
    {
      key: 'key_knowledge',
      title: 'Key Knowledge',
      icon: <Brain size={14} />,
      content: stateSnapshot.keyKnowledge,
      color: 'purple'
    },
    {
      key: 'file_system_state',
      title: 'File System State',
      icon: <FileText size={14} />,
      content: stateSnapshot.fileSystemState,
      color: 'green'
    },
    {
      key: 'recent_actions',
      title: 'Recent Actions',
      icon: <Activity size={14} />,
      content: stateSnapshot.recentActions,
      color: 'orange'
    },
    {
      key: 'current_plan',
      title: 'Current Plan',
      icon: <ListTodo size={14} />,
      content: stateSnapshot.currentPlan,
      color: 'red'
    }
  ];

  const getColorClasses = (color: string) => {
    const colors = {
      blue: 'border-border/60 bg-muted/30',
      purple: 'border-border/60 bg-muted/30',
      green: 'border-border/60 bg-muted/30',
      orange: 'border-border/60 bg-muted/30',
      red: 'border-border/60 bg-muted/30'
    };
    return colors[color as keyof typeof colors] || colors.blue;
  };

  return (
    <div className="mb-3">
      <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
        {/* State snapshot header */}
        <div className="flex items-center justify-between p-4 bg-muted/50 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-medium text-foreground/90 bg-secondary/50 border border-border rounded-md px-3 py-1.5">
              <Brain size={12} />
              <span>State Snapshot</span>
            </div>
            <span className="text-sm text-muted-foreground font-medium">Agent Memory</span>
          </div>
        </div>

        {/* Sections */}
        <div className="p-4 space-y-3">
          {sections.map((section) => {
            const hasContent = Array.isArray(section.content) ? section.content.length > 0 : Boolean(section.content);
            if (!hasContent) return null;

            const expanded = isExpanded(section.key);

            return (
              <div key={section.key} className={cn("rounded-md border overflow-hidden bg-card shadow-sm", getColorClasses(section.color))}>
                <button
                  onClick={() => toggleSection(section.key)}
                  className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-muted/40 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <div className="text-muted-foreground">
                      {section.icon}
                    </div>
                    <span className="font-medium text-sm text-foreground">{section.title}</span>
                    {Array.isArray(section.content) && (
                      <span className="text-xs text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded-full">
                        {section.content.length}
                      </span>
                    )}
                  </div>
                  <div className="text-muted-foreground">
                    {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-border bg-muted/20 px-4 py-3">
                    {Array.isArray(section.content) ? (
                      <ul className="space-y-2">
                        {section.content.map((item, index) => (
                          <li key={index} className="text-sm text-foreground/90 flex items-start gap-3">
                            <span className="text-muted-foreground mt-0.5 text-xs">•</span>
                            <span className="font-mono text-xs leading-relaxed flex-1">{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="text-sm text-foreground/90 font-medium">{section.content}</div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
  onSaveAsTemplate?: (message: ChatMessage) => void;
}


const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isStreaming, onSaveAsTemplate }) => {
  // Check if this message is actually a tool response (regardless of role)
  const toolResponse = parseToolResponse(message);
  const isUser = message.role === 'user' && !toolResponse; // User only if not a tool response
  const isSystem = message.role === 'system';
  const isTool = message.role === 'tool' || toolResponse; // Tool if role is tool OR if content is tool format

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground max-w-2xl">
          <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {message.content}
          </Markdown>
        </div>
      </div>
    );
  }

  if (isTool && toolResponse) {
    return <ToolResponseDisplay toolResponse={toolResponse} />;
  }

  return (
    <div className={cn("flex gap-3 max-w-4xl group", isUser ? "ml-auto flex-row-reverse" : "")}>
      {/* Avatar */}
      <div className={cn(
        "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
        isUser ? "bg-primary text-primary-foreground" : "bg-secondary"
      )}>
        {isUser ? <User size={16} /> : <Bot size={16} />}
      </div>

      {/* Message content */}
      <div className={cn("flex-1 min-w-0", isUser ? "text-right" : "")}>
        <Card className={cn(
          "inline-block text-left max-w-full",
          isUser ? "bg-primary text-primary-foreground" : ""
        )}>
          <CardContent className="p-3">
            {message.error ? (
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle size={16} />
                <span className="text-sm">{message.error}</span>
              </div>
            ) : (
              <div>
                {(() => {
                  // Parse thinking content for assistant messages and state snapshot for both user and assistant
                  if (message.role === 'assistant') {
                    const { thinkingSections, mainContent } = parseThinkingContent(message.content);
                    const stateSnapshot = parseStateSnapshot(message.content);

                    // Remove state_snapshot from main content if it exists
                    const contentWithoutSnapshot = mainContent.replace(/<state_snapshot>[\s\S]*?<\/state_snapshot>/g, '').trim();

                    return (
                      <>
                        {/* Show thinking sections if they exist */}
                        <ThinkingSection thinkingSections={thinkingSections} />

                        {/* Show state snapshot if it exists */}
                        {stateSnapshot && (
                          <StateSnapshotDisplay stateSnapshot={stateSnapshot} />
                        )}

                        {/* Show main content */}
                        {contentWithoutSnapshot && (
                          <MarkdownRenderer
                            content={contentWithoutSnapshot}
                            className="px-3 py-2"
                            isUserMessage={false}
                          />
                        )}
                      </>
                    );
                  } else {
                    // For non-assistant messages, check for state_snapshot (from compression)
                    const stateSnapshot = parseStateSnapshot(message.content);
                    const contentWithoutSnapshot = message.content.replace(/<state_snapshot>[\s\S]*?<\/state_snapshot>/g, '').trim();

                    return (
                      <>
                        {/* Show state snapshot if it exists */}
                        {stateSnapshot && (
                          <StateSnapshotDisplay stateSnapshot={stateSnapshot} />
                        )}

                        {/* Show main content only if there's content left after removing state_snapshot */}
                        {contentWithoutSnapshot && (
                          <MarkdownRenderer
                            content={contentWithoutSnapshot}
                            className="px-3 py-2"
                            isUserMessage={isUser}
                          />
                        )}
                      </>
                    );
                  }
                })()}
              </div>
            )}
            
            {/* Tool calls */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="text-xs text-muted-foreground mb-2">Tool Calls:</div>
                {message.toolCalls.map((toolCall, index) => (
                  <ToolCallDisplay key={index} toolCall={toolCall} />
                ))}
              </div>
            )}

            {/* Timestamp and Actions */}
            <div className={cn(
              "text-xs mt-2 pt-2 border-t border-border/20",
              isUser ? "text-primary-foreground/70" : "text-muted-foreground"
            )}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <time dateTime={message.timestamp.toISOString()} title={format(message.timestamp, 'yyyy-MM-dd HH:mm:ss')}>
                    {format(message.timestamp, 'HH:mm')}
                  </time>
                  {isStreaming && <span className="animate-pulse">●</span>}
                </div>
                
                {/* Save as Template Button - only for user messages */}
                {isUser && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onSaveAsTemplate?.(message)}
                    className={cn(
                      "h-5 w-5 opacity-0 group-hover:opacity-100 transition-opacity",
                      isUser ? "hover:bg-primary-foreground/20 text-primary-foreground/50 hover:text-primary-foreground" : "hover:bg-muted"
                    )}
                    title="Save as template"
                  >
                    <BookTemplate size={12} />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};