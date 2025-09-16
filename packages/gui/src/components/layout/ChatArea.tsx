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
import { ToolConfirmationOutcome } from '@/types';
import { multiModelService } from '@/services/multiModelService';

interface ChatAreaHandle {
  setMessage: (message: string) => void;
  refreshTemplates?: () => void;
}

interface ChatAreaProps {
  onTemplateRefresh?: () => void;
}

export const ChatArea = forwardRef<ChatAreaHandle, ChatAreaProps>(({ onTemplateRefresh }, ref) => {
  const { sessions, activeSessionId } = useAppStore();
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
    <div className="flex-1 flex flex-col h-full min-h-0 overflow-hidden">
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
        <MessageList
          ref={messageListRef}
          messages={activeSession!.messages}
          isStreaming={isStreaming}
          isThinking={isThinking}
          streamingContent={streamingMessage}
          toolConfirmation={toolConfirmation}
          onToolConfirm={handleToolConfirmation}
          onTemplateSaved={onTemplateRefresh}
        />
      )}
      
      {/* Tool mode status bar */}
      <ToolModeStatusBar />
      
      <MessageInput disabled={!activeSession} ref={messageInputRef} />
    </div>    
  );
});

ChatArea.displayName = 'ChatArea';