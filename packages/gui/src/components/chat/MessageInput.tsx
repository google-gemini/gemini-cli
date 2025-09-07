import React, { useState, useRef, useCallback, useImperativeHandle, forwardRef } from 'react';
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

interface MessageInputRef {
  setMessage: (message: string) => void;
}

export const MessageInput = forwardRef<MessageInputRef, MessageInputProps>(({ disabled = false }, ref) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const { activeSessionId, updateSession } = useAppStore();
  const { isStreaming, isThinking, setStreaming, setThinking, setStreamingMessage, setError, setCompressionNotification } = useChatStore();

  useImperativeHandle(ref, () => ({
    setMessage: (newMessage: string) => {
      setMessage(newMessage);
      // Focus the textarea after setting the message
      setTimeout(() => {
        textareaRef.current?.focus();
        adjustTextareaHeight();
      }, 0);
    }
  }), []);

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
    console.log('[MessageInput] Setting thinking to true, current state:', { isThinking, isStreaming });
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
        content: userMessage.content,
        timestamp: userMessage.timestamp
      };
      const stream = await multiModelService.sendMessage([newUserMessage]);

      let assistantContent = '';
      const assistantMessage: ChatMessage = {
        id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-assistant`,
        role: 'assistant',
        content: '',
        timestamp: new Date()
      };

      for await (const event of stream) {
        setThinking(false);
        
        if (event.type === 'content' || event.type === 'content_delta') {
          setStreaming(true);
          assistantContent += event.content;
          setStreamingMessage(assistantContent);
        } 
        else if (event.type === 'tool_call') {
          // Add tool call to assistant message immediately
          if (event.toolCall) {
            if (!assistantMessage.toolCalls) {
              assistantMessage.toolCalls = [];
            }
            assistantMessage.toolCalls.push(event.toolCall);
            
            // Update the session immediately to show the tool call
            const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
            if (currentSession) {
              const existingMessageIndex = currentSession.messages.findIndex(m => m.id === assistantMessage.id);
              let updatedMessages;
              
              if (existingMessageIndex >= 0) {
                // Update existing message
                updatedMessages = [...currentSession.messages];
                updatedMessages[existingMessageIndex] = { ...assistantMessage };
              } else {
                // Add new message
                updatedMessages = [...currentSession.messages, assistantMessage];
              }
              
              updateSession(activeSessionId, {
                messages: updatedMessages,
                updatedAt: new Date()
              });
            }
          }
        } 
        else if (event.type === 'tool_response') {
          // Handle tool response events - refresh messages to show tool responses immediately
          console.log('Tool response received:', event.toolName, event.toolCallId);
          try {
            const backendMessages = await multiModelService.getDisplayMessages(activeSessionId);
            const chatMessages = backendMessages
              .map((msg, index) => ({
                id: `${activeSessionId}-${index}`,
                role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
                content: msg.content,
                timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
                toolCalls: msg.toolCalls
              }));
            
            updateSession(activeSessionId, { 
              messages: chatMessages,
              updatedAt: new Date() 
            });
            console.log('Updated messages after tool response, total:', chatMessages.length);
          } catch (error) {
            console.error('Failed to refresh messages after tool response:', error);
          }
        }
        else if (event.type === 'compression') {
          // Handle compression event - show notification and refresh conversation history
          console.log('Chat compression occurred:', event.compressionInfo);
          if (event.compressionInfo) {
            setCompressionNotification(event.compressionInfo);
            // Auto-hide notification after 5 seconds
            setTimeout(() => setCompressionNotification(null), 5000);
          }
          
          try {
            const backendMessages = await multiModelService.getDisplayMessages(activeSessionId);
            const chatMessages = backendMessages
              .map((msg, index) => ({
                id: `${activeSessionId}-${index}`,
                role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
                content: msg.content,
                timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
                toolCalls: msg.toolCalls
              }));
            
            updateSession(activeSessionId, { 
              messages: chatMessages,
              updatedAt: new Date() 
            });
            console.log('Updated conversation history after compression, total messages:', chatMessages.length);
          } catch (error) {
            console.error('Failed to refresh messages after compression:', error);
          }
        } else if (event.type === 'done' || event.type === 'message_complete') {
          assistantMessage.content = assistantContent;
          
          // Update assistant message in session (may already exist from tool calls)
          const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
          if (currentSession) {
            const existingMessageIndex = currentSession.messages.findIndex(m => m.id === assistantMessage.id);
            let updatedMessages;
            
            if (existingMessageIndex >= 0) {
              // Update existing message with final content
              updatedMessages = [...currentSession.messages];
              updatedMessages[existingMessageIndex] = { ...assistantMessage };
            } else {
              // Add new message if it doesn't exist yet
              updatedMessages = [...currentSession.messages, assistantMessage];
            }
            
            updateSession(activeSessionId, {
              messages: updatedMessages,
              updatedAt: new Date()
            });

            // Refresh messages from backend to get any tool responses
            // Add a small delay to ensure backend processing is complete
            setTimeout(async () => {
              try {
                // Get updated messages from backend (includes any tool responses)
                const backendMessages = await multiModelService.getDisplayMessages(activeSessionId);
                const chatMessages = backendMessages
                  .map((msg, index) => ({
                    id: `${activeSessionId}-${index}`,
                    role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
                    content: msg.content,
                    timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
                    toolCalls: msg.toolCalls
                  }));
                
                updateSession(activeSessionId, { 
                  messages: chatMessages,
                  updatedAt: new Date() 
                });
                console.log('Refreshed messages from backend, total:', chatMessages.length);

                // Also refresh session info for title updates
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
                console.error('Failed to refresh messages and session info:', error);
              }
            }, 500); // 500ms delay to ensure backend processing is complete
          }
          break;
        } 
        else if (event.type === 'error') {
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
      console.log('[MessageInput] Finally block - resetting states');
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
});

MessageInput.displayName = 'MessageInput';