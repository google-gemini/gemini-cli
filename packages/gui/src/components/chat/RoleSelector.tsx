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
  const [switching, setSwitching] = useState(false);

  useEffect(() => {
    let isMounted = true; // Prevent state updates if component is unmounted
    
    const loadRoles = async () => {
      try {
        if (isMounted) {
          setLoading(true);
        }
        const allRoles = await multiModelService.getAllRolesAsync();
        if (isMounted) {
          setRoles(allRoles);
        }
      } catch (error) {
        console.error('Failed to load roles:', error);
        // Fallback to store data if available
        if (isMounted) {
          const storeRoles = [...builtinRoles, ...customRoles];
          setRoles(storeRoles);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };
    
    // Only load roles once when component mounts, don't reload on store changes
    loadRoles();

    return () => {
      isMounted = false;
    };
  }, []); // Remove builtinRoles, customRoles from dependencies to prevent unnecessary reloads

  const handleRoleSelect = async (roleId: string) => {
    if (roleId === currentRole) {
      onClose();
      return;
    }

    // Prevent duplicate calls
    if (switching || loading) {
      console.log('Role switch already in progress, ignoring duplicate call');
      return;
    }

    setSwitching(true);
    setLoading(true);
    try {
      const success = await multiModelService.switchRole(roleId);
      if (success) {
        setCurrentRole(roleId);
        onClose();
      }
    } catch (error) {
      console.error('Failed to switch role:', error);
    } finally {
      setSwitching(false);
      setLoading(false);
    }
  };

  const getRoleIcon = (roleId: string) => {
    const role = roles.find(r => r.id === roleId);
    if (role?.icon) {
      return role.icon;
    }
    
    // Fallback icon map for backward compatibility
    const iconMap: Record<string, string> = {
      software_engineer: '💻',
      office_assistant: '📊',
      translator: '🌐',
      creative_writer: '✍️',
      data_analyst: '📈'
    };
    return iconMap[roleId] || '🤖';
  };

  const builtinRolesList = roles.filter(role => role.isBuiltin !== false);
  const customRolesList = roles.filter(role => role.isBuiltin === false);

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
        {loading && (
          <div className="text-center py-4">
            <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
            <p className="mt-2 text-sm text-muted-foreground">Loading roles...</p>
          </div>
        )}
        
        {!loading && roles.length === 0 && (
          <div className="text-center py-4">
            <p className="text-sm text-muted-foreground">No roles available</p>
          </div>
        )}
        
        {!loading && roles.length > 0 && (
          <>
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
                    disabled={loading || switching}
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
                      disabled={loading || switching}
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
          </>
        )}
      </CardContent>
    </Card>
  );
};