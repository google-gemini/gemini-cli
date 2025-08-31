import React, { useState } from 'react';
import { 
  MessageSquare, 
  Plus, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  Search,
  MoreHorizontal,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';
import { multiModelService } from '@/services/multiModelService';
import { cn } from '@/utils/cn';
import type { ChatSession, ModelProviderType } from '@/types';
import { WorkspacePanel } from '@/components/workspace/WorkspacePanel';

export const Sidebar: React.FC = () => {
  const {
    sessions,
    activeSessionId,
    sidebarCollapsed,
    setActiveSession,
    addSession,
    removeSession,
    updateSession,
    setSidebarCollapsed
  } = useAppStore();
  
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSessions = sessions.filter(session =>
    session.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const createNewSession = async () => {
    const newSession: ChatSession = {
      id: `session-${Date.now()}`,
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      provider: 'gemini' as ModelProviderType,
      model: 'gemini-1.5-pro-latest',
      roleId: 'software_engineer'
    };
    
    // Add session to frontend store (automatically sets as active)
    addSession(newSession);
    
    // Notify backend to create and switch to new session
    try {
      await multiModelService.createSession(newSession.id, newSession.title);
      console.log('Backend session created:', newSession.id, newSession.title);
      
      // Switch backend to new session to keep frontend and backend in sync
      await multiModelService.switchSession(newSession.id);
      console.log('Backend switched to new session:', newSession.id);
    } catch (error) {
      console.error('Failed to create/switch to new backend session:', error);
      // If backend fails, remove the session from frontend to keep consistency
      removeSession(newSession.id);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    
    const isActiveSession = activeSessionId === sessionId;
    const hasOtherSessions = sessions.length > 1;
    
    // Find another session to switch to before deleting (if needed)
    let nextSession = null;
    if (isActiveSession && hasOtherSessions) {
      const otherSessions = sessions.filter(s => s.id !== sessionId);
      nextSession = otherSessions[0];
    }
    
    // Remove from frontend store (automatically handles activeSessionId cleanup)
    removeSession(sessionId);
    
    // Notify backend to delete session
    try {
      await multiModelService.deleteSession(sessionId);
      console.log('Backend session deleted:', sessionId);
      
      // If this was the active session and we have another session to switch to
      if (isActiveSession && nextSession) {
        console.log('Switching to next available session:', nextSession.id);
        await handleSessionClick(nextSession.id);
      }
    } catch (error) {
      console.error('Failed to delete backend session:', error);
    }
  };

  const handleSessionClick = async (sessionId: string) => {
    // Prevent duplicate requests
    if (activeSessionId === sessionId) {
      console.log('Already on session:', sessionId);
      return;
    }
    
    try {
      // First switch backend session to ensure consistency
      await multiModelService.switchSession(sessionId);
      console.log('Backend session switched to:', sessionId);
      
      // Only switch frontend after backend confirms success
      setActiveSession(sessionId);
      
      // Load session messages from backend
      const messages = await multiModelService.getDisplayMessages(sessionId);
      console.log('Loaded', messages.length, 'messages for session:', sessionId);
      
      // Convert backend messages to frontend format and update store
      const chatMessages = messages
        .filter(msg => msg.role !== 'tool') // Filter out tool messages for UI
        .map((msg, index) => ({
          id: `${sessionId}-${index}`,
          role: msg.role as 'user' | 'assistant' | 'system', // Cast to allowed types
          content: msg.content,
          timestamp: new Date(), // Approximate timestamp
          toolCalls: msg.toolCalls
        }));
      
      // Update the session with loaded messages (replace all messages, don't merge)
      updateSession(sessionId, { messages: chatMessages });
      
    } catch (error) {
      console.error('Failed to switch backend session or load messages:', error);
      // Don't switch frontend session if backend switch failed
    }
  };

  if (sidebarCollapsed) {
    return (
      <div className="w-16 bg-card border-r border-border flex flex-col items-center py-4 space-y-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarCollapsed(false)}
          className="h-8 w-8"
        >
          <ChevronRight size={16} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={createNewSession}
          className="h-8 w-8"
        >
          <Plus size={16} />
        </Button>
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
        >
          <Settings size={16} />
        </Button>
      </div>
    );
  }

  return (
    <div className="w-80 bg-card border-r border-border flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-2">
          <MessageSquare size={20} className="text-primary" />
          <span className="font-semibold">Gemini CLI</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSidebarCollapsed(true)}
          className="h-8 w-8"
        >
          <ChevronLeft size={16} />
        </Button>
      </div>

      {/* New Chat Button */}
      <div className="p-4">
        <Button
          onClick={createNewSession}
          className="w-full justify-start gap-2"
        >
          <Plus size={16} />
          New Chat
        </Button>
      </div>

      {/* Search */}
      <div className="px-4 pb-4">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto px-4">
        <div className="space-y-2">
          {filteredSessions.map((session) => (
            <Card
              key={session.id}
              className={cn(
                "p-3 cursor-pointer hover:bg-accent/50 transition-colors group",
                session.id === activeSessionId && "bg-accent border-primary/50"
              )}
              onClick={() => handleSessionClick(session.id)}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate text-sm">
                    {session.title}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {session.messages.length} messages
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {session.updatedAt.toLocaleDateString()}
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal size={12} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={(e) => handleDeleteSession(session.id, e)}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Workspace Panel */}
      <WorkspacePanel />
      
      {/* Footer */}
      <div className="p-4 border-t border-border">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2"
        >
          <Settings size={16} />
          Settings
        </Button>
      </div>
    </div>
  );
};