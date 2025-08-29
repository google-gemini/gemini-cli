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
  RoleDefinition,
  PresetTemplate 
} from '@/types';

interface AppStore extends AppState {
  // Actions
  setActiveSession: (sessionId: string | null) => void;
  addSession: (session: ChatSession) => void;
  updateSession: (sessionId: string, updates: Partial<ChatSession>) => void;
  removeSession: (sessionId: string) => void;
  
  setCurrentProvider: (provider: ModelProviderType) => void;
  setCurrentModel: (model: string) => void;
  updateAuthConfig: (config: Partial<AuthConfig>) => void;
  
  setCurrentWorkspace: (workspace: WorkspaceConfig | null) => void;
  addWorkspace: (workspace: WorkspaceConfig) => void;
  removeWorkspace: (workspaceId: string) => void;
  
  setLanguage: (language: Language) => void;
  setTheme: (theme: ThemeMode) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  
  setCurrentRole: (roleId: string) => void;
  addCustomRole: (role: RoleDefinition) => void;
  removeCustomRole: (roleId: string) => void;
  
  addTemplate: (template: PresetTemplate) => void;
  removeTemplate: (templateId: string) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      // Initial state
      sessions: [],
      activeSessionId: null,
      currentProvider: ModelProviderType.GEMINI,
      currentModel: 'gemini-1.5-pro-latest',
      authConfig: {},
      availableModels: {},
      currentWorkspace: null,
      workspaces: [],
      language: 'en',
      theme: 'system',
      sidebarCollapsed: false,
      currentRole: 'software_engineer',
      customRoles: [],
      builtinRoles: [],
      templates: [],

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

      setCurrentProvider: (provider: ModelProviderType) =>
        set({ currentProvider: provider }),

      setCurrentModel: (model: string) =>
        set({ currentModel: model }),

      updateAuthConfig: (config: Partial<AuthConfig>) =>
        set((state) => ({
          authConfig: { ...state.authConfig, ...config },
        })),

      setCurrentWorkspace: (workspace: WorkspaceConfig | null) =>
        set({ currentWorkspace: workspace }),

      addWorkspace: (workspace: WorkspaceConfig) =>
        set((state) => ({
          workspaces: [...state.workspaces, workspace],
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

      addTemplate: (template: PresetTemplate) =>
        set((state) => ({
          templates: [...state.templates, template],
        })),

      removeTemplate: (templateId: string) =>
        set((state) => ({
          templates: state.templates.filter((t) => t.id !== templateId),
        })),
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