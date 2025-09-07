import React from 'react';
import { Archive, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import type { CompressionInfo } from '@/types';

interface CompressionNotificationProps {
  compressionInfo: CompressionInfo;
  onDismiss: () => void;
}

export const CompressionNotification: React.FC<CompressionNotificationProps> = ({
  compressionInfo,
  onDismiss,
}) => {
  const compressionRatio = Math.round((1 - compressionInfo.compressionRatio) * 100);
  const tokenReduction = compressionInfo.originalTokenCount - compressionInfo.newTokenCount;

  return (
    <div className="mx-4 mt-4 p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg flex items-start gap-3">
      <Archive className="h-4 w-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 text-sm text-blue-800 dark:text-blue-200">
        <strong>Conversation Compressed</strong>
        <div className="mt-1 text-xs">
          Reduced from {compressionInfo.originalTokenCount.toLocaleString()} to {compressionInfo.newTokenCount.toLocaleString()} tokens 
          ({tokenReduction.toLocaleString()} tokens saved, {compressionRatio}% reduction)
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onDismiss}
        className="h-6 w-6 p-0 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 flex-shrink-0"
      >
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
};