import React from 'react';
import { Bot, Sparkles, MessageSquare, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';

const examplePrompts = [
  {
    icon: <Sparkles size={16} />,
    title: "Code Review",
    description: "Review my code for best practices",
    prompt: "Please review the following code for best practices, potential issues, and improvements:"
  },
  {
    icon: <MessageSquare size={16} />,
    title: "Explain Concept",
    description: "Explain a complex programming concept",
    prompt: "Can you explain the concept of"
  },
  {
    icon: <Zap size={16} />,
    title: "Debug Help",
    description: "Help debug an issue",
    prompt: "I'm encountering the following error and need help debugging:"
  },
  {
    icon: <Bot size={16} />,
    title: "Generate Code",
    description: "Generate code for a specific task",
    prompt: "Please generate code that"
  }
];

interface EmptyStateProps {
  onPromptSelect?: (prompt: string) => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onPromptSelect }) => {
  const currentRole = useAppStore((state) => state.currentRole);

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-2xl w-full text-center space-y-8">
        <div className="space-y-4">
          <div className="w-16 h-16 mx-auto bg-primary/10 rounded-2xl flex items-center justify-center">
            <Bot size={32} className="text-primary" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold">
              Welcome to Gemini CLI
            </h1>
            <p className="text-muted-foreground">
              Current role: <span className="font-medium">{currentRole.replace('_', ' ')}</span>
            </p>
            <p className="text-sm text-muted-foreground">
              Start a conversation by typing a message or selecting one of the examples below.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {examplePrompts.map((example, index) => (
            <Card 
              key={index} 
              className="cursor-pointer hover:bg-accent/50 transition-colors group"
              onClick={() => onPromptSelect?.(example.prompt)}
            >
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 group-hover:bg-primary/20 transition-colors">
                    {example.icon}
                  </div>
                  <div className="text-left">
                    <div className="font-medium text-sm mb-1">
                      {example.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {example.description}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p>Gemini CLI can make mistakes. Please verify important information.</p>
        </div>
      </div>
    </div>
  );
};