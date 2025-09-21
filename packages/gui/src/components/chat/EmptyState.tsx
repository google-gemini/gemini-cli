/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState } from 'react';
import { Bot, Sparkles, MessageSquare, Zap, FolderPlus, Settings, BookOpen, Lightbulb, ChevronDown, ChevronUp, Folder, Plus, X, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/stores/appStore';
import { WorkspaceSelector } from '@/components/workspace/WorkspaceSelector';
import { ModelSelector } from '@/components/chat/ModelSelector';
import { RoleSelector } from '@/components/chat/RoleSelector';
import { useWorkspaceDirectories } from '@/hooks';

const quickStartSteps = [
  {
    icon: <FolderPlus size={16} />,
    title: "Add Working Folder",
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
  const { currentRole } = useAppStore();
  const { directories: workingDirectories, loading: directoriesLoading } = useWorkspaceDirectories();
  const [showQuickStart, setShowQuickStart] = useState(true);
  const [showWorkspaceSelector, setShowWorkspaceSelector] = useState(false);
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showRoleSelector, setShowRoleSelector] = useState(false);


  const handleAddWorkspace = () => {
    setShowWorkspaceSelector(true);
  };

  const handleSelectModel = () => {
    setShowModelSelector(true);
  };

  const handleChooseRole = () => {
    setShowRoleSelector(true);
  };

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
                    <div
                      key={index}
                      className={`flex items-start gap-3 p-3 rounded-lg ${
                        step.action === "workspace" || step.action === "model" || step.action === "role"
                          ? "bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors border border-transparent hover:border-primary/20"
                          : "bg-muted/30"
                      }`}
                      onClick={
                        step.action === "workspace" ? handleAddWorkspace :
                        step.action === "model" ? handleSelectModel :
                        step.action === "role" ? handleChooseRole : undefined
                      }
                    >
                      <div className={`w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                        (step.action === "workspace" || step.action === "model" || step.action === "role") ? "group-hover:bg-primary/20" : ""
                      }`}>
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
                
                {/* Working Folders */}
                <div className="mt-4 p-4 rounded-lg bg-muted/20 border-l-4 border-primary/30">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <FolderPlus size={16} />
                      <span className="text-sm font-medium">Working Folders</span>
                      {directoriesLoading && (
                        <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleAddWorkspace}
                      className="h-7 px-2 text-xs"
                    >
                      <Plus size={12} className="mr-1" />
                      Add
                    </Button>
                  </div>

                  {workingDirectories.length === 0 ? (
                    <div className="text-xs text-muted-foreground space-y-2">
                      <p className="text-amber-600 dark:text-amber-400">
                        ⚠ No working folders configured
                      </p>
                      <p>Add your project directory so AI can access your code files and provide better assistance.</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="text-xs text-green-600 dark:text-green-400 mb-2">
                        ✓ {workingDirectories.length} working folder{workingDirectories.length === 1 ? '' : 's'} configured
                      </div>
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {workingDirectories.map((directory, index) => (
                          <div
                            key={`${directory}-${index}`}
                            className="flex items-center gap-2 p-2 rounded bg-muted/30"
                          >
                            <Folder size={12} className="text-primary flex-shrink-0" />
                            <div className="flex-1 min-w-0 text-left">
                              <div className="text-xs font-medium font-mono truncate">{directory}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
            <p>• Use <kbd className="px-2 py-1 text-xs bg-muted rounded">@</kbd> to reference files in your working folders</p>
            <p>• Switch models in the header to try different AI capabilities</p>
            <p>• Change roles to get specialized assistance for different tasks</p>
            <p>• Add multiple working folders for complex projects</p>
          </div>
          <p className="pt-2">Gemini CLI can make mistakes. Please verify important information.</p>
        </div>
      </div>

      {/* Working Folder Selector Modal */}
      {showWorkspaceSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <WorkspaceSelector onClose={() => setShowWorkspaceSelector(false)} />
        </div>
      )}

      {/* Model Selector Modal */}
      {showModelSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <ModelSelector onClose={() => setShowModelSelector(false)} />
        </div>
      )}

      {/* Role Selector Modal */}
      {showRoleSelector && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <RoleSelector onClose={() => setShowRoleSelector(false)} />
        </div>
      )}
    </div>
  );
};