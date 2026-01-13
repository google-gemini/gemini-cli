import { Message } from './Message';
import type { ChatMessage, ToolRequest } from '../../types/chat';

interface MessageListProps {
  messages: ChatMessage[];
  pendingTools: ToolRequest[];
  onApproveTool: (callId: string) => void;
  onRejectTool: (callId: string) => void;
}

export function MessageList({
  messages,
  pendingTools,
  onApproveTool,
  onRejectTool,
}: MessageListProps): JSX.Element {
  return (
    <div className="space-y-6">
      {messages.map((message, index) => (
        <Message
          key={index}
          message={message}
          pendingTools={
            message.role === 'assistant'
              ? pendingTools.filter((t) => t.messageIndex === index)
              : []
          }
          onApproveTool={onApproveTool}
          onRejectTool={onRejectTool}
        />
      ))}
    </div>
  );
}
