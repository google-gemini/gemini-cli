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
  const { isStreaming, isThinking, setStreaming, setThinking, setStreamingMessage, setError } = useChatStore();

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
    if (!message.trim() || !activeSessionId || isStreaming || isThinking) return;

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

    // Start thinking state first
    setThinking(true);
    setStreamingMessage('');
    setError(null);

    try {
      const session = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
      if (!session) return;

      // Ensure backend is on the same session before sending message
      const currentBackendSessionId = await multiModelService.getCurrentSessionId();
      if (currentBackendSessionId !== activeSessionId) {
        console.warn(`Backend session (${currentBackendSessionId}) != frontend session (${activeSessionId}). Syncing...`);
        await multiModelService.switchSession(activeSessionId);
      }

      // Send ONLY the new user message (MultiModelSystem manages history internally)
      const newUserMessage: UniversalMessage = {
        role: 'user',
        content: userMessage.content
      };
      const stream = await multiModelService.sendMessage([newUserMessage]);

      let assistantContent = '';
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-assistant`,
        role: 'assistant',
        content: '',
        timestamp: new Date()
      };

      for await (const event of stream) {
        if (event.type === 'content' || event.type === 'content_delta') {
          // Switch from thinking to streaming on first content
          if (isThinking) {
            setThinking(false);
            setStreaming(true);
          }
          assistantContent += event.content;
          setStreamingMessage(assistantContent);
        } else if (event.type === 'done' || event.type === 'message_complete') {
          assistantMessage.content = assistantContent;
          
          // Add assistant message to session
          const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
          if (currentSession) {
            updateSession(activeSessionId, {
              messages: [...currentSession.messages, assistantMessage],
              updatedAt: new Date()
            });

            // Refresh session info to get updated title from backend
            // Add a small delay to ensure backend title update is complete
            setTimeout(async () => {
              try {
                const sessionsInfo = await multiModelService.getSessionsInfo();
                const updatedSessionInfo = sessionsInfo.find(s => s.id === activeSessionId);
                if (updatedSessionInfo && currentSession.title !== updatedSessionInfo.title) {
                  updateSession(activeSessionId, {
                    title: updatedSessionInfo.title,
                    updatedAt: new Date()
                  });
                  console.log('Updated session title from backend:', updatedSessionInfo.title);
                }
              } catch (error) {
                console.error('Failed to refresh session info:', error);
              }
            }, 100); // 100ms delay
          }
          break;
        } else if (event.type === 'error') {
          const errorMessage = event.error instanceof Error ? event.error.message : (event.error || 'An error occurred');
          console.error('Stream error:', errorMessage, event);
          setError(errorMessage);
          break;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      console.error('Message sending failed:', errorMessage, error);
      setError(errorMessage);
    } finally {
      setThinking(false);
      setStreaming(false);
      setStreamingMessage('');
    }
  };

  const handleStopGeneration = () => {
    setThinking(false);
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
              disabled={disabled || isStreaming || isThinking}
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

          {isStreaming || isThinking ? (
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