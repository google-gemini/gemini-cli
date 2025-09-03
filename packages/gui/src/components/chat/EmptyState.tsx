import React, { useState } from 'react';
import { Bot, Sparkles, MessageSquare, Zap, FolderPlus, Settings, BookOpen, Lightbulb, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/stores/appStore';

const quickStartSteps = [
  {
    icon: <FolderPlus size={16} />,
    title: "Add Workspace",
    description: "Add your project directory so AI can access your code files",
    action: "workspace"
  },
  {
    icon: <Settings size={16} />,
    title: "Select AI Model",
    description: "Choose the AI provider and model from the header",
    action: "model"
  },
  {
    icon: <Bot size={16} />,
    title: "Choose Role",
    description: "Select an AI assistant role for specialized help",
    action: "role"
  }
];

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
    icon: <BookOpen size={16} />,
    title: "Generate Code",
    description: "Generate code for a specific task",
    prompt: "Please generate code that"
  }
];

interface EmptyStateProps {
  onPromptSelect?: (prompt: string) => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onPromptSelect }) => {
  const { currentRole, currentWorkspace, workspaces } = useAppStore();
  const [showQuickStart, setShowQuickStart] = useState(true);
  
  const hasWorkspace = currentWorkspace || workspaces.length > 0;

  return (
    <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
      <div className="max-w-4xl w-full text-center space-y-8">
        {/* Welcome Header */}
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
          </div>
        </div>

        {/* Quick Start Guide */}
        <Card className="text-left">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Lightbulb size={20} className="text-primary" />
                <h3 className="text-lg font-semibold">Quick Start Guide</h3>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowQuickStart(!showQuickStart)}
                className="h-8 w-8 p-0"
              >
                {showQuickStart ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </Button>
            </div>
            
            {showQuickStart && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground mb-4">
                  Get the most out of Gemini CLI by following these steps:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {quickStartSteps.map((step, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 rounded-lg bg-muted/30">
                      <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                        {step.icon}
                      </div>
                      <div>
                        <div className="font-medium text-sm mb-1">
                          {step.title}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {step.description}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Workspace Status */}
                <div className="mt-4 p-3 rounded-lg bg-muted/20 border-l-4 border-primary/30">
                  <div className="flex items-center gap-2 mb-1">
                    <FolderPlus size={14} />
                    <span className="text-sm font-medium">Workspace Status</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {hasWorkspace ? (
                      <span className="text-green-600 dark:text-green-400">
                        ✓ Workspace configured - AI can access your project files
                      </span>
                    ) : (
                      <span className="text-amber-600 dark:text-amber-400">
                        ⚠ No workspace added - Add your project directory for better assistance
                      </span>
                    )}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Example Prompts */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold flex items-center justify-center gap-2">
            <MessageSquare size={20} />
            Example Prompts
          </h3>
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
        </div>

        {/* Tips */}
        <div className="space-y-2 text-xs text-muted-foreground">
          <p><strong>Pro Tips:</strong></p>
          <div className="space-y-1 max-w-2xl mx-auto">
            <p>• Use <kbd className="px-2 py-1 text-xs bg-muted rounded">@</kbd> to reference files in your workspace</p>
            <p>• Switch models in the header to try different AI capabilities</p>
            <p>• Change roles to get specialized assistance for different tasks</p>
            <p>• Add multiple workspace directories for complex projects</p>
          </div>
          <p className="pt-2">Gemini CLI can make mistakes. Please verify important information.</p>
        </div>
      </div>
    </div>
  );
};