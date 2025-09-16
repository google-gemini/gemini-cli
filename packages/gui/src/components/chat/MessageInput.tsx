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
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);
  
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

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    // Start thinking state first
    // console.log('[MessageInput] Setting thinking to true, current state:', { isThinking, isStreaming });
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
      const { stream, cancel } = await multiModelService.sendMessage([newUserMessage]);

      // Save the cancel function for stop button
      streamCleanupRef.current = cancel;

      let assistantContent = '';
      let currentAssistantMessageId: string | null = null;
      let hasCreatedInitialMessage = false;

      for await (const event of stream) {
        // Check if request was aborted
        if (abortControllerRef.current?.signal.aborted) {
          console.log('Stream processing aborted by user');
          break;
        }

        setThinking(false);
        
        if (event.type === 'content' || event.type === 'content_delta') {
          setStreaming(true);
          assistantContent += event.content;
          setStreamingMessage(assistantContent);
          
          // Create assistant message immediately on first content
          if (!hasCreatedInitialMessage && assistantContent.trim()) {
            const assistantMessage: ChatMessage = {
              id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-assistant`,
              role: 'assistant',
              content: assistantContent,
              timestamp: new Date()
            };
            currentAssistantMessageId = assistantMessage.id;
            hasCreatedInitialMessage = true;
            
            // Add initial assistant message to session immediately
            const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
            if (currentSession) {
              updateSession(activeSessionId, {
                messages: [...currentSession.messages, assistantMessage],
                updatedAt: new Date()
              });
            }
          } else if (currentAssistantMessageId) {
            // Update existing assistant message with new content
            const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
            if (currentSession) {
              const messageIndex = currentSession.messages.findIndex(m => m.id === currentAssistantMessageId);
              if (messageIndex >= 0) {
                const updatedMessages = [...currentSession.messages];
                updatedMessages[messageIndex] = {
                  ...updatedMessages[messageIndex],
                  content: assistantContent
                };
                
                updateSession(activeSessionId, {
                  messages: updatedMessages,
                  updatedAt: new Date()
                });
              }
            }
          }
        } 
        else if (event.type === 'tool_call') {
          // Finalize current assistant message streaming first
          if (currentAssistantMessageId && assistantContent.trim()) {
            // Update the existing message with final content
            const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
            if (currentSession) {
              const messageIndex = currentSession.messages.findIndex(m => m.id === currentAssistantMessageId);
              if (messageIndex >= 0) {
                const updatedMessages = [...currentSession.messages];
                updatedMessages[messageIndex] = {
                  ...updatedMessages[messageIndex],
                  content: assistantContent,
                  toolCalls: event.toolCall ? [event.toolCall] : undefined
                };
                
                updateSession(activeSessionId, {
                  messages: updatedMessages,
                  updatedAt: new Date()
                });
              }
            }
            
            setStreaming(false);
            setStreamingMessage('');
            // Reset for next message
            assistantContent = '';
            currentAssistantMessageId = null;
            hasCreatedInitialMessage = false;
          } else if (event.toolCall) {
            // Create a new message for tool calls if there's no current assistant message
            const toolCallMessage: ChatMessage = {
              id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-tool-call`,
              role: 'assistant',
              content: '', // Tool calls don't have content, just the calls
              toolCalls: [event.toolCall],
              timestamp: new Date()
            };
            
            // Add tool call message to session immediately
            const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
            if (currentSession) {
              updateSession(activeSessionId, {
                messages: [...currentSession.messages, toolCallMessage],
                updatedAt: new Date()
              });
            }
          }
        } 
        else if (event.type === 'tool_response') {
          // Handle tool response events - create tool response message immediately
          if (event.toolCallId && event.toolName) {
            const toolResponseMessage: ChatMessage = {
              id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-tool-response`,
              role: 'tool',
              content: event.content || `Tool ${event.toolName} completed`,
              timestamp: new Date(),
              toolSuccess: event.toolSuccess,  // Save success/failure status
              toolResponseData: event.toolResponseData  // Save structured data
            };
            
            // Add tool response message immediately
            const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
            if (currentSession) {
              updateSession(activeSessionId, {
                messages: [...currentSession.messages, toolResponseMessage],
                updatedAt: new Date()
              });
            }
            
            // Reset state for potential next LLM response
            assistantContent = '';
            currentAssistantMessageId = null;
            hasCreatedInitialMessage = false;
          }
        }
        else if (event.type === 'compression') {
          // Handle compression event - show notification and add info message
          if (event.compressionInfo) {
            setCompressionNotification(event.compressionInfo);
            // Auto-hide notification after 5 seconds
            setTimeout(() => setCompressionNotification(null), 5000);
            
            // Add compression info message to chat immediately
            const compressionMessage: ChatMessage = {
              id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-compression`,
              role: 'system',
              content: `Chat compressed from ${event.compressionInfo.originalTokenCount} to ${event.compressionInfo.newTokenCount} tokens`,
              timestamp: new Date()
            };
            
            const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
            if (currentSession) {
              updateSession(activeSessionId, {
                messages: [...currentSession.messages, compressionMessage],
                updatedAt: new Date()
              });
            }
          }
        } else if (event.type === 'done' || event.type === 'message_complete') {
          // Final content update for streaming message if we had content
          if (currentAssistantMessageId && assistantContent) {
            const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
            if (currentSession) {
              const messageIndex = currentSession.messages.findIndex(m => m.id === currentAssistantMessageId);
              if (messageIndex >= 0) {
                const updatedMessages = [...currentSession.messages];
                updatedMessages[messageIndex] = {
                  ...updatedMessages[messageIndex],
                  content: assistantContent
                };
                
                updateSession(activeSessionId, {
                  messages: updatedMessages,
                  updatedAt: new Date()
                });
              }
            }
          }
          
          // Clear streaming content since we've finalized the message
          setStreamingMessage('');

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
              // console.log('Refreshed messages from backend, total:', chatMessages.length);

              // Also refresh session info for title updates
              const sessionsInfo = await multiModelService.getSessionsInfo();
              const updatedSessionInfo = sessionsInfo.find(s => s.id === activeSessionId);
              if (updatedSessionInfo) {
                const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
                if (currentSession && currentSession.title !== updatedSessionInfo.title) {
                  updateSession(activeSessionId, {
                    title: updatedSessionInfo.title,
                    updatedAt: new Date()
                  });
                  // console.log('Updated session title from backend:', updatedSessionInfo.title);
                }
              }
            } catch (error) {
              console.error('Failed to refresh messages and session info:', error);
            }
          }, 500); // 500ms delay to ensure backend processing is complete
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
      // console.log('[MessageInput] Finally block - resetting states');
      setThinking(false);
      setStreaming(false);
      setStreamingMessage('');
      // Clear abort controller and stream cleanup
      abortControllerRef.current = null;
      streamCleanupRef.current = null;
    }
  };

  const handleStopGeneration = () => {
    console.log('User requested to stop generation');

    // Cancel the current stream if active
    if (streamCleanupRef.current) {
      streamCleanupRef.current();
      console.log('Cancelled current stream');
      streamCleanupRef.current = null;
    }

    // Abort the current request if active (fallback)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort('User cancelled request');
      console.log('Aborted current stream request');
      abortControllerRef.current = null;
    }

    // Reset UI states immediately
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
              disabled={false}
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