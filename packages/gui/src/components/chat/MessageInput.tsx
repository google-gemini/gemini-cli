import React, { useState, useRef, useCallback } from 'react';
import { Send, StopCircle, Paperclip, Mic } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { multiModelService } from '@/services/multiModelService';
import { cn } from '@/utils/cn';
import type { ChatMessage, UniversalMessage } from '@/types';

interface MessageInputProps {
  disabled?: boolean;
}

export const MessageInput: React.FC<MessageInputProps> = ({ disabled = false }) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const { activeSessionId, updateSession } = useAppStore();
  const { isStreaming, setStreaming, setStreamingMessage, setError } = useChatStore();

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 200; // max height in pixels
    textarea.style.height = Math.min(scrollHeight, maxHeight) + 'px';
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMessage(e.target.value);
    adjustTextareaHeight();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSendMessage = async () => {
    if (!message.trim() || !activeSessionId || isStreaming) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message.trim(),
      timestamp: new Date()
    };

    // Add user message to session
    updateSession(activeSessionId, {
      messages: [...(useAppStore.getState().sessions.find(s => s.id === activeSessionId)?.messages || []), userMessage],
      updatedAt: new Date()
    });

    // Clear input
    setMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Start streaming
    setStreaming(true);
    setStreamingMessage('');
    setError(null);

    try {
      const session = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
      if (!session) return;

      const messages = [...session.messages, userMessage];
      const universalMessages: UniversalMessage[] = messages.map(msg => ({
        role: msg.role as 'user' | 'assistant' | 'system',
        content: msg.content
      }));
      const stream = await multiModelService.sendMessage(
        universalMessages,
        session.roleId
      );

      let assistantContent = '';
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: '',
        timestamp: new Date()
      };

      for await (const event of stream) {
        if (event.type === 'content' || event.type === 'content_delta') {
          assistantContent += event.content;
          setStreamingMessage(assistantContent);
        } else if (event.type === 'done' || event.type === 'message_complete') {
          assistantMessage.content = assistantContent;
          
          // Add assistant message to session
          const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
          if (currentSession) {
            updateSession(activeSessionId, {
              messages: [...currentSession.messages, assistantMessage],
              updatedAt: new Date(),
              title: currentSession.title === 'New Chat' ? 
                userMessage.content.slice(0, 50) + (userMessage.content.length > 50 ? '...' : '') : 
                currentSession.title
            });
          }
          break;
        } else if (event.type === 'error') {
          setError(event.error instanceof Error ? event.error.message : (event.error || 'An error occurred'));
          break;
        }
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setStreaming(false);
      setStreamingMessage('');
    }
  };

  const handleStopGeneration = () => {
    setStreaming(false);
    setStreamingMessage('');
  };

  return (
    <div className="border-t border-border bg-card p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-end gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            disabled={disabled}
          >
            <Paperclip size={16} />
          </Button>

          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              placeholder={disabled ? "Select a session to start chatting..." : "Type a message..."}
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              disabled={disabled || isStreaming}
              className={cn(
                "min-h-[44px] max-h-[200px] resize-none pr-12",
                "focus:ring-1 focus:ring-primary/50"
              )}
              style={{ height: 'auto' }}
            />
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10"
            disabled={disabled}
          >
            <Mic size={16} />
          </Button>

          {isStreaming ? (
            <Button
              variant="destructive"
              size="icon"
              onClick={handleStopGeneration}
              className="h-10 w-10"
            >
              <StopCircle size={16} />
            </Button>
          ) : (
            <Button
              onClick={handleSendMessage}
              disabled={!message.trim() || disabled}
              size="icon"
              className="h-10 w-10"
            >
              <Send size={16} />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};