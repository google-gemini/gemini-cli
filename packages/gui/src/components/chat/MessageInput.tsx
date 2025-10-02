/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback, useImperativeHandle, forwardRef, useEffect } from 'react';
import type React from 'react';
import { Send, StopCircle, Folder, FileSpreadsheet, ChevronDown, Loader2, RefreshCw, Plus, FolderPlus, BookTemplate, Edit, Trash2, Copy, Square } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { useAppStore } from '@/stores/appStore';
import { useChatStore } from '@/stores/chatStore';
import { multiModelService } from '@/services/multiModelService';
import { useWorkspaceDirectories } from '@/hooks';
import { cn } from '@/utils/cn';
import type { ChatMessage, UniversalMessage, RoleDefinition } from '@/types';
import { AutocompleteDropdown, useAutocomplete } from './autocomplete';

interface Template {
  id: string;
  name?: string;
  content?: string;
  template?: string;
  isBuiltin?: boolean;
}

interface ElectronAPI {
  dialog?: {
    showOpenDialog: (options: {
      properties: string[];
      title: string;
    }) => Promise<{
      canceled: boolean;
      filePaths: string[];
    }>;
  };
}

interface MessageInputProps {
  disabled?: boolean;
}

interface MessageInputRef {
  setMessage: (message: string) => void;
}

export const MessageInput = forwardRef<MessageInputRef, MessageInputProps>(({ disabled = false }, ref) => {
  const [message, setMessage] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const streamCleanupRef = useRef<(() => void) | null>(null);
  const [showExcelMenu, setShowExcelMenu] = useState(false);
  const [workbooks, setWorkbooks] = useState<Array<{name: string; path?: string}>>([]);
  const [worksheets, setWorksheets] = useState<{ [workbook: string]: Array<{index: number, name: string}> }>({});
  const [expandedWorkbooks, setExpandedWorkbooks] = useState<{ [workbook: string]: boolean }>({});
  const [isLoadingWorkbooks, setIsLoadingWorkbooks] = useState(false);
  const [loadingWorksheets, setLoadingWorksheets] = useState<{ [workbook: string]: boolean }>({});
  const [loadingSelection, setLoadingSelection] = useState<{ [workbook: string]: boolean }>({});
  const [workbooksCache, setWorkbooksCache] = useState<Array<{name: string; path?: string}> | null>(null);
  const [lastCacheTime, setLastCacheTime] = useState<number>(0);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [editContent, setEditContent] = useState('');
  const excelMenuRef = useRef<HTMLDivElement>(null);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const templateMenuRef = useRef<HTMLDivElement>(null);
  
  const {
    activeSessionId,
    updateSession,
    currentRole,
    builtinRoles,
    customRoles
  } = useAppStore();
  const { isStreaming, isThinking, currentOperation, setStreamingMessage, setError, setCompressionNotification, setCurrentOperation } = useChatStore();
  const { directories: workspaceDirectories, loading: loadingDirectories, addDirectory: addWorkspaceDirectory } = useWorkspaceDirectories();

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (excelMenuRef.current && !excelMenuRef.current.contains(event.target as Node)) {
        setShowExcelMenu(false);
      }
      if (workspaceMenuRef.current && !workspaceMenuRef.current.contains(event.target as Node)) {
        setShowWorkspaceMenu(false);
      }
      if (templateMenuRef.current && !templateMenuRef.current.contains(event.target as Node)) {
        setShowTemplateMenu(false);
      }
    };

    if (showExcelMenu || showWorkspaceMenu || showTemplateMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showExcelMenu, showWorkspaceMenu, showTemplateMenu]);

  // Load Excel workbooks (with optional force refresh)
  const loadWorkbooks = async (forceRefresh: boolean = false) => {
    const now = Date.now();
    const cacheAge = now - lastCacheTime;
    const CACHE_DURATION = 30 * 1000; // 30 seconds

    if (!forceRefresh && workbooksCache && cacheAge < CACHE_DURATION) {
      console.log('Using cached workbooks data');
      setWorkbooks(workbooksCache);
      return true;
    }

    try {
      console.log('Fetching Excel workbooks...');
      setIsLoadingWorkbooks(true);
      const result = await multiModelService.getExcelWorkbooks();
      console.log('Excel workbooks result:', result);
      if (result.success) {
        setWorkbooks(result.workbooks);
        setWorkbooksCache(result.workbooks);
        setLastCacheTime(now);
        return true;
      } else {
        console.error('Failed to load Excel workbooks:', result.error);
        setError(result.error || 'Failed to load Excel workbooks');
        return false;
      }
    } catch (error) {
      console.error('Error calling getExcelWorkbooks:', error);
      setError('Failed to connect to Excel');
      return false;
    } finally {
      setIsLoadingWorkbooks(false);
    }
  };

  // Load Excel workbooks when menu is opened
  const handleExcelButtonClick = async () => {
    console.log('Excel button clicked, showExcelMenu:', showExcelMenu);
    if (!showExcelMenu) {
      const success = await loadWorkbooks();
      if (success) {
        setShowExcelMenu(true);
      }
    } else {
      setShowExcelMenu(false);
    }
  };

  // Handle refresh button click
  const handleRefreshWorkbooks = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent menu from closing
    await loadWorkbooks(true); // Force refresh
  };

  // Handle workspace directory button click
  const handleWorkspaceButtonClick = () => {
    console.log('Workspace button clicked, showWorkspaceMenu:', showWorkspaceMenu);
    setShowWorkspaceMenu(!showWorkspaceMenu);
  };

  // Handle workspace directory selection
  const handleWorkspaceSelect = (directoryPath: string) => {
    const text = directoryPath;
    setMessage(prev => prev ? prev + ' ' + text : text);
    setShowWorkspaceMenu(false);
    textareaRef.current?.focus();
  };

  // Handle adding new workspace directory
  const handleAddDirectory = async () => {
    try {
      const globalWithElectron = globalThis as unknown as { electronAPI?: ElectronAPI };
      if (globalWithElectron.electronAPI?.dialog?.showOpenDialog) {
        const result = await globalWithElectron.electronAPI.dialog.showOpenDialog({
          properties: ['openDirectory'],
          title: 'Select Working Directory'
        });

        if (!result.canceled && result.filePaths.length > 0) {
          const directoryPath = result.filePaths[0];
          await addWorkspaceDirectory(directoryPath);
          console.log('Added working directory:', directoryPath);
        }
      } else {
        // Fallback for non-Electron environments
        const directory = prompt('Enter directory path:');
        if (directory?.trim()) {
          await addWorkspaceDirectory(directory.trim());
          console.log('Added working directory:', directory.trim());
        }
      }
    } catch (error) {
      console.error('Failed to add directory:', error);
      setError('Failed to add directory');
    }
  };

  // Handle template button click
  const handleTemplateButtonClick = async () => {
    console.log('Template button clicked, showTemplateMenu:', showTemplateMenu);
    if (!showTemplateMenu) {
      try {
        setLoadingTemplates(true);
        const backendTemplates = await multiModelService.getAllTemplatesAsync();
        const customTemplates = backendTemplates.filter(template => !template.isBuiltin);
        setTemplates(customTemplates);
        setShowTemplateMenu(true);
        console.log('Templates loaded:', customTemplates.length, 'custom templates');
      } catch (error) {
        console.error('Error loading templates:', error);
        setError('Failed to load templates');
      } finally {
        setLoadingTemplates(false);
      }
    } else {
      setShowTemplateMenu(false);
    }
  };

  // Handle template selection
  const handleTemplateSelect = (template: Template) => {
    const content = template.content || template.template || '';
    setMessage(content);
    setShowTemplateMenu(false);
    textareaRef.current?.focus();
  };

  // Handle template editing
  const handleTemplateEdit = (e: React.MouseEvent, template: Template) => {
    e.stopPropagation();
    setEditingTemplate(template);
    setEditContent(template.content || template.template || '');
    setShowTemplateMenu(false);
  };

  // Save template edits
  const handleSaveTemplateEdit = async () => {
    if (!editingTemplate) return;

    try {
      await multiModelService.updateCustomTemplate(editingTemplate.id, { content: editContent });
      // Refresh templates list
      const backendTemplates = await multiModelService.getAllTemplatesAsync();
      const customTemplates = backendTemplates.filter(t => !t.isBuiltin);
      setTemplates(customTemplates);
      setEditingTemplate(null);
      setEditContent('');
    } catch (error) {
      console.error('Error updating template:', error);
      setError('Failed to update template');
    }
  };

  // Cancel template editing
  const handleCancelTemplateEdit = () => {
    setEditingTemplate(null);
    setEditContent('');
  };

  // Handle template deletion
  const handleTemplateDelete = async (e: React.MouseEvent, template: Template) => {
    e.stopPropagation();
    if (confirm(`Are you sure you want to delete the template "${template.name || 'Untitled'}"?`)) {
      try {
        await multiModelService.deleteCustomTemplate(template.id);
        // Refresh templates list
        const backendTemplates = await multiModelService.getAllTemplatesAsync();
        const customTemplates = backendTemplates.filter(t => !t.isBuiltin);
        setTemplates(customTemplates);
      } catch (error) {
        console.error('Error deleting template:', error);
        setError('Failed to delete template');
      }
    }
  };

  // Toggle workbook expansion and load worksheets
  const handleWorkbookClick = async (workbook: {name: string; path?: string}) => {
    const workbookKey = workbook.name;
    const isExpanded = expandedWorkbooks[workbookKey];

    if (!isExpanded && !worksheets[workbookKey]) {
      // Load worksheets if not already loaded
      setLoadingWorksheets(prev => ({ ...prev, [workbookKey]: true }));
      try {
        const result = await multiModelService.getExcelWorksheets(workbook.name);
        if (result.success) {
          setWorksheets(prev => ({
            ...prev,
            [workbookKey]: result.worksheets
          }));
        }
      } catch (error) {
        console.error('Failed to load worksheets:', error);
      } finally {
        setLoadingWorksheets(prev => ({ ...prev, [workbookKey]: false }));
      }
    }

    // Toggle expansion
    setExpandedWorkbooks(prev => ({
      ...prev,
      [workbookKey]: !isExpanded
    }));
  };

  // Handle worksheet selection
  const handleWorksheetSelect = (workbook: string, worksheet: string) => {
    const text = `${workbook}!${worksheet}`;
    setMessage(prev => prev ? prev + ' ' + text : text);
    setShowExcelMenu(false);
    textareaRef.current?.focus();
  };

  // Handle workbook path selection (new function)
  const handleWorkbookSelect = (workbookPath: string) => {
    setMessage(prev => prev ? prev + ' ' + workbookPath : workbookPath);
    setShowExcelMenu(false);
    textareaRef.current?.focus();
  };

  // Handle get selection from Excel
  const handleGetExcelSelection = async (workbookName: string) => {
    // Set loading state
    setLoadingSelection(prev => ({ ...prev, [workbookName]: true }));

    try {
      const result = await multiModelService.getExcelSelection(workbookName);
      if (result.success && result.selection) {
        // Selection already contains full path, sheet name, and address
        const selectionText = result.selection;
        setMessage(prev => prev ? prev + ' ' + selectionText : selectionText);
        setShowExcelMenu(false);
        textareaRef.current?.focus();
      } else {
        console.error('Failed to get Excel selection:', result);
      }
    } catch (error) {
      console.error('Error getting Excel selection:', error);
    } finally {
      // Clear loading state
      setLoadingSelection(prev => ({ ...prev, [workbookName]: false }));
    }
  };

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 200; // max height in pixels
    const newHeight = Math.min(scrollHeight, maxHeight);
    textarea.style.height = newHeight + 'px';
  }, []);

  useImperativeHandle(ref, () => ({
    setMessage: (newMessage: string) => {
      setMessage(newMessage);
      // Focus the textarea after setting the message
      setTimeout(() => {
        textareaRef.current?.focus();
        adjustTextareaHeight();
      }, 0);
    }
  }), [adjustTextareaHeight]);


  // Initialize autocomplete
  const autocomplete = useAutocomplete({
    textareaRef: textareaRef as React.RefObject<HTMLTextAreaElement>,
    value: message,
    onChange: setMessage,
    onSelectionChange: (_start, _end) => {
      // Update cursor position after autocomplete
      setTimeout(() => adjustTextareaHeight(), 0);
    }
  });

  const handleInputChange = async (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;

    setMessage(newValue);
    adjustTextareaHeight();

    // Check for autocomplete triggers
    await autocomplete.checkForAutocomplete(newValue, cursorPos);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // First, let autocomplete handle the key if it's visible
    if (autocomplete.handleKeyDown(e)) {
      return; // Autocomplete handled the key
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }

    // For backspace/delete, schedule autocomplete check after the key is processed
    if (e.key === 'Backspace' || e.key === 'Delete') {
      setTimeout(async () => {
        if (textareaRef.current) {
          const newValue = textareaRef.current.value;
          const newCursorPos = textareaRef.current.selectionStart;
          await autocomplete.checkForAutocomplete(newValue, newCursorPos);
        }
      }, 0);
    }
  };

  const handleTextareaClick = () => {
    // Check for autocomplete when user clicks to change cursor position
    setTimeout(async () => {
      if (textareaRef.current) {
        const cursorPos = textareaRef.current.selectionStart;
        await autocomplete.checkForAutocomplete(message, cursorPos);
      }
    }, 0);
  };

  // Role compatibility check helper
  const checkRoleCompatibility = async (sessionId: string, currentRoleId: string) => {
    const session = useAppStore.getState().sessions.find(s => s.id === sessionId);

    // If session has no roleId, it's compatible (will be set on first message)
    if (!session?.roleId) return { isCompatible: true, sessionRole: null, currentRole: null };

    if (!currentRoleId) return { isCompatible: true, sessionRole: null, currentRole: null };

    const sessionRole = builtinRoles.find(r => r.id === session.roleId) ||
                       customRoles.find(r => r.id === session.roleId);
    const currentRole = builtinRoles.find(r => r.id === currentRoleId) ||
                       customRoles.find(r => r.id === currentRoleId);

    const isCompatible = session.roleId === currentRoleId;

    return {
      isCompatible,
      sessionRole,
      currentRole,
      sessionRoleId: session.roleId,
      currentRoleId
    };
  };

  // Show role conflict dialog
  const showRoleConflictDialog = (sessionRole: RoleDefinition, currentRole: RoleDefinition, sessionId: string, currentRoleId: string) =>
    new Promise<'switch' | 'continue' | 'cancel' | 'update'>((resolve) => {
      const sessionRoleName = sessionRole?.name || 'Unknown Role';
      const currentRoleName = currentRole?.name || 'Unknown Role';

      const dialog = document.createElement('div');
      dialog.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-[1000]';
      dialog.innerHTML = `
        <div class="bg-card border border-border rounded-lg shadow-lg w-full max-w-2xl mx-4 text-foreground">
          <div class="p-4 border-b border-border">
            <h3 class="text-lg font-medium text-foreground">Role Compatibility Warning</h3>
          </div>
          <div class="p-4 space-y-3">
            <p class="text-sm text-muted-foreground">
              This session was created with a different role. Tool calls may not work correctly.
            </p>
            <div class="space-y-2">
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium text-muted-foreground">Session Role:</span>
                <span class="text-sm font-medium">${sessionRoleName}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs font-medium text-muted-foreground">Current Role:</span>
                <span class="text-sm font-medium">${currentRoleName}</span>
              </div>
            </div>
          </div>
          <div class="p-4 border-t border-border flex justify-start gap-3">
            <button id="cancel-btn" class="px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors">
              Cancel
            </button>
            <button id="continue-btn" class="px-4 py-2 text-sm rounded-md bg-orange-100 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200 hover:bg-orange-200 dark:hover:bg-orange-900 transition-colors">
              Continue Anyway
            </button>
            <button id="update-btn" class="px-4 py-2 text-sm rounded-md bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200 hover:bg-green-200 dark:hover:bg-green-900 transition-colors">
              Update Session to ${currentRoleName}
            </button>
            <button id="switch-btn" class="px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">
              Switch to ${sessionRoleName}
            </button>
          </div>
        </div>
      `;

      document.body.appendChild(dialog);

      const cleanup = () => document.body.removeChild(dialog);

      dialog.querySelector('#cancel-btn')?.addEventListener('click', () => {
        cleanup();
        resolve('cancel');
      });

      dialog.querySelector('#continue-btn')?.addEventListener('click', () => {
        cleanup();
        resolve('continue');
      });

      dialog.querySelector('#switch-btn')?.addEventListener('click', () => {
        cleanup();
        resolve('switch');
      });

      dialog.querySelector('#update-btn')?.addEventListener('click', async () => {
        cleanup();
        // Update the session's role to the current role
        try {
          // Update frontend session with current role
          const { updateSession } = useAppStore.getState();
          updateSession(sessionId, { roleId: currentRoleId });

          // Update backend session metadata
          await multiModelService.setSessionRole(sessionId, currentRoleId);
          console.log(`Updated session ${sessionId} role to ${currentRoleId}`);
        } catch (error) {
          console.error('Failed to update session role:', error);
        }
        resolve('update');
      });

      // Close on backdrop click
      dialog.addEventListener('click', (e) => {
        if (e.target === dialog) {
          cleanup();
          resolve('cancel');
        }
      });
    });

  const handleSendMessage = async () => {
    if (!message.trim() || !activeSessionId || isStreaming || isThinking) return;

    // Check if this is the first message in the session (session has no roleId set)
    const session = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
    const isFirstMessage = !session?.roleId;

    if (isFirstMessage) {
      // Set roleId for the session on first message
      try {
        // Update frontend session with current role
        const { updateSession } = useAppStore.getState();
        updateSession(activeSessionId, { roleId: currentRole });

        // Update backend session metadata
        await multiModelService.setSessionRole(activeSessionId, currentRole);
        console.log(`Set role ${currentRole} for new session ${activeSessionId}`);
      } catch (error) {
        console.error('Failed to set session role:', error);
        setError('Failed to set session role. Please try again.');
        return;
      }
    } else {
      // Check role compatibility for existing sessions
      const compatibility = await checkRoleCompatibility(activeSessionId, currentRole);

      if (!compatibility.isCompatible && compatibility.sessionRole && compatibility.currentRole) {
        const action = await showRoleConflictDialog(
          compatibility.sessionRole,
          compatibility.currentRole,
          activeSessionId,
          compatibility.currentRoleId
        );

        if (action === 'cancel') {
          return; // User cancelled, don't send message
        } else if (action === 'switch') {
          // Switch to session's role
          try {
            await multiModelService.switchRole(compatibility.sessionRoleId);
            // Update frontend state to sync with backend
            const { setCurrentRole } = useAppStore.getState();
            setCurrentRole(compatibility.sessionRoleId);
            console.log(`Switched role to ${compatibility.sessionRole.name} for session compatibility`);
          } catch (error) {
            console.error('Failed to switch role:', error);
            setError('Failed to switch role. Please try again.');
            return;
          }
        } else if (action === 'update') {
          // Session role has been updated to current role, proceed normally
          console.log(`Session ${activeSessionId} role updated to current role: ${compatibility.currentRole.name}`);
        }
        // If action === 'continue', proceed with current role
      }
    }

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: message.trim(),
      timestamp: new Date()
    };

    // Add user message to session
    updateSession(activeSessionId, {
      messages: [...(useAppStore.getState().sessions.find(s => s.id === activeSessionId)?.messages || []), userMessage],
      updatedAt: new Date()
    });

    // Clear input
    setMessage('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    // Start thinking state first
    // console.log('[MessageInput] Setting thinking to true, current state:', { isThinking, isStreaming });
    setCurrentOperation({
      type: 'thinking',
      message: 'AI is thinking',
      details: 'Processing your request...'
    });
    setStreamingMessage('');
    setError(null);

    // Move these variables outside try block so they can be accessed in catch/finally
    let assistantContent = '';
    let currentAssistantMessageId: string | null = null;

    try {
      const session = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
      if (!session) return;

      // Ensure backend is on the same session before sending message
      const currentBackendSessionId = await multiModelService.getCurrentSessionId();
      if (currentBackendSessionId !== activeSessionId) {
        console.warn(`Backend session (${currentBackendSessionId}) != frontend session (${activeSessionId}). Syncing...`);
        await multiModelService.switchSession(activeSessionId);
      }

      // Send ONLY the new user message (MultiModelSystem manages history internally)
      const newUserMessage: UniversalMessage = {
        role: 'user',
        content: userMessage.content,
        timestamp: userMessage.timestamp
      };
      const { stream, cancel } = await multiModelService.sendMessage([newUserMessage]);

      // Save the cancel function for stop button
      streamCleanupRef.current = cancel;

      let hasCreatedInitialMessage = false;

      for await (const event of stream) {
        // Check if request was aborted
        if (abortControllerRef.current?.signal.aborted) {
          console.log('Stream processing aborted by user');
          break;
        }

        if (event.type === 'content' || event.type === 'content_delta') {
          setCurrentOperation({
            type: 'streaming',
            message: 'AI is responding',
            details: 'Generating response...'
          });
          assistantContent += event.content;
          setStreamingMessage(assistantContent);
          
          // Create assistant message immediately on first content
          if (!hasCreatedInitialMessage && assistantContent.trim()) {
            const assistantMessage: ChatMessage = {
              id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-assistant`,
              role: 'assistant',
              content: assistantContent,
              timestamp: new Date()
            };
            currentAssistantMessageId = assistantMessage.id;
            hasCreatedInitialMessage = true;
            
            // Add initial assistant message to session immediately
            const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
            if (currentSession) {
              updateSession(activeSessionId, {
                messages: [...currentSession.messages, assistantMessage],
                updatedAt: new Date()
              });
            }
          } else if (currentAssistantMessageId) {
            // Update existing assistant message with new content
            const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
            if (currentSession) {
              const messageIndex = currentSession.messages.findIndex(m => m.id === currentAssistantMessageId);
              if (messageIndex >= 0) {
                const updatedMessages = [...currentSession.messages];
                updatedMessages[messageIndex] = {
                  ...updatedMessages[messageIndex],
                  content: assistantContent
                };
                
                updateSession(activeSessionId, {
                  messages: updatedMessages,
                  updatedAt: new Date()
                });
              }
            }
          }
        } 
        else if (event.type === 'tool_call') {
          // Update status to show tool is executing
          if (event.toolCall) {
            setCurrentOperation({
              type: 'tool_executing',
              message: `Executing tool: ${event.toolCall.name}`,
              toolName: event.toolCall.name,
              details: 'Processing...'
            });
          }

          // Finalize current assistant message streaming first
          if (currentAssistantMessageId && assistantContent.trim()) {
            // Update the existing message with final content and add tool call
            const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
            if (currentSession) {
              const messageIndex = currentSession.messages.findIndex(m => m.id === currentAssistantMessageId);
              if (messageIndex >= 0) {
                const updatedMessages = [...currentSession.messages];
                const existingToolCalls = updatedMessages[messageIndex].toolCalls || [];
                updatedMessages[messageIndex] = {
                  ...updatedMessages[messageIndex],
                  content: assistantContent,
                  toolCalls: event.toolCall ? [...existingToolCalls, event.toolCall] : existingToolCalls
                };

                updateSession(activeSessionId, {
                  messages: updatedMessages,
                  updatedAt: new Date()
                });
              }
            }

            // CRITICAL: Don't reset assistantContent or currentAssistantMessageId here
            // The assistant message with tool calls has been saved to the session
            // Keep the references so any future content updates to the same message
            // Don't clear assistantContent - preserve it in case there's more content
            // Don't reset currentAssistantMessageId - keep updating the same message
            // Don't reset hasCreatedInitialMessage - the message still exists

            // Only clear the streaming display since the content is now persisted
            setStreamingMessage('');
          } else if (event.toolCall) {
            // Create a new message for tool calls if there's no current assistant message
            const toolCallMessage: ChatMessage = {
              id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-tool-call`,
              role: 'assistant',
              content: '', // Tool calls don't have content, just the calls
              toolCalls: [event.toolCall],
              timestamp: new Date()
            };
            
            // Add tool call message to session immediately
            const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
            if (currentSession) {
              updateSession(activeSessionId, {
                messages: [...currentSession.messages, toolCallMessage],
                updatedAt: new Date()
              });
            }
          }
        } 
        else if (event.type === 'tool_response') {
          // Set thinking status since AI will process the tool result
          setCurrentOperation({
            type: 'thinking',
            message: 'AI is thinking',
            details: 'Processing tool result...'
          });

          // Handle tool response events - create tool response message immediately
          if (event.toolCallId && event.toolName) {
            const toolResponseMessage: ChatMessage = {
              id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-tool-response`,
              role: 'tool',
              content: event.content || `Tool ${event.toolName} completed`,
              timestamp: new Date(),
              toolSuccess: event.toolSuccess,  // Save success/failure status
              toolResponseData: event.toolResponseData  // Save structured data
            };
            
            // Add tool response message immediately
            const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
            if (currentSession) {
              updateSession(activeSessionId, {
                messages: [...currentSession.messages, toolResponseMessage],
                updatedAt: new Date()
              });
            }

            // Don't reset state here - LLM might continue streaming after tool response
            // State will be reset only when a new message starts or conversation ends
          }
        }
        else if (event.type === 'compression') {
          // Update status to show compression is happening
          setCurrentOperation({
            type: 'compressing',
            message: 'Compressing conversation history',
            details: 'Optimizing context for better performance...'
          });

          // Handle compression event - show notification and add info message
          if (event.compressionInfo) {
            setCompressionNotification(event.compressionInfo);
            // Auto-hide notification after 5 seconds
            setTimeout(() => setCompressionNotification(null), 5000);
            
            // Add compression info message to chat immediately
            const compressionMessage: ChatMessage = {
              id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-compression`,
              role: 'system',
              content: `Chat compressed from ${event.compressionInfo.originalTokenCount} to ${event.compressionInfo.newTokenCount} tokens`,
              timestamp: new Date()
            };
            
            const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
            if (currentSession) {
              updateSession(activeSessionId, {
                messages: [...currentSession.messages, compressionMessage],
                updatedAt: new Date()
              });
            }
          }
        } else if (event.type === 'done' || event.type === 'message_complete') {
          // Clear operation status when message is complete
          setCurrentOperation(null);

          // Final content update for streaming message if we had content
          if (currentAssistantMessageId && assistantContent) {
            const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
            if (currentSession) {
              const messageIndex = currentSession.messages.findIndex(m => m.id === currentAssistantMessageId);
              if (messageIndex >= 0) {
                const updatedMessages = [...currentSession.messages];
                updatedMessages[messageIndex] = {
                  ...updatedMessages[messageIndex],
                  content: assistantContent
                };
                
                updateSession(activeSessionId, {
                  messages: updatedMessages,
                  updatedAt: new Date()
                });
              }
            }
          }
          
          // Clear streaming content since we've finalized the message
          setStreamingMessage('');

          // Refresh messages from backend to get any tool responses
          // Add a small delay to ensure backend processing is complete
          setTimeout(async () => {
            try {
              // Get updated messages from backend (includes any tool responses)
              const backendMessages = await multiModelService.getDisplayMessages(activeSessionId);
              const chatMessages = backendMessages
                .map((msg, index) => ({
                  id: `${activeSessionId}-${index}`,
                  role: msg.role as 'user' | 'assistant' | 'system' | 'tool',
                  content: msg.content,
                  timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
                  toolCalls: msg.toolCalls
                }));
              
              updateSession(activeSessionId, { 
                messages: chatMessages,
                updatedAt: new Date() 
              });
              // console.log('Refreshed messages from backend, total:', chatMessages.length);

              // Also refresh session info for title updates
              const sessionsInfo = await multiModelService.getSessionsInfo();
              const updatedSessionInfo = sessionsInfo.find(s => s.id === activeSessionId);
              if (updatedSessionInfo) {
                const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
                if (currentSession && currentSession.title !== updatedSessionInfo.title) {
                  updateSession(activeSessionId, {
                    title: updatedSessionInfo.title,
                    updatedAt: new Date()
                  });
                  // console.log('Updated session title from backend:', updatedSessionInfo.title);
                }
              }
            } catch (error) {
              console.error('Failed to refresh messages and session info:', error);
            }
          }, 500); // 500ms delay to ensure backend processing is complete
          break;
        }
        else if (event.type === 'error') {
          const errorMessage = event.error instanceof Error ? event.error.message : (event.error || 'An error occurred');
          console.error('Stream error:', errorMessage, event);

          // Save any streaming content before it's lost
          if (assistantContent && currentAssistantMessageId) {
            const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
            if (currentSession) {
              const existingMessage = currentSession.messages.find(m => m.id === currentAssistantMessageId);
              if (existingMessage) {
                const updatedMessage = { ...existingMessage, content: assistantContent };
                const updatedMessages = currentSession.messages.map(m =>
                  m.id === currentAssistantMessageId ? updatedMessage : m
                );
                updateSession(activeSessionId, {
                  messages: updatedMessages,
                  updatedAt: new Date()
                });
              }
            }
          }

          setError(errorMessage);
          break;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      console.error('Message sending failed:', errorMessage, error);

      // Save any streaming content before it's lost
      if (assistantContent && currentAssistantMessageId) {
        const currentSession = useAppStore.getState().sessions.find(s => s.id === activeSessionId);
        if (currentSession) {
          const existingMessage = currentSession.messages.find(m => m.id === currentAssistantMessageId);
          if (existingMessage) {
            const updatedMessage = { ...existingMessage, content: assistantContent };
            const updatedMessages = currentSession.messages.map(m =>
              m.id === currentAssistantMessageId ? updatedMessage : m
            );
            updateSession(activeSessionId, {
              messages: updatedMessages,
              updatedAt: new Date()
            });
          }
        }
      }

      setError(errorMessage);
    } finally {
      // console.log('[MessageInput] Finally block - resetting states');
      setCurrentOperation(null);
      setStreamingMessage('');
      // Clear abort controller and stream cleanup
      abortControllerRef.current = null;
      streamCleanupRef.current = null;
      // Reset assistant content tracking
      assistantContent = '';
      currentAssistantMessageId = null;
    }
  };

  const handleStopGeneration = () => {
    console.log('User requested to stop generation');

    // Cancel the current stream if active
    if (streamCleanupRef.current) {
      streamCleanupRef.current();
      console.log('Cancelled current stream');
      streamCleanupRef.current = null;
    }

    // Abort the current request if active (fallback)
    if (abortControllerRef.current) {
      abortControllerRef.current.abort('User cancelled request');
      console.log('Aborted current stream request');
      abortControllerRef.current = null;
    }

    // Reset UI states immediately
    setCurrentOperation(null);
    setStreamingMessage('');
  };

  return (
    <div className="p-4">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              placeholder={disabled ? "Select a session to start chatting..." : "Type a message... (use @ for workspace directories)"}
              value={message}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              onClick={handleTextareaClick}
              disabled={disabled || isStreaming || isThinking}
              className={cn(
                "min-h-[44px] max-h-[200px] resize-none",
                "focus:ring-1 focus:ring-primary/50",
                "rounded-lg",
                "transition-all duration-200 ease-in-out",
                // Custom scrollbar styling
                "[&::-webkit-scrollbar]:w-2",
                "[&::-webkit-scrollbar-track]:bg-transparent",
                "[&::-webkit-scrollbar-thumb]:bg-muted-foreground/20",
                "[&::-webkit-scrollbar-thumb]:rounded-full",
                "[&::-webkit-scrollbar-thumb:hover]:bg-muted-foreground/30"
              )}
              style={{
                height: 'auto',
                paddingTop: '11px',
                paddingBottom: '13px',
                paddingLeft: '16px',
                paddingRight: '100px', // space for buttons in top-right
                fontSize: '14px',
                lineHeight: '20px'
              }}
            />

            {/* Internal buttons container - fixed at top-right */}
            <div className="absolute right-2 top-1 flex items-center gap-1">
              {/* Excel button with dropdown menu */}
              <div className="relative" ref={excelMenuRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded"
                  disabled={disabled || isLoadingWorkbooks}
                  onClick={handleExcelButtonClick}
                  title="Excel Workbooks"
                >
                  {isLoadingWorkbooks ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <FileSpreadsheet size={14} />
                  )}
                </Button>

                {showExcelMenu && (
                  <div className="absolute bottom-12 right-0 bg-card border border-border rounded-lg shadow-lg min-w-64 max-h-80 overflow-y-auto z-50">
                    <div className="p-2">
                      {isLoadingWorkbooks ? (
                        <div className="flex items-center px-2 py-4 text-sm text-muted-foreground">
                          <Loader2 size={16} className="mr-2 animate-spin" />
                          Loading Excel workbooks...
                        </div>
                      ) : workbooks.length > 0 ? (
                        <>
                          <div className="flex items-center justify-between mb-2 px-2">
                            <div className="text-sm font-medium text-foreground">Excel Workbooks</div>
                            <button
                              onClick={handleRefreshWorkbooks}
                              disabled={isLoadingWorkbooks}
                              className="p-1 hover:bg-muted rounded transition-colors"
                              title="Refresh workbooks list"
                            >
                              <RefreshCw
                                size={12}
                                className={cn(
                                  "text-muted-foreground hover:text-foreground",
                                  isLoadingWorkbooks && "animate-spin"
                                )}
                              />
                            </button>
                          </div>
                          {workbooks.map((workbook, index) => (
                            <div key={index} className="mb-1">
                              <div className="flex items-center gap-1">
                                {/* Clickable workbook name to expand/collapse worksheets */}
                                <button
                                  className="flex-1 text-left px-2 py-1.5 text-sm hover:bg-muted rounded flex items-center gap-2"
                                  onClick={() => handleWorkbookClick(workbook)}
                                  title="Click to show worksheets"
                                >
                                  {loadingWorksheets[workbook.name] ? (
                                    <Loader2 size={14} className="text-muted-foreground animate-spin flex-shrink-0" />
                                  ) : (
                                    <ChevronDown
                                      size={14}
                                      className={cn(
                                        "text-muted-foreground transition-transform flex-shrink-0",
                                        expandedWorkbooks[workbook.name] ? "rotate-180" : ""
                                      )}
                                    />
                                  )}
                                  <span className="font-medium text-foreground truncate">
                                    {workbook.name}
                                  </span>
                                </button>

                                {/* Get selection button */}
                                <button
                                  className="p-1.5 hover:bg-muted rounded group"
                                  onClick={() => handleGetExcelSelection(workbook.name)}
                                  disabled={loadingSelection[workbook.name]}
                                  title="Get current selection"
                                >
                                  {loadingSelection[workbook.name] ? (
                                    <Loader2 size={14} className="text-muted-foreground animate-spin" />
                                  ) : (
                                    <Square size={14} className="text-muted-foreground group-hover:text-foreground" />
                                  )}
                                </button>

                                {/* Copy path button */}
                                <button
                                  className="p-1.5 hover:bg-muted rounded group"
                                  onClick={() => handleWorkbookSelect(workbook.path || workbook.name)}
                                  title={`Insert path: ${workbook.path || workbook.name}`}
                                >
                                  <Copy size={14} className="text-muted-foreground group-hover:text-foreground" />
                                </button>
                              </div>

                              {expandedWorkbooks[workbook.name] && (
                                <div className="ml-4 mt-1 space-y-0.5">
                                  {loadingWorksheets[workbook.name] ? (
                                    <div className="flex items-center px-2 py-1 text-xs text-muted-foreground">
                                      <Loader2 size={12} className="mr-2 animate-spin" />
                                      Loading worksheets...
                                    </div>
                                  ) : worksheets[workbook.name] ? (
                                    worksheets[workbook.name].map((worksheet) => (
                                      <div key={worksheet.index} className="flex items-center gap-1">
                                        <span className="flex-1 text-left px-2 py-1 text-xs text-muted-foreground">
                                          {worksheet.index}: {worksheet.name}
                                        </span>
                                        <button
                                          className="p-1 hover:bg-muted/50 rounded group"
                                          onClick={() => handleWorksheetSelect(workbook.path || workbook.name, worksheet.name)}
                                          title={`Insert: ${workbook.path || workbook.name}!${worksheet.name}`}
                                        >
                                          <Copy size={10} className="text-muted-foreground group-hover:text-foreground" />
                                        </button>
                                      </div>
                                    ))
                                  ) : null}
                                </div>
                              )}
                            </div>
                          ))}
                        </>
                      ) : (
                        <div className="text-sm text-muted-foreground px-2">
                          No Excel workbooks are currently open
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Workspace directory button */}
              <div className="relative" ref={workspaceMenuRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded"
                  disabled={disabled}
                  onClick={handleWorkspaceButtonClick}
                  title="Workspace Directories"
                >
                  <Folder size={14} />
                </Button>

                {showWorkspaceMenu && (
                  <div className="absolute bottom-12 right-0 bg-card border border-border rounded-lg shadow-lg min-w-64 max-h-80 overflow-y-auto z-50">
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 px-2">
                        <div className="text-sm font-medium text-foreground">Workspace Directories</div>
                        <button
                          onClick={handleAddDirectory}
                          className="p-1 hover:bg-muted rounded transition-colors"
                          title="Add workspace directory"
                        >
                          <Plus
                            size={12}
                            className="text-muted-foreground hover:text-foreground"
                          />
                        </button>
                      </div>
                      {loadingDirectories ? (
                        <div className="flex items-center px-2 py-4 text-sm text-muted-foreground">
                          <Loader2 size={16} className="mr-2 animate-spin" />
                          Loading directories...
                        </div>
                      ) : workspaceDirectories.length > 0 ? (
                        <div className="space-y-1">
                          {workspaceDirectories.map((directory, index) => (
                            <button
                              key={index}
                              className="w-full text-left px-2 py-1.5 text-sm hover:bg-muted rounded flex items-center gap-2"
                              onClick={() => handleWorkspaceSelect(directory)}
                            >
                              <Folder size={14} className="text-muted-foreground flex-shrink-0" />
                              <span className="truncate" title={directory}>
                                {directory}
                              </span>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="text-sm text-muted-foreground px-2 py-2">
                            No workspace directories configured.
                          </div>
                          <button
                            onClick={handleAddDirectory}
                            className="w-full px-2 py-2 text-sm text-primary hover:bg-muted rounded flex items-center gap-2 justify-center"
                          >
                            <FolderPlus size={14} />
                            Add Directory
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Template button */}
              <div className="relative" ref={templateMenuRef}>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded"
                  disabled={disabled || loadingTemplates}
                  onClick={handleTemplateButtonClick}
                  title="Prompt Templates"
                >
                  {loadingTemplates ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <BookTemplate size={14} />
                  )}
                </Button>

                {showTemplateMenu && (
                  <div className="absolute bottom-12 right-0 bg-card border border-border rounded-lg shadow-lg min-w-96 max-h-80 overflow-y-auto z-50">
                    <div className="p-2">
                      <div className="flex items-center justify-between mb-2 px-2">
                        <div className="text-sm font-medium text-foreground">Prompt Templates</div>
                      </div>
                      {loadingTemplates ? (
                        <div className="flex items-center px-2 py-4 text-sm text-muted-foreground">
                          <Loader2 size={16} className="mr-2 animate-spin" />
                          Loading templates...
                        </div>
                      ) : templates.length > 0 ? (
                        <div className="space-y-1">
                          {templates.map((template, index) => (
                            <div key={index} className="group relative">
                              <button
                                className="w-full text-left px-2 py-2 text-sm hover:bg-muted rounded pr-16"
                                onClick={() => handleTemplateSelect(template)}
                                title={template.name || `Template ${index + 1}`}
                              >
                                <div className="text-foreground line-clamp-3 whitespace-pre-wrap text-xs leading-relaxed">
                                  {(template.content || template.template || '').substring(0, 200)}
                                  {(template.content || template.template || '').length > 200 ? '...' : ''}
                                </div>
                                {template.name && (
                                  <div className="text-xs text-muted-foreground truncate mt-1 font-medium">
                                    {template.name}
                                  </div>
                                )}
                              </button>

                              {/* Action buttons */}
                              <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={(e) => handleTemplateEdit(e, template)}
                                  className="p-1 hover:bg-muted-foreground/10 rounded text-muted-foreground hover:text-foreground transition-colors"
                                  title="Edit template"
                                >
                                  <Edit size={12} />
                                </button>
                                <button
                                  onClick={(e) => handleTemplateDelete(e, template)}
                                  className="p-1 hover:bg-destructive/10 rounded text-muted-foreground hover:text-destructive transition-colors"
                                  title="Delete template"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground px-2 py-2">
                          No custom templates found.
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <AutocompleteDropdown
              items={autocomplete.items}
              selectedIndex={autocomplete.selectedIndex}
              onSelect={autocomplete.selectItem}
              onClose={autocomplete.hideAutocomplete}
              position={autocomplete.position}
              visible={autocomplete.isVisible}
              onRefresh={() => {
                // Trigger autocomplete refresh by re-checking current position
                if (textareaRef.current) {
                  const cursorPos = textareaRef.current.selectionStart;
                  autocomplete.checkForAutocomplete(message, cursorPos);
                }
              }}
            />
          </div>


          {isStreaming || isThinking || currentOperation !== null ? (
            <Button
              variant="destructive"
              size="icon"
              onClick={handleStopGeneration}
              disabled={false}
              className="h-[44px] w-[44px] rounded-lg flex items-center justify-center"
            >
              <StopCircle size={18} />
            </Button>
          ) : (
            <Button
              onClick={handleSendMessage}
              disabled={!message.trim() || disabled}
              size="icon"
              className="h-[44px] w-[44px] rounded-lg flex items-center justify-center"
            >
              <Send size={18} />
            </Button>
          )}
        </div>
      </div>

      {/* Template Edit Modal */}
      {editingTemplate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100]">
          <div className="bg-card border border-border rounded-lg shadow-lg w-full max-w-2xl mx-4">
            <div className="p-4 border-b border-border">
              <h3 className="text-lg font-medium text-foreground">
                Edit Template: {editingTemplate.name || 'Untitled'}
              </h3>
            </div>
            <div className="p-4">
              <Textarea
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                placeholder="Enter template content..."
                className="min-h-[200px] resize-none"
                autoFocus
              />
            </div>
            <div className="p-4 border-t border-border flex justify-end gap-2">
              <Button
                variant="ghost"
                onClick={handleCancelTemplateEdit}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSaveTemplateEdit}
                disabled={editContent.trim() === ''}
              >
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

MessageInput.displayName = 'MessageInput';