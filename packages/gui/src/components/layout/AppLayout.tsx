import React, { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ChatArea } from './ChatArea';
import { useAppStore } from '@/stores/appStore';
import { multiModelService } from '@/services/multiModelService';
import { cn } from '@/utils/cn';

export const AppLayout: React.FC = () => {
  const { sidebarCollapsed, setCurrentProvider, setCurrentModel } = useAppStore();

  useEffect(() => {
    // Load available models and roles after MultiModelService is initialized
    const loadSystemData = async () => {
      try {
        // Load available models
        const models = await multiModelService.getAvailableModels();
        useAppStore.setState({ availableModels: models });

        // Load roles (all roles are mixed, we'll need to enhance the service to separate them)
        const roles = await multiModelService.getAllRolesAsync();
        // For now, assume roles with common IDs are builtin
        const builtinRoleIds = ['software_engineer', 'office_assistant', 'translator', 'creative_writer', 'data_analyst'];
        const builtinRoles = roles.filter(role => builtinRoleIds.includes(role.id));
        const customRoles = roles.filter(role => !builtinRoleIds.includes(role.id));
        
        useAppStore.setState({
          builtinRoles,
          customRoles
        });

        // Set default role if none is set
        const currentRole = useAppStore.getState().currentRole;
        if (!currentRole && roles.length > 0) {
          const defaultRole = roles.find(r => r.id === 'software_engineer') || roles[0];
          await multiModelService.switchRole(defaultRole.id);
          useAppStore.setState({ currentRole: defaultRole.id });
        }

      } catch (error) {
        console.error('Failed to load system data:', error);
      }
    };

    // Wait a bit for MultiModelService to be initialized
    setTimeout(loadSystemData, 1000);
  }, [setCurrentProvider, setCurrentModel]);

  return (
    <div className="flex h-screen bg-background text-foreground">
      <Sidebar />
      <div className={cn(
        "flex-1 flex flex-col transition-all duration-300 ease-in-out",
        sidebarCollapsed ? "ml-16" : "ml-80"
      )}>
        <Header />
        <ChatArea />
      </div>
    </div>
  );
};