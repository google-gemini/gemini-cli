/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState } from 'react';
import {
  MessageSquare,
  Plus,
  ChevronLeft,
  ChevronRight,
  Search,
  MoreHorizontal,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { format, isToday, isYesterday, isThisWeek, isThisYear } from 'date-fns';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';
import { multiModelService } from '@/services/multiModelService';
import { cn } from '@/utils/cn';
import type { ChatSession } from '@/types';

export const Sidebar: React.FC = () => {
  const {
    sessions,
    activeSessionId,
    sidebarCollapsed,
    currentProvider,
    currentModel,
    currentRole,
    builtinRoles,
    customRoles,
    setActiveSession,
    addSession,
    removeSession,
    clearAllSessions,
    updateSession,
    setSidebarCollapsed,
    setCurrentRole
  } = useAppStore();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [roleConflictDialog, setRoleConflictDialog] = useState<{
    show: boolean;
    sessionId: string;
    sessionRole: { name: string; icon: string };
    currentRole: { name: string; icon: string };
  } | null>(null);

  // Helper function to get role information by roleId
  const getRoleInfo = (roleId: string | undefined) => {
    if (!roleId) {
      // Session doesn't have a role set yet
      return {
        name: 'Not set',
        icon: '⚙️'
      };
    }

    const allRoles = [...builtinRoles, ...customRoles];
    const role = allRoles.find(role => role.id === roleId);

    if (role) {
      return {
        name: role.name,
        icon: role.icon || '🤖'
      };
    }

    // Fallback for unknown roles
    return {
      name: roleId.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      icon: '❓'
    };
  };

  const filteredSessions = sessions
    .filter(session =>
      session.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()); // Sort by updatedAt descending (newest first)

  // Group sessions by time periods
  const getTimeGroup = (date: Date) => {
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    if (isThisWeek(date)) return 'This Week';
    if (isThisYear(date)) return format(date, 'MMMM yyyy');
    return format(date, 'yyyy');
  };

  const groupedSessions = filteredSessions.reduce((groups, session) => {
    const group = getTimeGroup(session.updatedAt);
    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(session);
    return groups;
  }, {} as Record<string, typeof filteredSessions>);

  // Define the order of time groups
  const groupOrder = ['Today', 'Yesterday', 'This Week'];
  const sortedGroups = Object.keys(groupedSessions).sort((a, b) => {
    const aIndex = groupOrder.indexOf(a);
    const bIndex = groupOrder.indexOf(b);

    if (aIndex !== -1 && bIndex !== -1) {
      return aIndex - bIndex;
    }
    if (aIndex !== -1) return -1;
    if (bIndex !== -1) return 1;

    // For other groups (months/years), sort by most recent first
    return b.localeCompare(a);
  });

  const createNewSession = async () => {
    const newSession: ChatSession = {
      id: `session-${Date.now()}`,
      title: 'New Chat',
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      provider: currentProvider,
      model: currentModel,
      roleId: undefined // Don't set roleId until first message
    };

    // Add session to frontend store (automatically sets as active)
    addSession(newSession);

    // Notify backend to create and switch to new session
    try {
      await multiModelService.createSession(newSession.id, newSession.title); // Don't pass roleId
      // console.log('Backend session created:', newSession.id, newSession.title, 'roleId will be set on first message');
      
      // Switch backend to new session to keep frontend and backend in sync
      await multiModelService.switchSession(newSession.id);
      // console.log('Backend switched to new session:', newSession.id);
    } catch (error) {
      console.error('Failed to create/switch to new backend session:', error);
      // If backend fails, remove the session from frontend to keep consistency
      removeSession(newSession.id);
    }
  };

  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // Get session title for confirmation message
    const session = sessions.find(s => s.id === sessionId);
    const sessionTitle = session?.title || 'Untitled Chat';

    // Show confirmation dialog
    const confirmed = confirm(`Are you sure you want to delete the chat "${sessionTitle}"? This action cannot be undone.`);
    if (!confirmed) {
      return;
    }

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

  const handleDeleteAllSessions = async () => {
    try {
      // First notify backend to delete all sessions
      await multiModelService.deleteAllSessions();
      console.log('All backend sessions deleted');
      
      // Then clear frontend store
      clearAllSessions();
      
      setShowDeleteAllConfirm(false);
    } catch (error) {
      console.error('Failed to delete all backend sessions:', error);
      setShowDeleteAllConfirm(false);
    }
  };

  const handleSessionClick = async (sessionId: string) => {
    // Prevent duplicate requests
    if (activeSessionId === sessionId) {
      console.log('Already on session:', sessionId);
      return;
    }

    // Check role compatibility before switching
    // Only show conflict if both session and current role are set and different
    const session = sessions.find(s => s.id === sessionId);
    if (session && session.roleId && currentRole && session.roleId !== currentRole) {
      const sessionRoleInfo = getRoleInfo(session.roleId);
      const currentRoleInfo = getRoleInfo(currentRole);

      // Show role conflict dialog
      setRoleConflictDialog({
        show: true,
        sessionId,
        sessionRole: { name: sessionRoleInfo.name, icon: sessionRoleInfo.icon },
        currentRole: { name: currentRoleInfo.name, icon: currentRoleInfo.icon }
      });
      return;
    }

    // If roles are compatible or same, proceed with normal session switch
    await performSessionSwitch(sessionId);
  };

  const performSessionSwitch = async (sessionId: string) => {
    try {
      // First switch backend session to ensure consistency
      await multiModelService.switchSession(sessionId);

      // Only switch frontend after backend confirms success
      setActiveSession(sessionId);

      // Load session messages from backend
      const messages = await multiModelService.getDisplayMessages(sessionId);
      console.log('Loaded', messages.length, 'messages for session:', sessionId);

      // Convert backend messages to frontend format and update store
      const chatMessages = messages
        .map((msg, index) => ({
          id: `${sessionId}-${index}`,
          role: msg.role as 'user' | 'assistant' | 'system' | 'tool', // Cast to allowed types
          content: msg.content,
          timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(), // Convert to Date object
          toolCalls: msg.toolCalls
        }));

      // Update the session with loaded messages (replace all messages, don't merge)
      updateSession(sessionId, { messages: chatMessages });

    } catch (error) {
      console.error('Failed to switch backend session or load messages:', error);
      // Don't switch frontend session if backend switch failed
    }
  };

  // Handle role conflict dialog actions
  const handleSwitchToSessionRole = async () => {
    if (!roleConflictDialog) return;

    try {
      // Switch to the session's role
      const session = sessions.find(s => s.id === roleConflictDialog.sessionId);
      if (session?.roleId) {
        await multiModelService.switchRole(session.roleId);
        setCurrentRole(session.roleId); // Update frontend state
        console.log('Switched to session role:', session.roleId);
      }

      // Close dialog and perform session switch
      setRoleConflictDialog(null);
      await performSessionSwitch(roleConflictDialog.sessionId);
    } catch (error) {
      console.error('Failed to switch role:', error);
      setRoleConflictDialog(null);
    }
  };

  const handleContinueWithCurrentRole = async () => {
    if (!roleConflictDialog) return;

    // Close dialog and perform session switch without role change
    const sessionId = roleConflictDialog.sessionId;
    setRoleConflictDialog(null);
    await performSessionSwitch(sessionId);
  };

  const handleCancelSwitch = () => {
    setRoleConflictDialog(null);
  };

  if (sidebarCollapsed) {
    return (
      <div className="fixed left-0 top-0 h-full w-16 bg-card border-r border-border flex flex-col items-center py-4 space-y-4 z-40">
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
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          {sessions.length > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowDeleteAllConfirm(true)}
              className="h-9 w-9 text-destructive hover:text-destructive hover:bg-destructive/10"
              title="Delete all conversations"
            >
              <Trash2 size={16} />
            </Button>
          )}
        </div>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-y-auto px-4">
        <div className="space-y-4">
          {sortedGroups.map((groupName) => (
            <div key={groupName} className="space-y-2">
              {/* Time Group Header */}
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider px-2 py-1">
                {groupName}
              </div>

              {/* Sessions in this group */}
              {groupedSessions[groupName].map((session) => (
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
                      {/* Role and message count in one line */}
                      {(() => {
                        const roleInfo = getRoleInfo(session.roleId);
                        return (
                          <div className="flex items-center justify-between text-xs mt-1 text-muted-foreground">
                            <div className="flex items-center gap-1 min-w-0 flex-1">
                              <span className="text-xs">{roleInfo.icon}</span>
                              <span className="truncate">{roleInfo.name}</span>
                            </div>
                            <span className="ml-2 whitespace-nowrap">{session.messages.length} messages</span>
                          </div>
                        );
                      })()}

                      <div className="text-xs text-muted-foreground">
                        {format(session.updatedAt, 'MM-dd HH:mm')}
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
          ))}
        </div>
      </div>

      
      {/* Footer - removed Authentication Settings button */}
      <div className="p-4 border-t border-border">
        {/* Authentication settings moved to Model Selector */}
      </div>

      {/* Delete All Confirmation Modal */}
      {showDeleteAllConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowDeleteAllConfirm(false)} />
          <div className="relative bg-card rounded-lg shadow-lg p-6 max-w-md w-full">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0" />
              <h3 className="text-lg font-semibold">Delete All Conversations</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              This action will permanently delete all {sessions.length} conversation{sessions.length !== 1 ? 's' : ''} and cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <Button
                variant="ghost"
                onClick={() => setShowDeleteAllConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteAllSessions}
              >
                Delete All
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Role Conflict Dialog */}
      {roleConflictDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-md mx-4 p-6">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-foreground mb-2 flex items-center gap-2">
                ⚠️ Role Mismatch Detected
              </h3>
              <p className="text-sm text-muted-foreground mb-4">
                This session was created with a different role. Continuing with a mismatched role may cause tool compatibility issues.
              </p>

              <div className="space-y-3 bg-muted/30 p-3 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Session Role:</span>
                  <div className="flex items-center gap-1">
                    <span>{roleConflictDialog.sessionRole.icon}</span>
                    <span className="font-medium">{roleConflictDialog.sessionRole.name}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Current Role:</span>
                  <div className="flex items-center gap-1">
                    <span>{roleConflictDialog.currentRole.icon}</span>
                    <span className="font-medium">{roleConflictDialog.currentRole.name}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button
                onClick={handleSwitchToSessionRole}
                className="w-full"
              >
                Switch to Session Role ({roleConflictDialog.sessionRole.name})
              </Button>
              <Button
                variant="outline"
                onClick={handleContinueWithCurrentRole}
                className="w-full"
              >
                Continue with Current Role (May Cause Issues)
              </Button>
              <Button
                variant="ghost"
                onClick={handleCancelSwitch}
                className="w-full"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};