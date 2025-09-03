import { useEffect, useRef, useState } from 'react';
import type React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { format } from 'date-fns';
import { Bot, User, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Card, CardContent } from '@/components/ui/Card';
import { TypingIndicator } from './TypingIndicator';
import type { ChatMessage } from '@/types';
import 'katex/dist/katex.min.css';

// Tool response format detection and parsing
interface ParsedToolResponse {
  toolName: string;
  content: string;
  format: 'harmony' | 'openai' | 'gemini' | 'qwen' | 'unknown';
  toolCallId?: string;
}

// Think tag parsing for reasoning models
interface ParsedThinkingContent {
  thinkingSections: string[];
  mainContent: string;
}

function parseThinkingContent(content: string): ParsedThinkingContent {
  const thinkingSections: string[] = [];
  let remainingContent = content;

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
        toolCallId: parsedMessage.tool_call_id
      };
    } catch {
      return {
        toolName: harmonyMatch[1],
        content: harmonyMatch[2].trim(),
        format: 'harmony'
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
          format: 'gemini'
        };
      }
    } catch {
      // Fallback for non-JSON Gemini format
      return {
        toolName: 'Function',
        content: content,
        format: 'gemini'
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
          format: 'gemini'
        };
      }
    } catch {
      // Fallback for non-JSON Gemini format
      return {
        toolName: 'Function',
        content: content,
        format: 'gemini'
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
      format: 'qwen'
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
        toolCallId: jsonContent.tool_call_id
      };
    } catch {
      return {
        toolName: 'Tool',
        content: content,
        format: 'openai'
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
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isStreaming,
  isThinking,
  streamingContent,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, isThinking]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      
      {/* Show thinking indicator when AI is processing */}
      {isThinking && <TypingIndicator />}
      
      {/* Show streaming content when AI is responding */}
      {isStreaming && streamingContent && (
        <MessageBubble
          message={{
            id: 'streaming',
            role: 'assistant',
            content: streamingContent,
            timestamp: new Date(),
          }}
          isStreaming
        />
      )}
      
      <div ref={messagesEndRef} />
    </div>
  );
};

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

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isStreaming }) => {
  // Check if this message is actually a tool response (regardless of role)
  const toolResponse = parseToolResponse(message);
  const isUser = message.role === 'user' && !toolResponse; // User only if not a tool response
  const isSystem = message.role === 'system';
  const isTool = message.role === 'tool' || toolResponse; // Tool if role is tool OR if content is tool format

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground max-w-2xl">
          {(Markdown as any)({ remarkPlugins: [remarkGfm], rehypePlugins: [rehypeHighlight], children: message.content })}
        </div>
      </div>
    );
  }

  if (isTool && toolResponse) {
    const parsed = toolResponse; // Use the already parsed result
    const formatColors = {
      harmony: 'bg-purple-50 border-purple-200 text-purple-800',
      openai: 'bg-green-50 border-green-200 text-green-800',
      gemini: 'bg-blue-50 border-blue-200 text-blue-800',
      qwen: 'bg-orange-50 border-orange-200 text-orange-800',
      unknown: 'bg-gray-50 border-gray-200 text-gray-800'
    };
    
    const formatLabels = {
      harmony: 'Tool',
      openai: 'Tool',
      gemini: 'Tool',
      qwen: 'Tool',
      unknown: 'Tool'
    };

    return (
      <div className="flex justify-center">
        <div className={cn("border rounded-lg px-3 py-2 text-sm max-w-2xl", formatColors[parsed.format])}>
          <div className="font-semibold text-xs mb-1 flex items-center gap-2">
            <span>{formatLabels[parsed.format]}</span>
            <span className="font-mono text-xs opacity-70">{parsed.toolName}</span>
            {parsed.toolCallId && (
              <span className="font-mono text-xs opacity-50">#{parsed.toolCallId.slice(-6)}</span>
            )}
          </div>
          {(Markdown as any)({ 
            remarkPlugins: [remarkGfm], 
            rehypePlugins: [rehypeHighlight], 
            children: parsed.content 
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={cn("flex gap-3 max-w-4xl", isUser ? "ml-auto flex-row-reverse" : "")}>
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
                  // Parse thinking content for assistant messages only
                  if (message.role === 'assistant') {
                    const { thinkingSections, mainContent } = parseThinkingContent(message.content);
                    
                    return (
                      <>
                        {/* Show thinking sections if they exist */}
                        <ThinkingSection thinkingSections={thinkingSections} />
                        
                        {/* Show main content */}
                        {mainContent && (
                          <div className={cn(
                            "prose prose-sm max-w-none",
                            isUser ? "prose-invert" : "",
                            "prose-pre:bg-muted prose-pre:text-foreground",
                            "prose-code:bg-muted prose-code:text-foreground prose-code:px-1 prose-code:rounded"
                          )}>
                            {(Markdown as any)({
                              remarkPlugins: [remarkGfm, remarkMath],
                              rehypePlugins: [rehypeKatex, rehypeHighlight],
                              components: {
                                code(props: any) {
                                  const { inline, className, children, ...rest } = props;
                                  const match = /language-(\w+)/.exec(className || '');
                                  const content = String(children).replace(/\n$/, '');
                                  return !inline && match ? (
                                    <pre className="overflow-x-auto">
                                      <code className={className} {...rest}>
                                        {content}
                                      </code>
                                    </pre>
                                  ) : (
                                    <code className={cn("px-1 py-0.5 rounded text-sm", className)} {...rest}>
                                      {content}
                                    </code>
                                  );
                                },
                              },
                              children: mainContent
                            })}
                          </div>
                        )}
                      </>
                    );
                  } else {
                    // For non-assistant messages, render normally
                    return (
                      <div className={cn(
                        "prose prose-sm max-w-none",
                        isUser ? "prose-invert" : "",
                        "prose-pre:bg-muted prose-pre:text-foreground",
                        "prose-code:bg-muted prose-code:text-foreground prose-code:px-1 prose-code:rounded"
                      )}>
                        {(Markdown as any)({
                          remarkPlugins: [remarkGfm, remarkMath],
                          rehypePlugins: [rehypeKatex, rehypeHighlight],
                          components: {
                            code(props: any) {
                              const { inline, className, children, ...rest } = props;
                              const match = /language-(\w+)/.exec(className || '');
                              const content = String(children).replace(/\n$/, '');
                              return !inline && match ? (
                                <pre className="overflow-x-auto">
                                  <code className={className} {...rest}>
                                    {content}
                                  </code>
                                </pre>
                              ) : (
                                <code className={cn("px-1 py-0.5 rounded text-sm", className)} {...rest}>
                                  {content}
                                </code>
                              );
                            },
                          },
                          children: message.content
                        })}
                      </div>
                    );
                  }
                })()}
              </div>
            )}
            
            {/* Tool calls */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="text-xs text-muted-foreground mb-2">Tool Calls:</div>
                {message.toolCalls.map((toolCall, index) => {
                  const formatArguments = (args: any) => {
                    if (!args || typeof args !== 'object') return '';
                    
                    // Show key parameters in a readable format
                    const entries = Object.entries(args).slice(0, 3); // Show first 3 params
                    if (entries.length === 0) return '';
                    
                    const formatted = entries.map(([key, value]) => {
                      if (typeof value === 'string' && value.length > 30) {
                        return `${key}: "${value.slice(0, 27)}..."`;
                      }
                      return `${key}: ${JSON.stringify(value)}`;
                    }).join(', ');
                    
                    const hasMore = Object.keys(args).length > 3;
                    return hasMore ? `${formatted}, ...` : formatted;
                  };
                  
                  return (
                    <div key={index} className="mb-2 last:mb-0">
                      <div className="text-xs font-mono bg-muted rounded px-2 py-1">
                        {toolCall.name}({formatArguments(toolCall.arguments)})
                      </div>
                      {toolCall.result && (
                        <div className="text-xs mt-1 pl-2 border-l-2 border-border">
                          {toolCall.result}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Timestamp */}
            <div className={cn(
              "text-xs mt-2 pt-2 border-t border-border/20 flex items-center gap-1",
              isUser ? "text-primary-foreground/70" : "text-muted-foreground"
            )}>
              <time dateTime={message.timestamp.toISOString()} title={format(message.timestamp, 'yyyy-MM-dd HH:mm:ss')}>
                {format(message.timestamp, 'HH:mm')}
              </time>
              {isStreaming && <span className="animate-pulse">●</span>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};