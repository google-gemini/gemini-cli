import { useState, useRef, useEffect } from 'react';
import { MessageList } from './MessageList';
import { InputArea } from './InputArea';
import type { UseGeminiReturn } from '../../hooks/useGemini';

interface ChatViewProps {
  gemini: UseGeminiReturn;
}

export function ChatView({ gemini }: ChatViewProps): JSX.Element {
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [gemini.messages]);

  const handleSubmit = async (): Promise<void> => {
    if (!input.trim() || gemini.isStreaming) return;

    const message = input.trim();
    setInput('');
    await gemini.sendMessage(message);
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-neutral-900">
      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {gemini.messages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-neutral-400">
            <div className="text-center space-y-2">
              <p className="text-lg">Start a conversation</p>
              <p className="text-sm">Ask Gemini to help with your code</p>
            </div>
          </div>
        ) : (
          <>
            <MessageList
              messages={gemini.messages}
              pendingTools={gemini.pendingTools}
              onApproveTool={gemini.approveTool}
              onRejectTool={gemini.rejectTool}
            />
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="border-t border-neutral-200 dark:border-neutral-700 p-4">
        <InputArea
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          isStreaming={gemini.isStreaming}
          onAbort={gemini.abort}
        />
      </div>
    </div>
  );
}
