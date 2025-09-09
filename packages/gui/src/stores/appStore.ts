import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ModelProviderType } from '@/types';
import type { 
  AppState,
  ChatSession, 
  WorkspaceConfig, 
  AuthConfig,
  Language,
  ThemeMode,
  RoleDefinition
} from '@/types';

interface AppStore extends AppState {
  // Actions
  setActiveSession: (sessionId: string | null) => void;
  addSession: (session: ChatSession) => void;
  updateSession: (sessionId: string, updates: Partial<ChatSession>) => void;
  removeSession: (sessionId: string) => void;
  clearAllSessions: () => void;
  
  setCurrentProvider: (provider: ModelProviderType) => void;
  setCurrentModel: (model: string) => void;
  updateAuthConfig: (config: Partial<AuthConfig>) => void;
  syncOAuthStatus: () => Promise<void>;
  
  setCurrentWorkspace: (workspace: WorkspaceConfig | null) => void;
  addWorkspace: (workspace: WorkspaceConfig) => void;
  updateWorkspace: (workspaceId: string, updates: Partial<WorkspaceConfig>) => void;
  removeWorkspace: (workspaceId: string) => void;
  
  setLanguage: (language: Language) => void;
  setTheme: (theme: ThemeMode) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  
  setCurrentRole: (roleId: string) => void;
  addCustomRole: (role: RoleDefinition) => void;
  removeCustomRole: (roleId: string) => void;
  setBuiltinRoles: (roles: RoleDefinition[]) => void;
  
  setInitialized: (initialized: boolean) => void;
  
  // Note: Template management moved to backend system via multiModelService
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      // Initial state
      sessions: [],
      activeSessionId: null,
      currentProvider: ModelProviderType.LM_STUDIO,
      currentModel: 'openai/gpt-oss-20b',
      authConfig: {},
      currentWorkspace: null,
      workspaces: [],
      language: 'en',
      theme: 'system',
      sidebarCollapsed: false,
      initialized: false,
      currentRole: 'software_engineer',
      customRoles: [],
      builtinRoles: [],

      // Actions
      setActiveSession: (sessionId: string | null) =>
        set({ activeSessionId: sessionId }),

      addSession: (session: ChatSession) =>
        set((state) => ({
          sessions: [session, ...state.sessions],
          activeSessionId: session.id,
        })),

      updateSession: (sessionId: string, updates: Partial<ChatSession>) =>
        set((state) => ({
          sessions: state.sessions.map((session) =>
            session.id === sessionId ? { ...session, ...updates } : session
          ),
        })),

      removeSession: (sessionId: string) =>
        set((state) => ({
          sessions: state.sessions.filter((session) => session.id !== sessionId),
          activeSessionId:
            state.activeSessionId === sessionId ? null : state.activeSessionId,
        })),

      clearAllSessions: () =>
        set({
          sessions: [],
          activeSessionId: null,
        }),

      setCurrentProvider: (provider: ModelProviderType) =>
        set({ currentProvider: provider }),

      setCurrentModel: (model: string) =>
        set({ currentModel: model }),

      updateAuthConfig: (config: Partial<AuthConfig>) =>
        set((state) => ({
          authConfig: { ...state.authConfig, ...config },
        })),

      syncOAuthStatus: async () => {
        try {
          const { multiModelService } = await import('@/services/multiModelService');
          const oauthStatus = await multiModelService.getOAuthStatus('gemini');
          
          // Update auth config based on OAuth status
          const currentState = useAppStore.getState();
          const currentGeminiConfig = currentState.authConfig.gemini;
          
          if (oauthStatus.authenticated) {
            // If OAuth is authenticated but config doesn't reflect it, update
            if (!currentGeminiConfig || currentGeminiConfig.type !== 'oauth') {
              useAppStore.getState().updateAuthConfig({
                gemini: {
                  type: 'oauth',
                  oauthToken: 'authenticated'
                }
              });
            }
          } else {
            // If OAuth is not authenticated but config shows it is, reset to api_key
            if (currentGeminiConfig && currentGeminiConfig.type === 'oauth') {
              useAppStore.getState().updateAuthConfig({
                gemini: {
                  type: 'api_key',
                  oauthToken: undefined
                }
              });
            }
          }
        } catch (error) {
          console.error('Failed to sync OAuth status:', error);
        }
      },

      setCurrentWorkspace: (workspace: WorkspaceConfig | null) =>
        set({ currentWorkspace: workspace }),

      addWorkspace: (workspace: WorkspaceConfig) =>
        set((state) => ({
          workspaces: [...state.workspaces, workspace],
        })),

      updateWorkspace: (workspaceId: string, updates: Partial<WorkspaceConfig>) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === workspaceId ? { ...workspace, ...updates } : workspace
          ),
          currentWorkspace:
            state.currentWorkspace?.id === workspaceId
              ? { ...state.currentWorkspace, ...updates }
              : state.currentWorkspace,
        })),

      removeWorkspace: (workspaceId: string) =>
        set((state) => ({
          workspaces: state.workspaces.filter((w) => w.id !== workspaceId),
          currentWorkspace:
            state.currentWorkspace?.id === workspaceId
              ? null
              : state.currentWorkspace,
        })),

      setLanguage: (language: Language) =>
        set({ language }),

      setTheme: (theme: ThemeMode) =>
        set({ theme }),

      setSidebarCollapsed: (collapsed: boolean) =>
        set({ sidebarCollapsed: collapsed }),

      setCurrentRole: (roleId: string) =>
        set({ currentRole: roleId }),

      addCustomRole: (role: RoleDefinition) =>
        set((state) => ({
          customRoles: [...state.customRoles, role],
        })),

      removeCustomRole: (roleId: string) =>
        set((state) => ({
          customRoles: state.customRoles.filter((role) => role.id !== roleId),
        })),

      setBuiltinRoles: (roles: RoleDefinition[]) =>
        set({ builtinRoles: roles }),

      setInitialized: (initialized: boolean) =>
        set({ initialized }),

      // Note: Template management moved to backend system via multiModelService
    }),
    {
      name: 'gemini-cli-gui',
      partialize: (state) => ({
        language: state.language,
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        authConfig: state.authConfig,
        workspaces: state.workspaces,
        currentWorkspace: state.currentWorkspace,
        customRoles: state.customRoles,
        currentRole: state.currentRole,
        currentProvider: state.currentProvider,
        currentModel: state.currentModel,
      }),
    }
  )
);