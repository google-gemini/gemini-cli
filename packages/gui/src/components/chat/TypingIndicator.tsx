import type React from 'react';
import { Bot } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Card, CardContent } from '@/components/ui/Card';

interface TypingIndicatorProps {
  className?: string;
}

export const TypingIndicator: React.FC<TypingIndicatorProps> = ({ className }) => (
  <div className={cn("flex gap-3 max-w-4xl", className)}>
    {/* Avatar */}
    <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-secondary">
      <Bot size={16} />
    </div>

    {/* Typing animation */}
    <div className="flex-1 min-w-0">
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-1">
            <span className="text-sm text-muted-foreground mr-2">AI is thinking</span>
            <div className="flex gap-1">
              <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <div className="w-2 h-2 bg-muted-foreground/60 rounded-full animate-bounce" />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
);