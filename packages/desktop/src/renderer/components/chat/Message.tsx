import { ToolCallCard } from '../tools/ToolCallCard';
import type { ChatMessage, ToolRequest } from '../../types/chat';

interface MessageProps {
  message: ChatMessage;
  pendingTools: ToolRequest[];
  onApproveTool: (callId: string) => void;
  onRejectTool: (callId: string) => void;
}

export function Message({
  message,
  pendingTools,
  onApproveTool,
  onRejectTool,
}: MessageProps): JSX.Element {
  const isUser = message.role === 'user';

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[80%] ${
          isUser
            ? 'bg-blue-500 text-white rounded-2xl rounded-br-md px-4 py-2'
            : 'space-y-3'
        }`}
      >
        {isUser ? (
          // User message
          <p className="whitespace-pre-wrap">{message.content}</p>
        ) : (
          // Assistant message
          <>
            {message.content && (
              <div className="prose prose-neutral dark:prose-invert max-w-none">
                <p className="whitespace-pre-wrap text-neutral-800 dark:text-neutral-200">
                  {message.content}
                </p>
              </div>
            )}

            {/* Tool calls */}
            {message.toolCalls?.map((toolCall) => {
              const pendingTool = pendingTools.find(
                (t) => t.callId === toolCall.callId
              );
              return (
                <ToolCallCard
                  key={toolCall.callId}
                  toolCall={toolCall}
                  isPending={!!pendingTool}
                  onApprove={() => onApproveTool(toolCall.callId)}
                  onReject={() => onRejectTool(toolCall.callId)}
                />
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
