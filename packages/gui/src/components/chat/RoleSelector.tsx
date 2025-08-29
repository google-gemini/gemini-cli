import React, { useEffect, useState } from 'react';
import { Check, User, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader } from '@/components/ui/Card';
import { useAppStore } from '@/stores/appStore';
import { multiModelService } from '@/services/multiModelService';
import { cn } from '@/utils/cn';
import type { RoleDefinition } from '@/types';

interface RoleSelectorProps {
  onClose: () => void;
}

export const RoleSelector: React.FC<RoleSelectorProps> = ({ onClose }) => {
  const {
    currentRole,
    builtinRoles,
    customRoles,
    setCurrentRole
  } = useAppStore();
  
  const [roles, setRoles] = useState<RoleDefinition[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const allRoles = multiModelService.getAllRoles();
    setRoles(allRoles);
  }, [builtinRoles, customRoles]);

  const handleRoleSelect = async (roleId: string) => {
    if (roleId === currentRole) {
      onClose();
      return;
    }

    setLoading(true);
    try {
      const success = await multiModelService.switchRole(roleId);
      if (success) {
        setCurrentRole(roleId);
        // Optimize toolset for the new role
        multiModelService.optimizeToolsetForCurrentRole();
        onClose();
      }
    } catch (error) {
      console.error('Failed to switch role:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRoleIcon = (roleId: string) => {
    const iconMap: Record<string, string> = {
      software_engineer: '💻',
      office_assistant: '📊',
      translator: '🌐',
      creative_writer: '✍️',
      data_analyst: '📈'
    };
    return iconMap[roleId] || '🤖';
  };

  const builtinRolesList = roles.filter(role => role.isBuiltin);
  const customRolesList = roles.filter(role => !role.isBuiltin);

  return (
    <Card className="w-80 shadow-lg">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold">Select Role</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            ×
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Built-in Roles */}
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-muted-foreground">Built-in Roles</h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {builtinRolesList.map((role) => (
              <Button
                key={role.id}
                variant="ghost"
                className={cn(
                  "w-full justify-start h-auto p-3",
                  currentRole === role.id && "bg-accent"
                )}
                onClick={() => handleRoleSelect(role.id)}
                disabled={loading}
              >
                <div className="flex items-center gap-3 w-full">
                  <span className="text-lg">{getRoleIcon(role.id)}</span>
                  <div className="text-left flex-1 min-w-0">
                    <div className="font-medium text-sm">{role.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {role.description}
                    </div>
                  </div>
                  {currentRole === role.id && (
                    <Check size={14} className="text-primary flex-shrink-0" />
                  )}
                </div>
              </Button>
            ))}
          </div>
        </div>

        {/* Custom Roles */}
        {customRolesList.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-muted-foreground">Custom Roles</h4>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {customRolesList.map((role) => (
                <Button
                  key={role.id}
                  variant="ghost"
                  className={cn(
                    "w-full justify-start h-auto p-3",
                    currentRole === role.id && "bg-accent"
                  )}
                  onClick={() => handleRoleSelect(role.id)}
                  disabled={loading}
                >
                  <div className="flex items-center gap-3 w-full">
                    <User size={16} className="text-muted-foreground flex-shrink-0" />
                    <div className="text-left flex-1 min-w-0">
                      <div className="font-medium text-sm">{role.name}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {role.description}
                      </div>
                    </div>
                    {currentRole === role.id && (
                      <Check size={14} className="text-primary flex-shrink-0" />
                    )}
                  </div>
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Add Custom Role */}
        <div className="pt-2 border-t border-border">
          <Button
            variant="ghost"
            className="w-full justify-start gap-3 h-auto p-3"
          >
            <Plus size={16} />
            <span className="text-sm">Create Custom Role</span>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};