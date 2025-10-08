/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useRef, forwardRef, useImperativeHandle, useEffect } from 'react';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { EmptyState } from '@/components/chat/EmptyState';
import { CompressionNotification } from '@/components/chat/CompressionNotification';
import { ToolModeStatusBar } from '@/components/chat/ToolModeStatusBar';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ToolConfirmationOutcome, ChatMessage } from '@/types';
import { multiModelService } from '@/services/multiModelService';

interface ChatAreaHandle {
  setMessage: (message: string) => void;
  refreshTemplates?: () => void;
}

interface ChatAreaProps {
  onTemplateRefresh?: () => void;
}

export const ChatArea = forwardRef<ChatAreaHandle, ChatAreaProps>(({ onTemplateRefresh }, ref) => {
  const { sessions, activeSessionId, updateSession } = useAppStore();
  const { isStreaming, isThinking, streamingMessage, error, setError, compressionNotification, setCompressionNotification, toolConfirmation, setApprovalMode } = useChatStore();
  const messageInputRef = useRef<{ setMessage: (message: string) => void }>(null);
  const messageListRef = useRef<{ scrollToBottom: () => void }>(null);




  useImperativeHandle(ref, () => ({
    setMessage: (message: string) => {
      messageInputRef.current?.setMessage(message);
    },
    refreshTemplates: onTemplateRefresh
  }));

  const activeSession = sessions.find(session => session.id === activeSessionId);

  // Auto-scroll when active session changes or new messages are added
  useEffect(() => {
    if (activeSession && messageListRef.current) {
      // Delay to ensure DOM has updated
      const timeoutId = setTimeout(() => {
        messageListRef.current?.scrollToBottom();
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [activeSession?.messages?.length, activeSessionId]);

  // Auto-scroll when streaming or thinking state changes
  useEffect(() => {
    if ((isStreaming || isThinking) && messageListRef.current) {
      const timeoutId = setTimeout(() => {
        messageListRef.current?.scrollToBottom();
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [isStreaming, isThinking]);





  const handlePromptSelect = (prompt: string) => {
    // Focus the message input and set the selected prompt
    messageInputRef.current?.setMessage(prompt);
  };

  const handleDeleteMessage = (messageId: string) => {
    if (!activeSessionId || !activeSession) return;

    const messageIndex = activeSession.messages.findIndex(m => m.id === messageId);
    if (messageIndex === -1) return;

    const message = activeSession.messages[messageIndex];
    const messagesToDelete = new Set([messageId]);

    // Helper function to parse tool response and extract toolCallId
    const parseToolCallId = (msg: ChatMessage): string | null => {
      if (msg.role !== 'tool') return null;

      // Try to parse various tool response formats to extract toolCallId
      try {
        const content = msg.content;

        // Harmony format
        const harmonyMatch = content.match(/<\|start\|>(\w+)\s+to=assistant[\s\S]*?<\|message\|>([\s\S]*?)<\|end\|>/);
        if (harmonyMatch) {
          const parsedMessage = JSON.parse(harmonyMatch[2].trim());
          return parsedMessage.tool_call_id || null;
        }
      } catch {
        // Parsing failed, continue
      }

      return null;
    };

    // If this is an assistant message with tool calls, delete all corresponding tool responses
    if (message.role === 'assistant' && message.toolCalls && message.toolCalls.length > 0) {
      const toolCallIds = message.toolCalls.map(tc => tc.id);

      // Find all tool response messages that match these tool call IDs
      for (let i = messageIndex + 1; i < activeSession.messages.length; i++) {
        const nextMsg = activeSession.messages[i];
        if (nextMsg.role === 'tool') {
          const toolCallId = parseToolCallId(nextMsg);
          if (toolCallId && toolCallIds.includes(toolCallId)) {
            messagesToDelete.add(nextMsg.id);
          }
        } else {
          // Stop when we hit a non-tool message
          break;
        }
      }
    }

    // If this is a tool response, delete the assistant message and all other tool responses in the group
    if (message.role === 'tool') {
      const myToolCallId = parseToolCallId(message);

      // Find the assistant message with tool calls before this response
      for (let i = messageIndex - 1; i >= 0; i--) {
        const prevMsg = activeSession.messages[i];

        if (prevMsg.role === 'assistant' && prevMsg.toolCalls && prevMsg.toolCalls.length > 0) {
          // Check if this assistant message contains the toolCallId we're looking for
          const hasMatchingToolCall = myToolCallId
            ? prevMsg.toolCalls.some(tc => tc.id === myToolCallId)
            : true; // If we can't parse toolCallId, assume first assistant with toolCalls

          if (hasMatchingToolCall) {
            messagesToDelete.add(prevMsg.id);
            const toolCallIds = prevMsg.toolCalls.map(tc => tc.id);

            // Delete all tool responses in this group
            for (let j = i + 1; j < activeSession.messages.length; j++) {
              const msg = activeSession.messages[j];
              if (msg.role === 'tool') {
                const callId = parseToolCallId(msg);
                if (!callId || toolCallIds.includes(callId)) {
                  messagesToDelete.add(msg.id);
                }
              } else {
                break;
              }
            }
            break;
          }
        } else if (prevMsg.role !== 'tool') {
          // Stop if we hit a non-tool, non-assistant message
          break;
        }
      }
    }

    // Filter out the messages to delete
    const updatedMessages = activeSession.messages.filter(m => !messagesToDelete.has(m.id));

    // Update the session
    updateSession(activeSessionId, {
      messages: updatedMessages,
      updatedAt: new Date()
    });
  };

  const handleToolConfirmation = async (outcome: ToolConfirmationOutcome) => {
    if (toolConfirmation?.onConfirm) {
      toolConfirmation.onConfirm(outcome);
    }
    
    // Update approval mode state when user clicks "Always allow" (after calling original handler)
    if (outcome === ToolConfirmationOutcome.ProceedAlways) {
      // Determine the new approval mode based on the tool type
      const newMode = toolConfirmation?.type === 'edit' ? 'autoEdit' : 'yolo';
      
      try {
        // Update both frontend state and backend configuration
        await multiModelService.setApprovalMode(newMode);
        setApprovalMode(newMode);
        console.log(`Approval mode updated to: ${newMode}`);
      } catch (error) {
        console.error('Failed to update approval mode:', error);
        // Don't update frontend state if backend update fails
      }
    }
  };

  const showEmptyState = !activeSession || (activeSession && activeSession.messages.length === 0);

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden relative">
      {/* Error notification */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-3">
          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1 text-sm text-destructive">
            <strong>Error:</strong>
            <div className="mt-1 whitespace-pre-line leading-relaxed">
              {error}
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setError(null)}
            className="h-6 w-6 p-0 text-destructive hover:bg-destructive/20 flex-shrink-0"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* Compression notification */}
      {compressionNotification && (
        <CompressionNotification 
          compressionInfo={compressionNotification}
          onDismiss={() => setCompressionNotification(null)}
        />
      )}

      {showEmptyState ? (
        <EmptyState onPromptSelect={handlePromptSelect} />
      ) : (
        <>
          <MessageList
            ref={messageListRef}
            messages={activeSession!.messages}
            isStreaming={isStreaming}
            isThinking={isThinking}
            streamingContent={streamingMessage}
            toolConfirmation={toolConfirmation}
            onToolConfirm={handleToolConfirmation}
            onTemplateSaved={onTemplateRefresh}
            onDeleteMessage={handleDeleteMessage}
          />
        </>
      )}
      
      {/* Tool mode status bar */}
      <ToolModeStatusBar />
      
      <MessageInput disabled={!activeSession} ref={messageInputRef} />
    </div>    
  );
});

ChatArea.displayName = 'ChatArea';