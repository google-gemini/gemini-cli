import React, { useState } from 'react';
import { 
  Globe, 
  Palette, 
  Bot, 
  Zap,
  Settings,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { ModelSelector } from '@/components/chat/ModelSelector';
import { RoleSelector } from '@/components/chat/RoleSelector';
// Removed WorkspaceSelector import - now in Sidebar
import { useAppStore } from '@/stores/appStore';

export const Header: React.FC = () => {
  const {
    currentProvider,
    currentModel,
    currentRole,
    language,
    theme,
    setTheme
  } = useAppStore();

  const [showModelSelector, setShowModelSelector] = useState(false);
  const [showRoleSelector, setShowRoleSelector] = useState(false);
  // Removed showWorkspaceSelector state - now in Sidebar

  const getProviderIcon = () => {
    switch (currentProvider) {
      case 'gemini':
        return <Bot size={16} className="text-blue-500" />;
      case 'openai':
        return <Bot size={16} className="text-green-500" />;
      case 'lm_studio':
        return <Bot size={16} className="text-purple-500" />;
      default:
        return <Bot size={16} />;
    }
  };

  const toggleTheme = () => {
    const themes = ['light', 'dark', 'system'] as const;
    const currentIndex = themes.indexOf(theme);
    const nextIndex = (currentIndex + 1) % themes.length;
    setTheme(themes[nextIndex]);
  };

  return (
    <header className="h-16 border-b border-border bg-card px-6 flex items-center justify-between">
      {/* Left Section - Model and Role Info */}
      <div className="flex items-center gap-4">
        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 h-8"
            onClick={() => setShowModelSelector(true)}
          >
            {getProviderIcon()}
            <span className="text-sm font-medium">{currentModel}</span>
          </Button>
        </div>

        {showModelSelector && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowModelSelector(false)} />
            <div className="relative max-h-[80vh] overflow-auto">
              <ModelSelector onClose={() => setShowModelSelector(false)} />
            </div>
          </div>
        )}

        <div className="w-px h-6 bg-border" />

        <div className="relative">
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 h-8"
            onClick={() => setShowRoleSelector(true)}
          >
            <User size={16} />
            <span className="text-sm">{currentRole.replace('_', ' ')}</span>
          </Button>
        </div>

        {showRoleSelector && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-black/50" onClick={() => setShowRoleSelector(false)} />
            <div className="relative max-h-[80vh] overflow-auto">
              <RoleSelector onClose={() => setShowRoleSelector(false)} />
            </div>
          </div>
        )}

        <div className="w-px h-6 bg-border" />

        {/* Workspace moved to Sidebar for better UX */}
      </div>

      {/* Right Section - Controls */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={toggleTheme}
          className="h-8 w-8"
          title={`Current theme: ${theme}`}
        >
          <Palette size={16} />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          title={`Language: ${language}`}
        >
          <Globe size={16} />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
        >
          <Zap size={16} />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
        >
          <Settings size={16} />
        </Button>
      </div>
    </header>
  );
};