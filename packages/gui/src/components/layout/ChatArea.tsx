import React, { useRef } from 'react';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { EmptyState } from '@/components/chat/EmptyState';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export const ChatArea: React.FC = () => {
  const { sessions, activeSessionId } = useAppStore();
  const { isStreaming, isThinking, streamingMessage, error, setError } = useChatStore();
  const messageInputRef = useRef<{ setMessage: (message: string) => void }>(null);

  const activeSession = sessions.find(session => session.id === activeSessionId);

  const handlePromptSelect = (prompt: string) => {
    // Focus the message input and set the selected prompt
    messageInputRef.current?.setMessage(prompt);
  };

  const showEmptyState = !activeSession || (activeSession && activeSession.messages.length === 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Error notification */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-3">
          <AlertCircle className="h-4 w-4 text-destructive flex-shrink-0" />
          <div className="flex-1 text-sm text-destructive">
            <strong>Error:</strong> {error}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setError(null)}
            className="h-6 w-6 p-0 text-destructive hover:bg-destructive/20"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
      
      {showEmptyState ? (
        <EmptyState onPromptSelect={handlePromptSelect} />
      ) : (
        <MessageList
          messages={activeSession!.messages}
          isStreaming={isStreaming}
          isThinking={isThinking}
          streamingContent={streamingMessage}
        />
      )}
      
      <MessageInput disabled={!activeSession} ref={messageInputRef} />
    </div>    
  );
};