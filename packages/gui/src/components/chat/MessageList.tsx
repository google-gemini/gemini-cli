import { useEffect, useRef } from 'react';
import type React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { format } from 'date-fns';
import { Bot, User, AlertCircle } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Card, CardContent } from '@/components/ui/Card';
import type { ChatMessage } from '@/types';
import 'katex/dist/katex.min.css';

interface MessageListProps {
  messages: ChatMessage[];
  isStreaming?: boolean;
  streamingContent?: string;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  isStreaming,
  streamingContent,
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent]);

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
      
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

interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isStreaming }) => {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <div className="flex justify-center">
        <div className="bg-muted rounded-lg px-3 py-2 text-sm text-muted-foreground max-w-2xl">
          {(Markdown as any)({ remarkPlugins: [remarkGfm], rehypePlugins: [rehypeHighlight], children: message.content })}
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
            )}
            
            {/* Tool calls */}
            {message.toolCalls && message.toolCalls.length > 0 && (
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="text-xs text-muted-foreground mb-2">Tool Calls:</div>
                {message.toolCalls.map((toolCall, index) => (
                  <div key={index} className="mb-2 last:mb-0">
                    <div className="text-xs font-mono bg-muted rounded px-2 py-1">
                      {toolCall.name}({JSON.stringify(toolCall.arguments)})
                    </div>
                    {toolCall.result && (
                      <div className="text-xs mt-1 pl-2 border-l-2 border-border">
                        {toolCall.result}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Timestamp */}
            <div className={cn(
              "text-xs mt-2 pt-2 border-t border-border/20",
              isUser ? "text-primary-foreground/70" : "text-muted-foreground"
            )}>
              {format(message.timestamp, 'HH:mm')}
              {isStreaming && <span className="ml-1 animate-pulse">●</span>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};