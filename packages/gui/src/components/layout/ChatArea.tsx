import React from 'react';
import { MessageList } from '@/components/chat/MessageList';
import { MessageInput } from '@/components/chat/MessageInput';
import { EmptyState } from '@/components/chat/EmptyState';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';

export const ChatArea: React.FC = () => {
  const { sessions, activeSessionId } = useAppStore();
  const { isStreaming, isThinking, streamingMessage } = useChatStore();

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