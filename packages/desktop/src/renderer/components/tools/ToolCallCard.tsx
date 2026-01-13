import { useState } from 'react';
import type { ToolCall } from '../../types/chat';

interface ToolCallCardProps {
  toolCall: ToolCall;
  isPending: boolean;
  onApprove: () => void;
  onReject: () => void;
}

export function ToolCallCard({
  toolCall,
  isPending,
  onApprove,
  onReject,
}: ToolCallCardProps): JSX.Element {
  const [isExpanded, setIsExpanded] = useState(true);

  const statusColors = {
    pending: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
    approved: 'border-green-500 bg-green-50 dark:bg-green-900/20',
    rejected: 'border-red-500 bg-red-50 dark:bg-red-900/20',
    executing: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20',
    success: 'border-green-500 bg-green-50 dark:bg-green-900/20',
    error: 'border-red-500 bg-red-50 dark:bg-red-900/20',
  };

  const status = isPending
    ? 'pending'
    : toolCall.status || 'success';

  return (
    <div
      className={`rounded-lg border-l-4 ${statusColors[status]} overflow-hidden`}
    >
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          {/* Tool icon */}
          <div className="p-1 rounded bg-neutral-200 dark:bg-neutral-700">
            <svg
              className="w-4 h-4 text-neutral-600 dark:text-neutral-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          </div>

          <span className="font-medium text-sm text-neutral-700 dark:text-neutral-200">
            {toolCall.name}
          </span>

          {/* Status badge */}
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              isPending
                ? 'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200'
                : 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200'
            }`}
          >
            {isPending ? 'Awaiting approval' : toolCall.status || 'Completed'}
          </span>
        </div>

        {/* Expand/collapse icon */}
        <svg
          className={`w-4 h-4 text-neutral-400 transition-transform ${
            isExpanded ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Arguments */}
          {toolCall.args && (
            <pre className="text-xs bg-neutral-100 dark:bg-neutral-800 rounded p-2 overflow-x-auto">
              {JSON.stringify(toolCall.args, null, 2)}
            </pre>
          )}

          {/* Result */}
          {toolCall.result && (
            <div className="text-sm text-neutral-600 dark:text-neutral-300">
              <pre className="bg-neutral-100 dark:bg-neutral-800 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                {typeof toolCall.result === 'string'
                  ? toolCall.result
                  : JSON.stringify(toolCall.result, null, 2)}
              </pre>
            </div>
          )}

          {/* Approval buttons */}
          {isPending && (
            <div className="flex gap-2 pt-2">
              <button
                onClick={onApprove}
                className="flex-1 px-3 py-1.5 bg-green-500 hover:bg-green-600 text-white text-sm font-medium rounded-md transition-colors"
              >
                Approve
              </button>
              <button
                onClick={onReject}
                className="flex-1 px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-md transition-colors"
              >
                Reject
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
