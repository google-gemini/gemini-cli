/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type React from 'react';
import { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Colors } from '../colors.js';
import { useKeypress } from '../hooks/useKeypress.js';
import type { ToolPermission } from '../../services/PermissionService.js';
import { PermissionService } from '../../services/PermissionService.js';
import type { Config } from '@google/gemini-cli-core';

interface PermissionsDialogProps {
  config: Config;
  onClose: () => void;
}

interface PermissionGroup {
  type: string;
  name: string;
  permissions: ToolPermission[];
}

export function PermissionsDialog({
  config,
  onClose,
}: PermissionsDialogProps): React.JSX.Element {
  const [permissionService] = useState(
    () => new PermissionService(config, config.getPermissionRepository()),
  );
  const [permissions, setPermissions] = useState<ToolPermission[]>([]);
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>(
    [],
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedPermissionIndex, setSelectedPermissionIndex] = useState(0);
  const [focusSection, setFocusSection] = useState<'groups' | 'permissions'>(
    'groups',
  );
  const [loading, setLoading] = useState(true);

  // Load permissions on mount
  useEffect(() => {
    const loadPermissions = async () => {
      setLoading(true);
      try {
        const allPermissions = await permissionService.getAllPermissions();
        setPermissions(allPermissions);

        // Group permissions by type
        const groups: PermissionGroup[] = [
          {
            type: 'shell',
            name: 'Shell Commands',
            permissions: allPermissions.filter((p) => p.type === 'shell'),
          },
          {
            type: 'mcp',
            name: 'MCP Tools',
            permissions: allPermissions.filter((p) =>
              p.type.startsWith('mcp_'),
            ),
          },
          {
            type: 'memory',
            name: 'Memory Operations',
            permissions: allPermissions.filter((p) => p.type === 'memory'),
          },
          {
            type: 'global',
            name: 'Global Settings',
            permissions: allPermissions.filter((p) => p.type === 'global'),
          },
        ];

        setPermissionGroups(groups);
      } catch (error) {
        console.error('Failed to load permissions:', error);
      }
      setLoading(false);
    };

    loadPermissions();
  }, [permissionService]);

  const handleResetAll = async () => {
    try {
      await permissionService.resetAllPermissions();
      reloadPermissions();
    } catch (error) {
      console.error('Failed to reset permissions:', error);
    }
  };

  const handleResetByType = async (type: string) => {
    try {
      await permissionService.resetPermissionsByType(type);
      await reloadPermissions();
    } catch (error) {
      console.error('Failed to reset permissions by type:', error);
    }
  };

  const handleResetIndividualPermission = async (permissionId: string) => {
    try {
      await permissionService.resetPermission(permissionId);
      await reloadPermissions();
    } catch (error) {
      console.error('Failed to reset individual permission:', error);
    }
  };

  const reloadPermissions = async () => {
    const allPermissions = await permissionService.getAllPermissions();
    setPermissions(allPermissions);

    // Regroup permissions
    const groups: PermissionGroup[] = [
      {
        type: 'shell',
        name: 'Shell Commands',
        permissions: allPermissions.filter((p) => p.type === 'shell'),
      },
      {
        type: 'mcp',
        name: 'MCP Tools',
        permissions: allPermissions.filter((p) => p.type.startsWith('mcp_')),
      },
      {
        type: 'memory',
        name: 'Memory Operations',
        permissions: allPermissions.filter((p) => p.type === 'memory'),
      },
      {
        type: 'global',
        name: 'Global Settings',
        permissions: allPermissions.filter((p) => p.type === 'global'),
      },
    ];

    setPermissionGroups(groups);

    // Reset selection if current selection is out of bounds
    const currentGroup = groups[selectedIndex];
    if (
      currentGroup &&
      selectedPermissionIndex >= currentGroup.permissions.length
    ) {
      setSelectedPermissionIndex(
        Math.max(0, currentGroup.permissions.length - 1),
      );
    }
  };

  useKeypress(
    (key) => {
      const { name } = key;

      if (name === 'escape') {
        onClose();
      } else if (name === 'tab') {
        setFocusSection((prev) =>
          prev === 'groups' ? 'permissions' : 'groups',
        );
      } else if (focusSection === 'groups') {
        if (name === 'up' || name === 'k') {
          setSelectedIndex((prev) => {
            const newIndex = Math.max(0, prev - 1);
            setSelectedPermissionIndex(0);
            return newIndex;
          });
        } else if (name === 'down' || name === 'j') {
          setSelectedIndex((prev) => {
            const newIndex = Math.min(permissionGroups.length - 1, prev + 1);
            setSelectedPermissionIndex(0);
            return newIndex;
          });
        } else if (name === 'r') {
          const selectedGroup = permissionGroups[selectedIndex];
          if (selectedGroup && selectedGroup.permissions.length > 0) {
            handleResetByType(
              selectedGroup.type === 'mcp' ? 'mcp' : selectedGroup.type,
            );
          }
        }
      } else if (focusSection === 'permissions') {
        const currentGroup = permissionGroups[selectedIndex];
        if (currentGroup && currentGroup.permissions.length > 0) {
          if (name === 'up' || name === 'k') {
            setSelectedPermissionIndex((prev) => Math.max(0, prev - 1));
          } else if (name === 'down' || name === 'j') {
            setSelectedPermissionIndex((prev) =>
              Math.min(currentGroup.permissions.length - 1, prev + 1),
            );
          } else if (name === 'r') {
            const selectedPermission =
              currentGroup.permissions[selectedPermissionIndex];
            if (selectedPermission) {
              handleResetIndividualPermission(selectedPermission.id);
            }
          }
        }
      }

      // Global actions available from any section
      if (key.sequence === 'A' || (key.shift && name === 'a')) {
        handleResetAll();
      }
    },
    { isActive: true },
  );

  if (loading) {
    return (
      <Box
        borderStyle="round"
        borderColor={Colors.Gray}
        flexDirection="column"
        padding={1}
        width="100%"
        height="100%"
      >
        <Text bold color={Colors.AccentBlue}>
          Tool Permissions
        </Text>
        <Box height={1} />
        <Text>Loading permissions...</Text>
      </Box>
    );
  }

  const totalPermissions = permissions.length;

  return (
    <Box
      borderStyle="round"
      borderColor={Colors.Gray}
      flexDirection="column"
      padding={1}
      width="100%"
      height="100%"
    >
      <Text bold color={Colors.AccentBlue}>
        Tool Permissions
      </Text>
      <Box height={1} />

      {totalPermissions === 0 ? (
        <Text color={Colors.Gray}>
          No &quot;Always Allow&quot; permissions are currently granted.
        </Text>
      ) : (
        <>
          <Text color={Colors.Gray}>
            Total granted permissions: {totalPermissions}
          </Text>
          <Box height={1} />

          {/* Permission Groups */}
          <Box flexDirection="column">
            <Text bold={focusSection === 'groups'} color={Colors.AccentGreen}>
              {focusSection === 'groups' ? '> ' : '  '}Permission Groups:
            </Text>
            {permissionGroups.map((group, index) => (
              <Box key={group.type} flexDirection="row" alignItems="center">
                <Box minWidth={2} flexShrink={0}>
                  <Text
                    color={
                      focusSection === 'groups' && selectedIndex === index
                        ? Colors.AccentGreen
                        : Colors.Gray
                    }
                  >
                    {focusSection === 'groups' && selectedIndex === index
                      ? '●'
                      : ''}
                  </Text>
                </Box>
                <Text
                  color={
                    focusSection === 'groups' && selectedIndex === index
                      ? Colors.AccentGreen
                      : Colors.Foreground
                  }
                >
                  {group.name} ({group.permissions.length})
                </Text>
              </Box>
            ))}
          </Box>

          <Box height={1} />

          {/* Individual Permissions */}
          {permissionGroups[selectedIndex] && (
            <Box flexDirection="column">
              <Text
                bold={focusSection === 'permissions'}
                color={Colors.AccentCyan}
              >
                {focusSection === 'permissions' ? '> ' : '  '}
                {permissionGroups[selectedIndex].name}:
              </Text>
              {permissionGroups[selectedIndex].permissions.length === 0 ? (
                <Text color={Colors.Gray}>No permissions granted.</Text>
              ) : (
                permissionGroups[selectedIndex].permissions.map(
                  (permission, index) => (
                    <Box
                      key={permission.id}
                      flexDirection="row"
                      marginLeft={2}
                      alignItems="flex-start"
                    >
                      <Box minWidth={2} flexShrink={0}>
                        <Text
                          color={
                            focusSection === 'permissions' &&
                            selectedPermissionIndex === index
                              ? Colors.AccentCyan
                              : Colors.Gray
                          }
                        >
                          {focusSection === 'permissions' &&
                          selectedPermissionIndex === index
                            ? '●'
                            : ''}
                        </Text>
                      </Box>
                      <Box flexDirection="column" flexGrow={1}>
                        <Text
                          color={
                            focusSection === 'permissions' &&
                            selectedPermissionIndex === index
                              ? Colors.AccentCyan
                              : Colors.Foreground
                          }
                        >
                          {permission.name}
                        </Text>
                        <Text color={Colors.Gray} wrap="wrap">
                          {permission.description}
                        </Text>
                        <Box height={1} />
                      </Box>
                    </Box>
                  ),
                )
              )}
            </Box>
          )}
        </>
      )}

      <Box marginTop={1} flexDirection="column">
        <Text color={Colors.Gray}>
          Press &apos;r&apos; to reset selected group/permission
        </Text>
        <Text color={Colors.Gray}>
          Press &apos;A&apos; to reset ALL permissions
        </Text>
        <Text color={Colors.Gray}>
          (Tab to switch view, ↑↓ to navigate, Esc to close)
        </Text>
      </Box>
    </Box>
  );
}
