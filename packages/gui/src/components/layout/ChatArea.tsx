import React from 'react';
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

  const activeSession = sessions.find(session => session.id === activeSessionId);

  if (!activeSession) {
    return (
      <div className="flex-1 flex flex-col">
        <EmptyState />
        <MessageInput disabled />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full">
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
      
      <MessageList
        messages={activeSession.messages}
        isStreaming={isStreaming}
        isThinking={isThinking}
        streamingContent={streamingMessage}
      />
      <MessageInput />
    </div>    
  );
};