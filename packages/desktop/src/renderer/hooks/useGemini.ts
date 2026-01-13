import { useState, useCallback, useEffect, useRef } from 'react';
import type { ChatMessage, ToolRequest, ToolCall, GeminiStreamEvent } from '../types/chat';

export interface UseGeminiReturn {
  messages: ChatMessage[];
  isStreaming: boolean;
  pendingTools: ToolRequest[];
  sendMessage: (text: string) => Promise<void>;
  abort: () => void;
  approveTool: (callId: string) => void;
  rejectTool: (callId: string) => void;
  approveAllTools: () => void;
  rejectAllTools: () => void;
  clearMessages: () => void;
}

export function useGemini(): UseGeminiReturn {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [pendingTools, setPendingTools] = useState<ToolRequest[]>([]);
  const currentMessageIndex = useRef(0);

  // Subscribe to stream events
  useEffect(() => {
    const unsubStream = window.api.gemini.onStreamEvent((event: GeminiStreamEvent) => {
      switch (event.type) {
        case 'content':
          // Append content to the last assistant message
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastIndex = newMessages.length - 1;
            if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
              newMessages[lastIndex] = {
                ...newMessages[lastIndex],
                content: newMessages[lastIndex].content + (event.value as string),
              };
            }
            return newMessages;
          });
          break;

        case 'tool_call_request': {
          const toolRequest = event.value as {
            callId: string;
            name: string;
            args: Record<string, unknown>;
          };

          // Add tool call to the current assistant message
          setMessages((prev) => {
            const newMessages = [...prev];
            const lastIndex = newMessages.length - 1;
            if (lastIndex >= 0 && newMessages[lastIndex].role === 'assistant') {
              const toolCall: ToolCall = {
                callId: toolRequest.callId,
                name: toolRequest.name,
                args: toolRequest.args,
                status: 'pending',
              };
              newMessages[lastIndex] = {
                ...newMessages[lastIndex],
                toolCalls: [...(newMessages[lastIndex].toolCalls || []), toolCall],
              };
            }
            return newMessages;
          });
          break;
        }

        case 'tool_call_response': {
          const toolResponse = event.value as {
            callId: string;
            result?: unknown;
            error?: string;
          };

          // Update the tool call status
          setMessages((prev) => {
            const newMessages = [...prev];
            for (let i = newMessages.length - 1; i >= 0; i--) {
              const msg = newMessages[i];
              if (msg.role === 'assistant' && msg.toolCalls) {
                const toolIndex = msg.toolCalls.findIndex(
                  (tc) => tc.callId === toolResponse.callId
                );
                if (toolIndex !== -1) {
                  const newToolCalls = [...msg.toolCalls];
                  newToolCalls[toolIndex] = {
                    ...newToolCalls[toolIndex],
                    status: toolResponse.error ? 'error' : 'success',
                    result: toolResponse.result || toolResponse.error,
                  };
                  newMessages[i] = { ...msg, toolCalls: newToolCalls };
                  break;
                }
              }
            }
            return newMessages;
          });
          break;
        }

        case 'finished':
          setIsStreaming(false);
          // Show notification on completion
          window.api.notifications.show('Task Complete', 'Gemini has finished processing');
          break;

        case 'error':
          setIsStreaming(false);
          console.error('Gemini error:', event.value);
          break;

        case 'user_cancelled':
          setIsStreaming(false);
          break;
      }
    });

    // Subscribe to tool confirmation requests
    const unsubToolRequest = window.api.gemini.onToolConfirmationRequest((request: unknown) => {
      const toolRequest = request as {
        correlationId: string;
        toolName: string;
        args: Record<string, unknown>;
      };

      setPendingTools((prev) => [
        ...prev,
        {
          callId: toolRequest.correlationId,
          name: toolRequest.toolName,
          args: toolRequest.args,
          messageIndex: currentMessageIndex.current,
        },
      ]);
    });

    return () => {
      unsubStream();
      unsubToolRequest();
    };
  }, []);

  const sendMessage = useCallback(async (text: string): Promise<void> => {
    // Add user message
    setMessages((prev) => [...prev, { role: 'user', content: text }]);

    // Add empty assistant message (will be filled by streaming)
    setMessages((prev) => {
      currentMessageIndex.current = prev.length;
      return [...prev, { role: 'assistant', content: '' }];
    });

    setIsStreaming(true);

    try {
      const promptId = crypto.randomUUID();
      await window.api.gemini.send(text, promptId);
    } catch (error) {
      console.error('Failed to send message:', error);
      setIsStreaming(false);
    }
  }, []);

  const abort = useCallback((): void => {
    window.api.gemini.abort();
    setIsStreaming(false);
  }, []);

  const approveTool = useCallback((callId: string): void => {
    window.api.tools.approve(callId);
    setPendingTools((prev) => prev.filter((t) => t.callId !== callId));

    // Update tool status in messages
    setMessages((prev) => {
      const newMessages = [...prev];
      for (let i = newMessages.length - 1; i >= 0; i--) {
        const msg = newMessages[i];
        if (msg.role === 'assistant' && msg.toolCalls) {
          const toolIndex = msg.toolCalls.findIndex((tc) => tc.callId === callId);
          if (toolIndex !== -1) {
            const newToolCalls = [...msg.toolCalls];
            newToolCalls[toolIndex] = {
              ...newToolCalls[toolIndex],
              status: 'executing',
            };
            newMessages[i] = { ...msg, toolCalls: newToolCalls };
            break;
          }
        }
      }
      return newMessages;
    });
  }, []);

  const rejectTool = useCallback((callId: string): void => {
    window.api.tools.reject(callId);
    setPendingTools((prev) => prev.filter((t) => t.callId !== callId));

    // Update tool status in messages
    setMessages((prev) => {
      const newMessages = [...prev];
      for (let i = newMessages.length - 1; i >= 0; i--) {
        const msg = newMessages[i];
        if (msg.role === 'assistant' && msg.toolCalls) {
          const toolIndex = msg.toolCalls.findIndex((tc) => tc.callId === callId);
          if (toolIndex !== -1) {
            const newToolCalls = [...msg.toolCalls];
            newToolCalls[toolIndex] = {
              ...newToolCalls[toolIndex],
              status: 'rejected',
            };
            newMessages[i] = { ...msg, toolCalls: newToolCalls };
            break;
          }
        }
      }
      return newMessages;
    });
  }, []);

  const approveAllTools = useCallback((): void => {
    pendingTools.forEach((tool) => {
      window.api.tools.approve(tool.callId);
    });
    setPendingTools([]);
  }, [pendingTools]);

  const rejectAllTools = useCallback((): void => {
    pendingTools.forEach((tool) => {
      window.api.tools.reject(tool.callId);
    });
    setPendingTools([]);
  }, [pendingTools]);

  const clearMessages = useCallback((): void => {
    setMessages([]);
    setPendingTools([]);
    currentMessageIndex.current = 0;
  }, []);

  return {
    messages,
    isStreaming,
    pendingTools,
    sendMessage,
    abort,
    approveTool,
    rejectTool,
    approveAllTools,
    rejectAllTools,
    clearMessages,
  };
}
